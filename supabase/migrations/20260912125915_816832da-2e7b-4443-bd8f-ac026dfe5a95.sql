ALTER TABLE public.dulms_accounts
  ADD COLUMN IF NOT EXISTS policy_version text,
  ADD COLUMN IF NOT EXISTS policy_accepted_at timestamptz;

COMMENT ON COLUMN public.dulms_accounts.policy_version IS 'Version of the Terms of Use and Privacy Policy accepted by the student';
COMMENT ON COLUMN public.dulms_accounts.policy_accepted_at IS 'UTC timestamp when the student accepted the recorded policy version';