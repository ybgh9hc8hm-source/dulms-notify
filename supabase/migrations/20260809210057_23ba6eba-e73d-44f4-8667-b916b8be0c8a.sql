CREATE TABLE public.load_test_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'scheduled',
  stage_index integer not null default 0,
  stages integer[] not null default '{0,4,8,16}'::integer[],
  cohort uuid[] not null default '{}'::uuid[],
  observe_minutes integer not null default 30,
  burst_minutes integer not null default 25,
  window_start_hour integer not null default 1,
  window_end_hour integer not null default 5,
  stage_started_at timestamptz,
  baseline jsonb,
  stage_reports jsonb not null default '[]'::jsonb,
  abort_reason text,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
GRANT ALL ON public.load_test_runs TO service_role;
ALTER TABLE public.load_test_runs ENABLE ROW LEVEL SECURITY;
CREATE TRIGGER load_test_runs_touch BEFORE UPDATE ON public.load_test_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();