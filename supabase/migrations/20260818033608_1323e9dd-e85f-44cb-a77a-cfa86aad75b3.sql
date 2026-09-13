CREATE TABLE public.project_vault (
  name text PRIMARY KEY,
  ciphertext text NOT NULL,
  note text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.project_vault TO service_role;
ALTER TABLE public.project_vault ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.vault_meta (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  salt text NOT NULL,
  verifier text NOT NULL,
  kdf text NOT NULL DEFAULT 'scrypt-n16384-r8-p1',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.vault_meta TO service_role;
ALTER TABLE public.vault_meta ENABLE ROW LEVEL SECURITY;