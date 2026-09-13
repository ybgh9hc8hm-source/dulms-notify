REVOKE EXECUTE ON FUNCTION public.claim_realtime_lease(text, integer) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_realtime_lease(text) FROM anon, authenticated;