CREATE POLICY "Service role manages admin audit log"
ON public.admin_audit_log FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages admin sessions"
ON public.admin_sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

CREATE POLICY "Service role manages registration admission reservations"
ON public.registration_admission_reservations FOR ALL TO service_role
USING (true) WITH CHECK (true);