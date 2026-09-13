DO $$
DECLARE j bigint;
BEGIN
  FOREACH j IN ARRAY ARRAY[9,12,13,20]::bigint[] LOOP
    BEGIN
      PERFORM cron.unschedule(j);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'job % not unscheduled: %', j, SQLERRM;
    END;
  END LOOP;
END $$;