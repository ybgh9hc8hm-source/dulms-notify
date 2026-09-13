ALTER TABLE public.dulms_accounts
  ADD COLUMN IF NOT EXISTS last_registration_signature text,
  ADD COLUMN IF NOT EXISTS last_registration_snapshot jsonb,
  ADD COLUMN IF NOT EXISTS last_registration_check_at timestamptz;

ALTER TABLE public.heartbeat_checks
  ADD COLUMN IF NOT EXISTS registration_ms integer;

COMMENT ON COLUMN public.dulms_accounts.last_registration_signature IS 'Stable fingerprint of the last valid direct registration snapshot';
COMMENT ON COLUMN public.dulms_accounts.last_registration_snapshot IS 'Last valid direct registration snapshot used for immediate change detection';
COMMENT ON COLUMN public.dulms_accounts.last_registration_check_at IS 'When the direct registration endpoints were last checked successfully';
COMMENT ON COLUMN public.heartbeat_checks.registration_ms IS 'Milliseconds spent checking direct registration endpoints';