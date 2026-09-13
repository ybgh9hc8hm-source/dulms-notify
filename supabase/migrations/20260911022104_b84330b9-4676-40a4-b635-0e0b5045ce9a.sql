DROP POLICY IF EXISTS "Students create own registration watches" ON public.registration_watches;
CREATE POLICY "Students create own registration watches"
ON public.registration_watches FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Students update own registration watches"
ON public.registration_watches FOR UPDATE TO authenticated
USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.registration_watches TO authenticated;
GRANT ALL ON public.registration_watches TO service_role;