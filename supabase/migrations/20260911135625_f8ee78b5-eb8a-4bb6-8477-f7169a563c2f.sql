CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_identifier text NOT NULL,
  action text NOT NULL,
  target text,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_audit_log TO service_role;
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);
CREATE INDEX admin_audit_log_action_idx ON public.admin_audit_log (action, created_at DESC);

CREATE TABLE public.admin_sessions (
  token_hash text PRIMARY KEY,
  issued_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  identifier text NOT NULL
);
GRANT ALL ON public.admin_sessions TO service_role;
ALTER TABLE public.admin_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX admin_sessions_expires_at_idx ON public.admin_sessions (expires_at);

CREATE TABLE public.registration_admission_reservations (
  dulms_id text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.registration_admission_reservations TO service_role;
ALTER TABLE public.registration_admission_reservations ENABLE ROW LEVEL SECURITY;
CREATE INDEX registration_admission_reservations_expires_at_idx ON public.registration_admission_reservations (expires_at);

CREATE OR REPLACE FUNCTION public.reserve_registration_admission(
  p_dulms_id text,
  p_seat_limit integer,
  p_ttl_seconds integer DEFAULT 180
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  used_count integer;
  reserved_count integer;
BEGIN
  IF p_seat_limit <= 0 THEN
    RETURN true;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('registration-admission-capacity'));
  DELETE FROM public.registration_admission_reservations WHERE expires_at <= now();

  IF EXISTS (SELECT 1 FROM public.dulms_accounts WHERE dulms_id = p_dulms_id) THEN
    RETURN true;
  END IF;

  IF EXISTS (SELECT 1 FROM public.registration_admission_reservations WHERE dulms_id = p_dulms_id) THEN
    UPDATE public.registration_admission_reservations
      SET expires_at = now() + make_interval(secs => greatest(30, least(p_ttl_seconds, 600)))
      WHERE dulms_id = p_dulms_id;
    RETURN true;
  END IF;

  SELECT count(*) INTO used_count FROM public.dulms_accounts;
  SELECT count(*) INTO reserved_count FROM public.registration_admission_reservations;
  IF used_count + reserved_count >= p_seat_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.registration_admission_reservations (dulms_id, expires_at)
  VALUES (p_dulms_id, now() + make_interval(secs => greatest(30, least(p_ttl_seconds, 600))));
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_registration_admission(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_registration_admission(text, integer, integer) TO service_role;