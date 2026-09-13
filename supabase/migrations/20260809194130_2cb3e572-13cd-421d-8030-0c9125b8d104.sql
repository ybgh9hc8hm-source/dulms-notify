CREATE TABLE public.dulms_health_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  endpoint text NOT NULL,
  status_code integer,
  latency_ms integer NOT NULL DEFAULT 0,
  flagged_reason text,
  step_limit integer,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb
);

GRANT ALL ON public.dulms_health_samples TO service_role;
ALTER TABLE public.dulms_health_samples ENABLE ROW LEVEL SECURITY;

CREATE INDEX dulms_health_samples_created_idx ON public.dulms_health_samples (created_at DESC);
CREATE INDEX dulms_health_samples_flagged_idx ON public.dulms_health_samples (flagged_reason) WHERE flagged_reason IS NOT NULL;

CREATE TABLE public.rate_ramp_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'scheduled',
  steps integer[] NOT NULL DEFAULT '{60,90,120,150,200}'::integer[],
  step_index integer NOT NULL DEFAULT 0,
  current_step integer NOT NULL DEFAULT 60,
  last_clean_step integer,
  hold_minutes integer NOT NULL DEFAULT 15,
  window_start_hour integer NOT NULL DEFAULT 1,
  window_end_hour integer NOT NULL DEFAULT 5,
  step_started_at timestamptz,
  baseline jsonb,
  step_reports jsonb NOT NULL DEFAULT '[]'::jsonb,
  abort_reason text,
  recommended_limit integer,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_ramp_runs TO service_role;
ALTER TABLE public.rate_ramp_runs ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER rate_ramp_runs_touch BEFORE UPDATE ON public.rate_ramp_runs
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

INSERT INTO public.app_settings (key, value)
VALUES ('dulms_rate_limit_per_minute', '60')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.purge_health_samples(p_days integer DEFAULT 3)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE removed integer;
BEGIN
  WITH gone AS (
    DELETE FROM public.dulms_health_samples
    WHERE created_at < now() - make_interval(days => p_days)
    RETURNING 1
  )
  SELECT count(*) INTO removed FROM gone;
  RETURN removed;
END;
$$;

CREATE OR REPLACE FUNCTION public.health_window_stats(p_from timestamptz, p_to timestamptz)
RETURNS TABLE (
  samples bigint,
  errors bigint,
  flagged bigint,
  blocks bigint,
  auth_fail bigint,
  p50 double precision,
  p95 double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    count(*)::bigint,
    count(*) FILTER (WHERE status_code IS NULL OR status_code >= 400)::bigint,
    count(*) FILTER (WHERE flagged_reason IS NOT NULL)::bigint,
    count(*) FILTER (WHERE flagged_reason IN ('challenge_page','blocked'))::bigint,
    count(*) FILTER (WHERE flagged_reason IN ('session_evicted','auth_failure'))::bigint,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms)::double precision,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)::double precision
  FROM public.dulms_health_samples
  WHERE created_at >= p_from AND created_at < p_to;
$$;