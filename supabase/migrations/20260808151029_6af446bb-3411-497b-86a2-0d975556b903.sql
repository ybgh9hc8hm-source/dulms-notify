ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dulms_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.dulms_accounts;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.dulms_items REPLICA IDENTITY FULL;
ALTER TABLE public.dulms_accounts REPLICA IDENTITY FULL;