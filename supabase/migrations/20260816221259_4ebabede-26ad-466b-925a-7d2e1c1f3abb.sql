DELETE FROM public.notifications WHERE item_id IN (SELECT id FROM public.dulms_items WHERE kind = 'onlineExam');
DELETE FROM public.item_fingerprints WHERE kind = 'onlineExam';
DELETE FROM public.dulms_items WHERE kind = 'onlineExam';