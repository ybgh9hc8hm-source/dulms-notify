select cron.unschedule('probe-tick') where exists (select 1 from cron.job where jobname = 'probe-tick');

select cron.schedule(
  'probe-tick',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://project--4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app/api/public/hooks/probe',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrY2dqc2xpcXNheXByeGRtd3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTA4NjAsImV4cCI6MjEwMTc4Njg2MH0.xGDR4rTw_UY1pJRIIGDtDEM4A1MwiP6VR0hWO6WYjSo"}'::jsonb,
    body := '{"source":"cron"}'::jsonb
  ) as request_id;
  $$
);