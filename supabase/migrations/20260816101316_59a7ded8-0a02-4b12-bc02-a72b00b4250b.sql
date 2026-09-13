REVOKE ALL ON FUNCTION public.apply_sentinel_cover(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_check_lane(text, integer, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_outbox_batch(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.escalate_checks(uuid[], text, integer, smallint) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lane_stats() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.purge_outbox(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.slo_stats(timestamptz) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.apply_sentinel_cover(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_check_lane(text, integer, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_outbox_batch(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.escalate_checks(uuid[], text, integer, smallint) TO service_role;
GRANT EXECUTE ON FUNCTION public.lane_stats() TO service_role;
GRANT EXECUTE ON FUNCTION public.purge_outbox(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.slo_stats(timestamptz) TO service_role;