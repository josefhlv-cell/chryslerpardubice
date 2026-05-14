-- service_history: explicit INSERT policies
DROP POLICY IF EXISTS "Users can insert own service history" ON public.service_history;
CREATE POLICY "Users can insert own service history"
ON public.service_history
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- storage service-photos INSERT — odstranit broad
DROP POLICY IF EXISTS "Authenticated users can upload service photos" ON storage.objects;

CREATE POLICY "Users upload own service photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'service-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- storage service-order-photos: odstranit zbylou broad INSERT
DROP POLICY IF EXISTS "Authenticated users can upload order photos" ON storage.objects;