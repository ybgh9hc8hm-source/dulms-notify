SELECT cron.unschedule('dulms-heartbeat');
SELECT cron.schedule(
  'dulms-heartbeat',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/heartbeat?limit=60&stale=90&lock=180&concurrency=6',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  )
  $$
);