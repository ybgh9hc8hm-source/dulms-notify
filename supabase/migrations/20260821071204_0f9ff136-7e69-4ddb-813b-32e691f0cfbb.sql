CREATE OR REPLACE FUNCTION public.admin_overview_stats(p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with acc as (
    select
      count(*)::int as accounts,
      count(*) filter (where sync_enabled)::int as sync_enabled,
      count(*) filter (where telegram_chat_id is not null)::int as bot_users,
      count(*) filter (where last_sync_status = 'error' or check_failures > 0)::int as failing
    from public.dulms_accounts
  ),
  b as (
    select key, coalesce(nullif(btrim(coalesce(profile ->> key, '')), ''), 'غير محدد') as label
    from public.dulms_accounts,
         unnest(array['faculty','program','level','status']) as key
  ),
  bk as (
    select key, label, count(*)::int as count from b group by key, label
  )
  select jsonb_build_object(
    'users', (select count(*)::int from public.profiles),
    'accounts', (select accounts from acc),
    'syncEnabled', (select sync_enabled from acc),
    'botUsers', (select bot_users from acc),
    'failingAccounts', (select failing from acc),
    'items', (select count(*)::int from public.dulms_items where archived_at is null),
    'itemsArchived', (select count(*)::int from public.dulms_items where archived_at is not null),
    'notifications24h', (select count(*)::int from public.notifications where created_at >= p_since),
    'syncErrors24h', (select count(*)::int from public.sync_logs where status = 'error' and created_at >= p_since),
    'breakdown', (
      select coalesce(jsonb_object_agg(key, arr), '{}'::jsonb) from (
        select key, jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc) as arr
        from bk group by key
      ) g
    )
  );
$function$;

CREATE OR REPLACE FUNCTION public.slo_stats(p_since timestamp with time zone)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      count(*) filter (where status = 'sent' and created_at >= p_since)::int as sent,
      count(*) filter (where status = 'dead')::int as dead,
      count(*) filter (where status = 'pending')::int as pending
    from public.notification_outbox
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
$function$;