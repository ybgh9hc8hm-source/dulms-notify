select cron.alter_job(9,  command := $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/sync',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
    $$);
select cron.alter_job(10, command := $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/heartbeat?limit=100&stale=60&lock=120&concurrency=8',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 120000
      )
    $$);
select cron.alter_job(11, command := $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/cluster-analyze',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $$);
select cron.alter_job(12, command := $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/rate-ramp',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $$);
select cron.alter_job(13, command := $$
      SELECT net.http_post(
        url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/load-test',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.app_settings WHERE key = 'cron_secret')),
        body := '{}'::jsonb,
        timeout_milliseconds := 60000
      )
    $$);