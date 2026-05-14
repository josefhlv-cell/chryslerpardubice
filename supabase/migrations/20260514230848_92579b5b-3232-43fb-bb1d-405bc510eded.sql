-- vehicle_inquiries: smazat duplicitní permissive INSERT policy
DROP POLICY IF EXISTS "Authenticated users can create inquiries" ON public.vehicle_inquiries;
-- ponecháváme: "Users can create inquiries" s WITH CHECK ((auth.uid() = user_id) OR (user_id IS NULL))

-- storage: fault-photos INSERT — vyžadovat ownership přes folder
DROP POLICY IF EXISTS "Auth users can upload fault photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload fault photos" ON storage.objects;

CREATE POLICY "Users upload own fault photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'fault-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- storage: service-order-photos INSERT — také ownership
DROP POLICY IF EXISTS "Authenticated users can upload service order photos" ON storage.objects;
DROP POLICY IF EXISTS "Auth users can upload service order photos" ON storage.objects;

CREATE POLICY "Users upload own service order photos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'service-order-photos'
  AND (storage.foldername(name))[1] = auth.uid()::text
);