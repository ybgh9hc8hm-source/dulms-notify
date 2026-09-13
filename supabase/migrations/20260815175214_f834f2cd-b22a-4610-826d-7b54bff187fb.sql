create or replace function public.admin_overview_stats(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with acc as (
    select
      count(*)::int as users,
      count(*) filter (where sync_enabled)::int as sync_enabled,
      count(*) filter (where telegram_chat_id is not null)::int as bot_users,
      count(*) filter (where last_sync_status = 'error')::int as failing
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
    'users', (select users from acc),
    'syncEnabled', (select sync_enabled from acc),
    'botUsers', (select bot_users from acc),
    'failingAccounts', (select failing from acc),
    'items', (select count(*)::int from public.dulms_items),
    'notifications24h', (select count(*)::int from public.notifications where created_at >= p_since),
    'syncErrors24h', (select count(*)::int from public.sync_logs where status = 'error' and created_at >= p_since),
    'breakdown', (
      select coalesce(jsonb_object_agg(key, arr), '{}'::jsonb) from (
        select key, jsonb_agg(jsonb_build_object('label', label, 'count', count) order by count desc) as arr
        from bk group by key
      ) g
    )
  );
$$;

revoke all on function public.admin_overview_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_overview_stats(timestamptz) to service_role;