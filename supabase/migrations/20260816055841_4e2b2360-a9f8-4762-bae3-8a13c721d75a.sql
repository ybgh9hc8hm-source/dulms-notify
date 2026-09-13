-- 1) Check-queue index: claim_check_batch orders by next_check_at over sync_enabled rows.
CREATE INDEX IF NOT EXISTS dulms_accounts_check_queue_idx
  ON public.dulms_accounts (next_check_at NULLS FIRST, last_check_at NULLS FIRST)
  WHERE sync_enabled;

CREATE INDEX IF NOT EXISTS heartbeat_checks_user_created_idx
  ON public.heartbeat_checks (user_id, created_at DESC);

-- 2) Delivery outbox: decouples detection from Telegram delivery.
CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  chat_id text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.notification_outbox TO service_role;

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS notification_outbox_queue_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS notification_outbox_created_idx
  ON public.notification_outbox (created_at DESC);

DROP TRIGGER IF EXISTS notification_outbox_touch ON public.notification_outbox;
CREATE TRIGGER notification_outbox_touch
  BEFORE UPDATE ON public.notification_outbox
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

-- 3) Atomic batch claim so many delivery workers can drain in parallel.
CREATE OR REPLACE FUNCTION public.claim_outbox_batch(
  p_limit integer DEFAULT 100,
  p_lock_seconds integer DEFAULT 120
)
RETURNS SETOF public.notification_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with candidates as (
    select id
    from public.notification_outbox
    where status = 'pending'
      and next_attempt_at <= now()
      and (claimed_at is null or claimed_at < now() - make_interval(secs => p_lock_seconds))
    order by next_attempt_at asc
    limit p_limit
    for update skip locked
  )
  update public.notification_outbox o
  set claimed_at = now()
  from candidates c
  where o.id = c.id
  returning o.*;
$$;

-- 4) Keep the outbox small.
CREATE OR REPLACE FUNCTION public.purge_outbox(p_days integer DEFAULT 2)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare removed integer;
begin
  with gone as (
    delete from public.notification_outbox
    where status in ('sent','dead') and created_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

CREATE OR REPLACE FUNCTION public.run_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
declare
  result jsonb;
begin
  perform public.purge_sync_ephemera(24);
  result := jsonb_build_object(
    'health_samples', public.purge_health_samples(3),
    'sync_logs', public.purge_old_sync_logs(7),
    'notification_events', public.purge_notification_events(14),
    'dead_clusters', public.prune_dead_clusters(7, 2),
    'outbox', public.purge_outbox(2)
  );
  delete from public.telegram_link_tokens where expires_at < now() - interval '1 day';
  return result;
end;
$$;