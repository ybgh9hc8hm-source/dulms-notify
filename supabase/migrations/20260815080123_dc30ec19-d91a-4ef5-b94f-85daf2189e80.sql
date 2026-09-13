CREATE TABLE public.support_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users ON DELETE SET NULL,
  dulms_id text,
  channel text NOT NULL DEFAULT 'web',
  chat_id text,
  kind text NOT NULL DEFAULT 'suggestion',
  title text NOT NULL,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'open',
  priority text NOT NULL DEFAULT 'normal',
  admin_note text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.support_tickets TO authenticated;
GRANT ALL ON public.support_tickets TO service_role;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own support tickets read" ON public.support_tickets
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER support_tickets_touch BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX support_tickets_status_idx ON public.support_tickets (status, created_at DESC);