DROP INDEX IF EXISTS public.notification_outbox_dedupe_idx;
CREATE UNIQUE INDEX notification_outbox_dedupe_idx
  ON public.notification_outbox (dedupe_key);