CREATE TABLE IF NOT EXISTS public.crypto_keyring (
  version integer PRIMARY KEY CHECK (version >= 1 AND version <= 16),
  secret text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.crypto_keyring TO service_role;
REVOKE ALL ON public.crypto_keyring FROM anon, authenticated;

ALTER TABLE public.crypto_keyring ENABLE ROW LEVEL SECURITY;