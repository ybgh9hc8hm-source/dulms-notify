DO $$
DECLARE r record; new_cmd text;
BEGIN
  FOR r IN SELECT jobid, jobname, schedule, command FROM cron.job
           WHERE command LIKE '%-dev.lovable.app%' LOOP
    new_cmd := replace(r.command, '-4fe688c7-bb67-41fe-90ce-391a265a169c-dev.lovable.app', '-4fe688c7-bb67-41fe-90ce-391a265a169c.lovable.app');
    PERFORM cron.unschedule(r.jobid);
    PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
  END LOOP;
END $$;