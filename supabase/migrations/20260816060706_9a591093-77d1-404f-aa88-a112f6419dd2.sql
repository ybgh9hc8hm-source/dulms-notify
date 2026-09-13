-- Delivery worker: drains the notification outbox every minute, in parallel
-- with (and independent of) detection.
select cron.schedule(
  'notify-deliver',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://dulms-notify.lovable.app/api/public/hooks/deliver?limit=300',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select value from public.app_settings where key = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);