
CREATE TABLE public.probe_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft',
  mode text NOT NULL DEFAULT 'ramp',
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  current_rate integer NOT NULL DEFAULT 0,
  current_step_index integer NOT NULL DEFAULT 0,
  step_started_at timestamptz,
  total_requests integer NOT NULL DEFAULT 0,
  total_errors integer NOT NULL DEFAULT 0,
  session_index integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz,
  abort_reason text,
  report jsonb,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT probe_runs_status_chk CHECK (status IN ('draft','running','completed','aborted','stopped')),
  CONSTRAINT probe_runs_mode_chk CHECK (mode IN ('ramp','burst'))
);

GRANT ALL ON public.probe_runs TO service_role;
ALTER TABLE public.probe_runs ENABLE ROW LEVEL SECURITY;

CREATE INDEX probe_runs_status_created_idx ON public.probe_runs (status, created_at DESC);

CREATE TABLE public.probe_requests (
  id bigserial PRIMARY KEY,
  run_id uuid NOT NULL REFERENCES public.probe_runs(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  dulms_id text,
  endpoint text NOT NULL,
  status_code integer,
  latency_ms integer,
  size_bytes integer,
  rate_limit_headers jsonb,
  flagged boolean NOT NULL DEFAULT false,
  flag_reason text,
  error text
);

GRANT ALL ON public.probe_requests TO service_role;
ALTER TABLE public.probe_requests ENABLE ROW LEVEL SECURITY;

CREATE INDEX probe_requests_run_created_idx ON public.probe_requests (run_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER probe_runs_updated_at
  BEFORE UPDATE ON public.probe_runs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
