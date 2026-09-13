DELETE FROM public.notifications WHERE item_id IN (SELECT id FROM public.dulms_items WHERE kind IN ('question','grade','material','exam','discussion','meeting'));
DELETE FROM public.dulms_items WHERE kind IN ('question','grade','material','exam','discussion','meeting');
DELETE FROM public.item_fingerprints WHERE kind IN ('question','grade','material','exam','discussion','meeting');
DELETE FROM public.cluster_events WHERE kind IN ('question','grade','material','exam','discussion','meeting');
DELETE FROM public.content_clusters WHERE kind IN ('question','grade','material','exam','discussion','meeting');