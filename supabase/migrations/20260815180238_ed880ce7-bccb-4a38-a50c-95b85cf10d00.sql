-- 1) Full-refresh cron: was every 2 minutes for up to 200 students (each ~48 DULMS
--    requests), which consumed the whole 60 req/min ceiling and starved the
--    per-minute change sentinel. Now a low-volume safety net.
SELECT cron.unschedule('dulms-sync-realtime');
SELECT cron.schedule(
  'dulms-sync-safety-net',
  '*/30 * * * *',
  $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/sync?limit=2&stale=7200&concurrency=1',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
  $$
);

-- 2) Diagnostic tooling: no active runs, but the ticks kept firing every minute.
SELECT cron.unschedule('dulms-load-test');
SELECT cron.unschedule('dulms-rate-ramp');
SELECT cron.unschedule('probe-tick');
SELECT cron.schedule(
  'probe-tick',
  '* * * * *',
  $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/probe',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{"source":"cron"}'::jsonb,
        timeout_milliseconds := 60000
      )
  $$
);

-- 3) Close the diagnostic run that has been stuck in "running" since yesterday.
UPDATE public.probe_runs
SET status = 'aborted',
    abort_reason = COALESCE(abort_reason, 'stale run closed during QA'),
    ended_at = COALESCE(ended_at, now())
WHERE status = 'running'
  AND (started_at IS NULL OR started_at < now() - interval '2 hours');