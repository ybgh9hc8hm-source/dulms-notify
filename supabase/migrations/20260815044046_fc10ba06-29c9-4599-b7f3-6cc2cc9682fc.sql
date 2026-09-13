CREATE TABLE public.support_messages (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid,
  channel text NOT NULL DEFAULT 'web',
  chat_id text,
  role text NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_messages TO authenticated;
GRANT ALL ON public.support_messages TO service_role;

ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read their own support messages"
ON public.support_messages FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE INDEX idx_support_messages_user ON public.support_messages (user_id, created_at DESC);
CREATE INDEX idx_support_messages_chat ON public.support_messages (chat_id, created_at DESC);