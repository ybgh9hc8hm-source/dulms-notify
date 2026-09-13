ALTER TABLE public.dulms_accounts ADD COLUMN IF NOT EXISTS telegram_chat_id text;
CREATE UNIQUE INDEX IF NOT EXISTS dulms_accounts_telegram_chat_id_key ON public.dulms_accounts (telegram_chat_id) WHERE telegram_chat_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.telegram_link_tokens (
  token text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  used_at timestamptz
);

CREATE INDEX IF NOT EXISTS telegram_link_tokens_user_id_idx ON public.telegram_link_tokens (user_id);

GRANT SELECT ON public.telegram_link_tokens TO authenticated;
GRANT ALL ON public.telegram_link_tokens TO service_role;

ALTER TABLE public.telegram_link_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own telegram link tokens read" ON public.telegram_link_tokens;
CREATE POLICY "own telegram link tokens read" ON public.telegram_link_tokens
  FOR SELECT TO authenticated USING (auth.uid() = user_id);