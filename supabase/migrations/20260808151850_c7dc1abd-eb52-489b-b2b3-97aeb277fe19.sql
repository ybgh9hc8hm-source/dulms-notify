
SELECT cron.unschedule('dulms-sync-every-15-min');
SELECT cron.schedule(
  'dulms-sync-every-2-min',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--7e332efe-6e1e-4d7d-bab4-ca53448dfe48-dev.lovable.app/api/public/hooks/sync',
    headers := '{"Content-Type": "application/json", "apikey": "sb_publishable_A_J3Riiuw803ISzVZ97sTA_JWGFbE4m"}'::jsonb,
    body := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
  $$
);
