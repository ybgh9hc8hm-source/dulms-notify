create or replace function public.apply_sentinel_cover(p_user_ids uuid[])
 returns integer
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  promoted integer;
  ids uuid[] := coalesce(p_user_ids, '{}'::uuid[]);
begin
  perform set_config('statement_timeout', '60000', true);

  update public.dulms_accounts
  set sentinel_rank = 9
  where sentinel_rank = 0
    and not (user_id = any(ids));

  with up as (
    update public.dulms_accounts
    set sentinel_rank = 0, cover_selected_at = now()
    where user_id = any(ids)
      and sentinel_rank <> 0
    returning 1
  )
  select count(*)::integer into promoted from up;
  return promoted;
end;
$function$;

revoke all on function public.apply_sentinel_cover(uuid[]) from public, anon, authenticated;
grant execute on function public.apply_sentinel_cover(uuid[]) to service_role;