ALTER TABLE public.dulms_accounts
  ADD COLUMN IF NOT EXISTS last_notification_id bigint,
  ADD COLUMN IF NOT EXISTS next_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fingerprint_at timestamptz;

CREATE TABLE IF NOT EXISTS public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  dedupe_key text not null,
  section text not null,
  notification_id bigint,
  created_at timestamptz not null default now(),
  unique (dedupe_key)
);

CREATE INDEX IF NOT EXISTS notification_events_user_created_idx
  ON public.notification_events (user_id, created_at desc);

GRANT SELECT ON public.notification_events TO authenticated;
GRANT ALL ON public.notification_events TO service_role;

ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own notification events read" ON public.notification_events;
CREATE POLICY "own notification events read"
  ON public.notification_events FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Claim batch now also honours per-account staggered next_check_at.
CREATE OR REPLACE FUNCTION public.claim_check_batch(p_limit integer DEFAULT 100, p_stale_seconds integer DEFAULT 60, p_lock_seconds integer DEFAULT 120)
 RETURNS SETOF uuid
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with candidates as (
    select user_id
    from public.dulms_accounts
    where sync_enabled
      and (next_check_at is null or next_check_at <= now())
      and (last_check_at is null or last_check_at < now() - make_interval(secs => p_stale_seconds))
      and (check_claimed_at is null or check_claimed_at < now() - make_interval(secs => p_lock_seconds))
      and (
        check_failures = 0
        or last_check_at is null
        or last_check_at < now() - make_interval(
             mins => least(60, 15 * power(2, least(greatest(check_failures - 1, 0), 3))::integer)
           )
      )
    order by next_check_at asc nulls first, last_check_at asc nulls first
    limit p_limit
    for update skip locked
  )
  update public.dulms_accounts a
  set check_claimed_at = now()
  from candidates c
  where a.user_id = c.user_id
  returning a.user_id;
$function$;

CREATE OR REPLACE FUNCTION public.purge_notification_events(p_days integer DEFAULT 14)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare removed integer;
begin
  with gone as (
    delete from public.notification_events
    where created_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$function$;