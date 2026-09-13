-- Housekeeping: the purge_* functions existed but nothing ever called them.
create or replace function public.run_maintenance()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  perform public.purge_sync_ephemera(24);
  result := jsonb_build_object(
    'health_samples', public.purge_health_samples(3),
    'sync_logs', public.purge_old_sync_logs(7),
    'notification_events', public.purge_notification_events(14),
    'dead_clusters', public.prune_dead_clusters(7, 2)
  );
  delete from public.telegram_link_tokens where expires_at < now() - interval '1 day';
  return result;
end;
$$;

revoke all on function public.run_maintenance() from public, anon, authenticated;
grant execute on function public.run_maintenance() to service_role;

select cron.unschedule(jobid) from cron.job where jobname = 'dulms-maintenance';
select cron.schedule('dulms-maintenance', '17 * * * *', $$select public.run_maintenance();$$);

-- Clear the backlog that accumulated while nothing was purging.
select public.run_maintenance();