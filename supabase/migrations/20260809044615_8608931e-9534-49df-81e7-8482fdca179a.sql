ALTER TABLE public.dulms_items
  ADD COLUMN IF NOT EXISTS last_seen_at timestamp with time zone NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS archived_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS dulms_items_user_archived_idx ON public.dulms_items (user_id, archived_at);

CREATE TABLE IF NOT EXISTS public.dulms_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES public.dulms_items(id) ON DELETE CASCADE,
  file_key text NOT NULL,
  storage_path text NOT NULL,
  filename text NOT NULL,
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  size_bytes integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, file_key)
);

GRANT SELECT ON public.dulms_files TO authenticated;
GRANT ALL ON public.dulms_files TO service_role;

ALTER TABLE public.dulms_files ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own archived files read" ON public.dulms_files;
CREATE POLICY "own archived files read"
  ON public.dulms_files FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP TRIGGER IF EXISTS dulms_files_touch ON public.dulms_files;
CREATE TRIGGER dulms_files_touch
  BEFORE UPDATE ON public.dulms_files
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();