DELETE FROM public.notifications WHERE kind IN ('course','message','questionnaire');
DELETE FROM public.dulms_items WHERE kind IN ('course','message','questionnaire');
DELETE FROM public.item_fingerprints WHERE kind IN ('course','message','questionnaire');
DELETE FROM public.cluster_events WHERE kind IN ('course','message','questionnaire');
DELETE FROM public.content_clusters WHERE kind IN ('course','message','questionnaire');