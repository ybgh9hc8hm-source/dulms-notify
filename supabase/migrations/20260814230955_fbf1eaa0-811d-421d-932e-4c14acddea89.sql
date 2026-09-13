CREATE TABLE public.admin_auth_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  identifier text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.admin_auth_attempts TO service_role;
ALTER TABLE public.admin_auth_attempts ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_admin_auth_attempts_identifier ON public.admin_auth_attempts (identifier, attempted_at DESC);

CREATE TABLE public.telegram_updates (
  update_id bigint PRIMARY KEY,
  chat_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_telegram_updates_created_at ON public.telegram_updates (created_at);

ALTER TABLE public.telegram_link_tokens ADD COLUMN IF NOT EXISTS consumed_by_update_id bigint;

ALTER TABLE public.dulms_accounts ADD COLUMN IF NOT EXISTS key_version integer NOT NULL DEFAULT 1;