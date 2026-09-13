-- Explicit, least-privilege policies on storage.objects.
-- 'landing' stays server-only (service role bypasses RLS); 'dulms-archive'
-- is owner-scoped by first path segment == auth.uid().

DROP POLICY IF EXISTS "archive_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "archive_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "archive_owner_update" ON storage.objects;
DROP POLICY IF EXISTS "archive_owner_delete" ON storage.objects;

CREATE POLICY "archive_owner_select"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'dulms-archive' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "archive_owner_insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'dulms-archive' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "archive_owner_update"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'dulms-archive' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'dulms-archive' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "archive_owner_delete"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'dulms-archive' AND (storage.foldername(name))[1] = auth.uid()::text);