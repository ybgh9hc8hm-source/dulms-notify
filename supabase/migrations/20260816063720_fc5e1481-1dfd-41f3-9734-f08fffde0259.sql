-- ============================================================================
-- Tier-0 "Sentinel Cover": decouple detection cost from cohort size.
--
-- Until now every student paid one DULMS request per detection cycle, so the
-- cadence was O(N): 10k students / 45 req-min = 3.7 hours per round. Shared
-- content (announcements, course material, schedule) is identical for every
-- member of a confirmed cluster, so it only has to be *observed once*. This
-- migration adds the scheduling primitives for three lanes:
--
--   cover lane      - a minimal set of students whose combined clusters cover
--                     every confirmed cluster. Polled fast. Cost = O(clusters).
--   priority lane   - on-demand / event-escalated checks, jump the queue.
--   passenger lane  - everyone else, slow personal sweep for grades/absences.
-- ============================================================================

ALTER TABLE public.dulms_accounts
  ADD COLUMN IF NOT EXISTS sentinel_rank smallint NOT NULL DEFAULT 9,
  ADD COLUMN IF NOT EXISTS check_priority smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_reason text,
  ADD COLUMN IF NOT EXISTS cover_selected_at timestamptz;

COMMENT ON COLUMN public.dulms_accounts.sentinel_rank IS
  '0 = member of the sentinel cover (polled fast, represents clusters); 9 = passenger (slow personal lane, receives shared events by zero-cost fan-out).';
COMMENT ON COLUMN public.dulms_accounts.check_priority IS
  '0 = normal schedule. >0 jumps the queue (on-demand refresh, event escalation). Reset to 0 once the check runs.';

-- Lane indexes: each lane must be able to pick its next N accounts without
-- ever scanning the 10k-row table.
CREATE INDEX IF NOT EXISTS dulms_accounts_cover_lane_idx
  ON public.dulms_accounts (next_check_at NULLS FIRST)
  WHERE sync_enabled AND sentinel_rank = 0;

CREATE INDEX IF NOT EXISTS dulms_accounts_passenger_lane_idx
  ON public.dulms_accounts (next_check_at NULLS FIRST)
  WHERE sync_enabled AND sentinel_rank > 0;

CREATE INDEX IF NOT EXISTS dulms_accounts_priority_lane_idx
  ON public.dulms_accounts (check_priority DESC, next_check_at NULLS FIRST)
  WHERE sync_enabled AND check_priority > 0;

-- Outbox drain at 10k scale: partial index on the exact claim predicate.
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Lane-aware atomic claim. Same skip-locked semantics as claim_check_batch,
-- but a worker asks for a specific lane so the fast cover lane can never be
-- crowded out by 10k passengers sharing one queue.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_check_lane(
  p_lane text DEFAULT 'all',
  p_limit integer DEFAULT 50,
  p_stale_seconds integer DEFAULT 60,
  p_lock_seconds integer DEFAULT 120
)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with candidates as (
    select user_id
    from public.dulms_accounts
    where sync_enabled
      and (
        case p_lane
          when 'priority'  then check_priority > 0
          when 'cover'     then sentinel_rank = 0 and (next_check_at is null or next_check_at <= now())
          when 'passenger' then sentinel_rank > 0 and check_priority = 0
                                and (next_check_at is null or next_check_at <= now())
          else (next_check_at is null or next_check_at <= now())
        end
      )
      and (last_check_at is null or last_check_at < now() - make_interval(secs => p_stale_seconds))
      and (check_claimed_at is null or check_claimed_at < now() - make_interval(secs => p_lock_seconds))
      -- Exponential backoff for accounts that keep failing (bad credentials).
      and (
        check_failures = 0
        or last_check_at is null
        or last_check_at < now() - make_interval(
             mins => least(60, 15 * power(2, least(greatest(check_failures - 1, 0), 3))::integer)
           )
      )
    order by check_priority desc, next_check_at asc nulls first, last_check_at asc nulls first
    limit p_limit
    for update skip locked
  )
  update public.dulms_accounts a
  set check_claimed_at = now()
  from candidates c
  where a.user_id = c.user_id
  returning a.user_id;
$function$;

-- ---------------------------------------------------------------------------
-- Bounded escalation. A shared event can imply personal follow-up (a grade
-- release announcement), but escalating 10k passengers at once would blow the
-- DULMS ceiling. The cap keeps the burst inside what the lane can absorb.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.escalate_checks(
  p_user_ids uuid[],
  p_reason text,
  p_cap integer DEFAULT 100,
  p_priority smallint DEFAULT 1
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  touched integer;
begin
  with picked as (
    select user_id
    from public.dulms_accounts
    where user_id = any(p_user_ids)
      and sync_enabled
      and check_priority = 0
    order by last_check_at asc nulls first
    limit greatest(0, p_cap)
    for update skip locked
  ),
  bumped as (
    update public.dulms_accounts a
    set check_priority = p_priority,
        priority_reason = p_reason,
        next_check_at = now()
    from picked p
    where a.user_id = p.user_id
    returning 1
  )
  select count(*)::integer into touched from bumped;
  return touched;
end;
$function$;

-- ---------------------------------------------------------------------------
-- Sentinel-cover assignment, applied atomically so no student is ever left
-- without a lane (a half-applied cover would silently stop their checks).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_sentinel_cover(p_user_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  promoted integer;
begin
  update public.dulms_accounts
  set sentinel_rank = 9
  where sentinel_rank = 0
    and not (user_id = any(coalesce(p_user_ids, '{}'::uuid[])));

  with up as (
    update public.dulms_accounts
    set sentinel_rank = 0, cover_selected_at = now()
    where user_id = any(coalesce(p_user_ids, '{}'::uuid[]))
    returning 1
  )
  select count(*)::integer into promoted from up;
  return promoted;
end;
$function$;

-- Lane occupancy, for the capacity governor and the admin dashboard.
CREATE OR REPLACE FUNCTION public.lane_stats()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select jsonb_build_object(
    'enabled',    count(*) filter (where sync_enabled)::int,
    'cover',      count(*) filter (where sync_enabled and sentinel_rank = 0)::int,
    'passengers', count(*) filter (where sync_enabled and sentinel_rank > 0)::int,
    'priority',   count(*) filter (where sync_enabled and check_priority > 0)::int,
    'overdue',    count(*) filter (where sync_enabled and next_check_at < now() - interval '10 minutes')::int
  )
  from public.dulms_accounts;
$function$;

REVOKE ALL ON FUNCTION public.claim_check_lane(text, integer, integer, integer) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_checks(uuid[], text, integer, smallint) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_sentinel_cover(uuid[]) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.lane_stats() FROM anon, authenticated;