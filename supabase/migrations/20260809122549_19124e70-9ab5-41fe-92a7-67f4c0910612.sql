-- 1. Session cache -----------------------------------------------------------
CREATE TABLE public.dulms_sessions (
  dulms_id text PRIMARY KEY,
  cookie_data text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '20 minutes')
);
GRANT ALL ON public.dulms_sessions TO service_role;
ALTER TABLE public.dulms_sessions ENABLE ROW LEVEL SECURITY;
-- no policies: backend (service role) only

-- 2. Change fingerprint on accounts -------------------------------------------
ALTER TABLE public.dulms_accounts
  ADD COLUMN IF NOT EXISTS last_notification_signature text,
  ADD COLUMN IF NOT EXISTS last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS check_claimed_at timestamptz;

-- 3. Shared per-minute request budget -----------------------------------------
CREATE TABLE public.rate_budget (
  window_start timestamptz PRIMARY KEY,
  request_count integer NOT NULL DEFAULT 0
);
GRANT ALL ON public.rate_budget TO service_role;
ALTER TABLE public.rate_budget ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.consume_rate_budget(p_cost integer, p_limit integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  w timestamptz := date_trunc('minute', now());
  used integer;
begin
  insert into public.rate_budget (window_start, request_count)
  values (w, 0)
  on conflict (window_start) do nothing;

  update public.rate_budget
  set request_count = request_count + p_cost
  where window_start = w
    and request_count + p_cost <= p_limit
  returning request_count into used;

  if used is null then
    return false;
  end if;

  delete from public.rate_budget where window_start < w - interval '30 minutes';
  return true;
end;
$$;

CREATE OR REPLACE FUNCTION public.rate_budget_used()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select coalesce((select request_count from public.rate_budget
                   where window_start = date_trunc('minute', now())), 0);
$$;

-- 4. Heartbeat observability ---------------------------------------------------
CREATE TABLE public.heartbeat_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  changed boolean NOT NULL DEFAULT false,
  requests integer NOT NULL DEFAULT 0,
  check_ms integer NOT NULL DEFAULT 0,
  notify_ms integer,
  skipped_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.heartbeat_checks TO authenticated;
GRANT ALL ON public.heartbeat_checks TO service_role;
ALTER TABLE public.heartbeat_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own heartbeat checks read" ON public.heartbeat_checks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX heartbeat_checks_created_idx ON public.heartbeat_checks (created_at DESC);

CREATE OR REPLACE VIEW public.sync_heartbeat_stats
WITH (security_invoker = true) AS
  SELECT date_trunc('minute', created_at) AS minute,
         count(*) AS checks,
         count(*) FILTER (WHERE changed) AS full_pulls,
         count(*) FILTER (WHERE skipped_reason IS NOT NULL) AS skipped,
         round(avg(notify_ms) FILTER (WHERE notify_ms IS NOT NULL)) AS avg_change_to_notify_ms,
         sum(requests) AS requests_used
  FROM public.heartbeat_checks
  GROUP BY 1
  ORDER BY 1 DESC;
GRANT SELECT ON public.sync_heartbeat_stats TO authenticated, service_role;

-- 5. Atomic claim for lightweight checks ---------------------------------------
CREATE OR REPLACE FUNCTION public.claim_check_batch(
  p_limit integer DEFAULT 100,
  p_stale_seconds integer DEFAULT 60,
  p_lock_seconds integer DEFAULT 120)
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with candidates as (
    select user_id
    from public.dulms_accounts
    where sync_enabled
      and (last_check_at is null or last_check_at < now() - make_interval(secs => p_stale_seconds))
      and (check_claimed_at is null or check_claimed_at < now() - make_interval(secs => p_lock_seconds))
    order by last_check_at asc nulls first
    limit p_limit
    for update skip locked
  )
  update public.dulms_accounts a
  set check_claimed_at = now()
  from candidates c
  where a.user_id = c.user_id
  returning a.user_id;
$$;

-- 6. Housekeeping ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_sync_ephemera(p_hours integer DEFAULT 24)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
begin
  delete from public.dulms_sessions where expires_at < now() - interval '1 hour';
  delete from public.heartbeat_checks where created_at < now() - make_interval(hours => p_hours);
end;
$$;