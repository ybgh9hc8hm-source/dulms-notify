CREATE TABLE public.registration_watches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id text NOT NULL,
  course_code text,
  course_name text NOT NULL,
  group_id text NOT NULL,
  group_name text NOT NULL,
  subgroup_id text NOT NULL DEFAULT '',
  subgroup_name text,
  status text NOT NULL DEFAULT 'watching',
  was_open boolean NOT NULL DEFAULT false,
  opened_at timestamptz,
  notified_at timestamptz,
  last_checked_at timestamptz,
  last_result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, course_id, group_id, subgroup_id)
);

GRANT SELECT, INSERT, DELETE ON public.registration_watches TO authenticated;
GRANT ALL ON public.registration_watches TO service_role;

ALTER TABLE public.registration_watches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students read own registration watches"
ON public.registration_watches FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Students create own registration watches"
ON public.registration_watches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id AND status = 'watching');

CREATE POLICY "Students delete own registration watches"
ON public.registration_watches FOR DELETE TO authenticated
USING (auth.uid() = user_id);

CREATE TRIGGER registration_watches_updated_at
BEFORE UPDATE ON public.registration_watches
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX registration_watches_active_user_idx
ON public.registration_watches (user_id, status)
WHERE status IN ('watching', 'ready');