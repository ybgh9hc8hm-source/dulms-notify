select cron.schedule(
  'dulms-credential-recovery',
  '0 9 * * 0',
  $$
  select net.http_post(
    url := 'https://dulms-notify.lovable.app/api/public/hooks/recover',
    headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(select value from public.app_settings where key = 'cron_secret')),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);