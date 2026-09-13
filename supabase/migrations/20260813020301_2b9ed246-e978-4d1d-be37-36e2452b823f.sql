DO $$
DECLARE
  job record;
  cron_secret text := encode(gen_random_bytes(32), 'hex');
BEGIN
  INSERT INTO public.app_settings (key, value)
  VALUES ('cron_secret', cron_secret)
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

  FOR job IN SELECT jobid FROM cron.job WHERE jobname IN ('dulms-sync-realtime', 'dulms-sync-every-2-min', 'dulms-sync-every-15-min')
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'dulms-sync-realtime',
    '*/2 * * * *',
    format($cron$
      SELECT net.http_post(
        url := 'https://project--27fa8a61-8958-47cb-b021-dec9e3218ade-dev.lovable.app/api/public/hooks/sync',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cron-secret', (SELECT value FROM public.app_settings WHERE key = 'cron_secret')
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
    $cron$)
  );
END $$;

REVOKE ALL ON FUNCTION public.claim_check_batch(integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_rate_budget(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.health_window_stats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prune_dead_clusters(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_health_samples(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_notification_events(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_sync_ephemera(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.rate_budget_used() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_check_batch(integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_rate_budget(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.health_window_stats(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.prune_dead_clusters(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_health_samples(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_notification_events(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_sync_ephemera(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.rate_budget_used() TO service_role;