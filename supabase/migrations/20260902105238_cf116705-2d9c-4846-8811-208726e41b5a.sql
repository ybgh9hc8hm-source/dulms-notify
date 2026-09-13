-- purge_cluster_events was created with default PUBLIC EXECUTE, unlike every
-- other purge_* function here. Anon/authenticated could have deleted cluster
-- history at will (SECURITY DEFINER bypasses RLS). Match the project convention.
REVOKE ALL ON FUNCTION public.purge_cluster_events(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_cluster_events(integer) FROM anon;
REVOKE ALL ON FUNCTION public.purge_cluster_events(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_cluster_events(integer) TO service_role;