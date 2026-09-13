CREATE TABLE IF NOT EXISTS public.realtime_grants (
  user_id uuid PRIMARY KEY,
  enabled boolean NOT NULL DEFAULT true,
  interval_ms integer NOT NULL DEFAULT 1000,
  note text,
  granted_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.realtime_grants TO authenticated;
GRANT ALL ON public.realtime_grants TO service_role;
ALTER TABLE public.realtime_grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own realtime grant readable" ON public.realtime_grants
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.realtime_runs (
  id bigserial PRIMARY KEY,
  user_id uuid NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  polls integer NOT NULL DEFAULT 0,
  changes integer NOT NULL DEFAULT 0,
  pushed integer NOT NULL DEFAULT 0,
  errors integer NOT NULL DEFAULT 0,
  avg_poll_ms integer,
  detect_ms integer,
  interval_ms integer,
  stop_reason text
);
CREATE INDEX IF NOT EXISTS realtime_runs_started_idx ON public.realtime_runs (started_at DESC);

GRANT ALL ON public.realtime_runs TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.realtime_runs_id_seq TO service_role;
ALTER TABLE public.realtime_runs ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.realtime_lease (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  holder text,
  expires_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.realtime_lease (id, holder, expires_at)
VALUES (true, NULL, now()) ON CONFLICT (id) DO NOTHING;

GRANT ALL ON public.realtime_lease TO service_role;
ALTER TABLE public.realtime_lease ENABLE ROW LEVEL SECURITY;

-- قفل ذرّي: جولة واحدة فقط تعمل في نفس الوقت.
CREATE OR REPLACE FUNCTION public.claim_realtime_lease(p_holder text, p_seconds integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE ok boolean;
BEGIN
  UPDATE public.realtime_lease
     SET holder = p_holder,
         expires_at = now() + make_interval(secs => greatest(5, least(300, p_seconds)))
   WHERE id = true AND (expires_at <= now() OR holder = p_holder)
  RETURNING true INTO ok;
  RETURN coalesce(ok, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_realtime_lease(p_holder text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.realtime_lease SET holder = NULL, expires_at = now()
   WHERE id = true AND holder = p_holder;
$$;

REVOKE ALL ON FUNCTION public.claim_realtime_lease(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_realtime_lease(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_realtime_lease(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_realtime_lease(text) TO service_role;

SELECT cron.schedule(
  'realtime-runs-cleanup',
  '23 3 * * *',
  $$DELETE FROM public.realtime_runs WHERE started_at < now() - interval '2 days'$$
);