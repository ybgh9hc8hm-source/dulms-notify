ALTER TABLE public.notification_outbox ADD COLUMN IF NOT EXISTS dedupe_key text;
CREATE UNIQUE INDEX IF NOT EXISTS notification_outbox_dedupe_idx ON public.notification_outbox (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.slo_stats(p_since timestamp with time zone)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  with d as (
    select extract(epoch from (sent_at - created_at)) * 1000 as ms
    from public.notification_outbox
    where sent_at is not null and created_at >= p_since
  ),
  n as (
    select notify_ms::double precision as ms
    from public.heartbeat_checks
    where notify_ms is not null and created_at >= p_since
  ),
  q as (
    select
      count(*) filter (where status = 'pending')::int as pending,
      count(*) filter (where status = 'dead')::int as dead,
      count(*) filter (where status = 'sent')::int as sent
    from public.notification_outbox
    where created_at >= p_since
  )
  select jsonb_build_object(
    'deliverySamples', (select count(*)::int from d),
    'deliveryP50', (select percentile_cont(0.5) within group (order by ms) from d),
    'deliveryP95', (select percentile_cont(0.95) within group (order by ms) from d),
    'detectSamples', (select count(*)::int from n),
    'detectP50', (select percentile_cont(0.5) within group (order by ms) from n),
    'detectP95', (select percentile_cont(0.95) within group (order by ms) from n),
    'pending', (select pending from q),
    'dead', (select dead from q),
    'sent', (select sent from q),
    'oldestPendingSeconds', coalesce((
      select extract(epoch from (now() - min(created_at)))::int
      from public.notification_outbox where status = 'pending'
    ), 0)
  );
$$;