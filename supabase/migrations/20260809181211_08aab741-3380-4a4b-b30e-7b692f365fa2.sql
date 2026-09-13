alter table public.dulms_accounts add column if not exists check_failures integer not null default 0;

create or replace function public.claim_check_batch(p_limit integer default 100, p_stale_seconds integer default 60, p_lock_seconds integer default 120)
returns setof uuid
language sql
security definer
set search_path to 'public'
as $function$
  with candidates as (
    select user_id
    from public.dulms_accounts
    where sync_enabled
      and (last_check_at is null or last_check_at < now() - make_interval(secs => p_stale_seconds))
      and (check_claimed_at is null or check_claimed_at < now() - make_interval(secs => p_lock_seconds))
      -- Exponential backoff for accounts that keep failing (bad password, etc.):
      -- 15, 30, 60 minutes, capped at 60. A healthy account has check_failures = 0.
      and (
        check_failures = 0
        or last_check_at is null
        or last_check_at < now() - make_interval(
             mins => least(60, 15 * power(2, least(greatest(check_failures - 1, 0), 3))::integer)
           )
      )
    order by last_check_at asc nulls first
    limit p_limit
    for update skip locked
  )
  update public.dulms_accounts a
  set check_claimed_at = now()
  from candidates c
  where a.user_id = c.user_id
  returning a.user_id;
$function$;

create or replace function public.prune_dead_clusters(p_days integer default 7, p_min_members integer default 2)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  removed integer;
begin
  with gone as (
    delete from public.content_clusters
    where status = 'candidate'
      and member_count < p_min_members
      and updated_at < now() - make_interval(days => p_days)
    returning id
  )
  select count(*) into removed from gone;
  return removed;
end;
$function$;