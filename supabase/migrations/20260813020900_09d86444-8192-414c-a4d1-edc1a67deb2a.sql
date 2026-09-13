DO $$
DECLARE
  job record;
BEGIN
  FOR job IN SELECT jobid FROM cron.job WHERE jobname IN ('dulms-heartbeat', 'dulms-cluster-analyze', 'dulms-rate-ramp', 'dulms-load-test')
  LOOP
    PERFORM cron.unschedule(job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'dulms-heartbeat',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://project--27fa8a61-8958-47cb-b021-dec9e3218ade-dev.lovable.app/api/public/hooks/heartbeat?limit=100&stale=60&lock=120&concurrency=8',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
    $cron$
  );

  PERFORM cron.schedule(
    'dulms-cluster-analyze',
    '*/5 * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://project--27fa8a61-8958-47cb-b021-dec9e3218ade-dev.lovable.app/api/public/hooks/cluster-analyze',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $cron$
  );

  PERFORM cron.schedule(
    'dulms-rate-ramp',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://project--27fa8a61-8958-47cb-b021-dec9e3218ade-dev.lovable.app/api/public/hooks/rate-ramp',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $cron$
  );

  PERFORM cron.schedule(
    'dulms-load-test',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url := 'https://project--27fa8a61-8958-47cb-b021-dec9e3218ade-dev.lovable.app/api/public/hooks/load-test',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $cron$
  );
END $$;