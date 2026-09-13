SELECT cron.alter_job(
  37,
  command := $$
    select net.http_post(
      url := 'https://dulms-notify.lovable.app/api/public/hooks/heartbeat?limit=200&stale=3&lock=20&concurrency=8&loop=55000',
      headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', (select value from public.app_settings where key='cron_secret')),
      body := '{}'::jsonb,
      timeout_milliseconds := 59000
    );
  $$
);