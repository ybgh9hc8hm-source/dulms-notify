CREATE POLICY "Students can read their own archived files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'dulms-archive'
  AND EXISTS (
    SELECT 1
    FROM public.dulms_files f
    WHERE f.storage_path = storage.objects.name
      AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Students can upload only their own archived files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dulms-archive'
  AND EXISTS (
    SELECT 1
    FROM public.dulms_files f
    WHERE f.storage_path = storage.objects.name
      AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Students can update their own archived files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'dulms-archive'
  AND EXISTS (
    SELECT 1
    FROM public.dulms_files f
    WHERE f.storage_path = storage.objects.name
      AND f.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'dulms-archive'
  AND EXISTS (
    SELECT 1
    FROM public.dulms_files f
    WHERE f.storage_path = storage.objects.name
      AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Students can delete their own archived files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'dulms-archive'
  AND EXISTS (
    SELECT 1
    FROM public.dulms_files f
    WHERE f.storage_path = storage.objects.name
      AND f.user_id = auth.uid()
  )
);