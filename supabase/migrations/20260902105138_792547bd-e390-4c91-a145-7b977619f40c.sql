-- 1. Photo storage split out of the hot dulms_accounts row (TOAST bloat: 43 rows = 52 MB).
CREATE TABLE IF NOT EXISTS public.student_photos (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data_url text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.student_photos TO authenticated;
GRANT ALL ON public.student_photos TO service_role;

ALTER TABLE public.student_photos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "students read own photo" ON public.student_photos;
CREATE POLICY "students read own photo"
  ON public.student_photos FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- 2. Backfill, then strip the blob out of the JSON column.
INSERT INTO public.student_photos (user_id, data_url)
SELECT user_id, profile ->> 'photo'
FROM public.dulms_accounts
WHERE coalesce(nullif(btrim(coalesce(profile ->> 'photo', '')), ''), '') <> ''
ON CONFLICT (user_id) DO NOTHING;

UPDATE public.dulms_accounts
SET profile = profile - 'photo'
WHERE profile ? 'photo';

-- 3. One DULMS student id may only be linked to one app account (was unenforced:
--    concurrent linking could create duplicate scrape lanes for the same student).
CREATE UNIQUE INDEX IF NOT EXISTS dulms_accounts_dulms_id_key
  ON public.dulms_accounts (dulms_id);

-- 4. cluster_events had no purge path at all.
CREATE OR REPLACE FUNCTION public.purge_cluster_events(p_days integer DEFAULT 14)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare removed integer;
begin
  with gone as (
    delete from public.cluster_events
    where created_at < now() - make_interval(days => p_days)
    returning 1
  )
  select count(*) into removed from gone;
  return removed;
end;
$function$;

CREATE OR REPLACE FUNCTION public.run_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  result jsonb;
begin
  perform public.purge_sync_ephemera(24);
  result := jsonb_build_object(
    'health_samples', public.purge_health_samples(3),
    'sync_logs', public.purge_old_sync_logs(7),
    'notification_events', public.purge_notification_events(14),
    'dead_clusters', public.prune_dead_clusters(7, 2),
    'cluster_events', public.purge_cluster_events(14),
    'outbox', public.purge_outbox(2)
  );
  delete from public.telegram_link_tokens where expires_at < now() - interval '1 day';
  delete from public.realtime_runs where started_at < now() - interval '2 days';
  return result;
end;
$function$;

-- 5. jobid 34 and 35 were byte-identical minute cron jobs hitting the same lane.
SELECT cron.unschedule(35);