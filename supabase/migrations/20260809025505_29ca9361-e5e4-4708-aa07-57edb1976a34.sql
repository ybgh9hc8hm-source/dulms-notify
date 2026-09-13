alter table public.dulms_accounts add column if not exists sync_claimed_at timestamptz;

create index if not exists dulms_accounts_sync_queue_idx
  on public.dulms_accounts (last_sync_at nulls first)
  where sync_enabled;

create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index if not exists dulms_items_user_due_idx
  on public.dulms_items (user_id, due_at);

create index if not exists dulms_items_user_seen_idx
  on public.dulms_items (user_id, first_seen_at desc);

create or replace function public.claim_sync_batch(
  p_limit int default 50,
  p_stale_seconds int default 110,
  p_lock_seconds int default 600
)
returns setof uuid
language sql
security definer
set search_path = public
as $$
  with candidates as (
    select user_id
    from public.dulms_accounts
    where sync_enabled
      and (last_sync_at is null or last_sync_at < now() - make_interval(secs => p_stale_seconds))
      and (sync_claimed_at is null or sync_claimed_at < now() - make_interval(secs => p_lock_seconds))
    order by last_sync_at asc nulls first
    limit p_limit
    for update skip locked
  )
  update public.dulms_accounts a
  set sync_claimed_at = now()
  from candidates c
  where a.user_id = c.user_id
  returning a.user_id;
$$;

revoke all on function public.claim_sync_batch(int, int, int) from public, anon, authenticated;
grant execute on function public.claim_sync_batch(int, int, int) to service_role;

create or replace function public.purge_old_sync_logs(p_days int default 7)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  with gone as (
    delete from public.sync_logs
    where created_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$$;

revoke all on function public.purge_old_sync_logs(int) from public, anon, authenticated;
grant execute on function public.purge_old_sync_logs(int) to service_role;