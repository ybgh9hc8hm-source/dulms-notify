select cron.unschedule('dulms-sync-realtime');
select cron.schedule(
  'dulms-sync-realtime',
  '5 seconds',
  $$
  select net.http_post(
    url:='https://project--0c54d736-9b15-42b4-b3fc-493f94187064-dev.lovable.app/api/public/hooks/sync?stale=4&limit=200&concurrency=12',
    headers:='{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJrY2dqc2xpcXNheXByeGRtd3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYyMTA4NjAsImV4cCI6MjEwMTc4Njg2MH0.xGDR4rTw_UY1pJRIIGDtDEM4A1MwiP6VR0hWO6WYjSo"}'::jsonb,
    body:='{}'::jsonb,
    timeout_milliseconds:=120000
  );
  $$
);