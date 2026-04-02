
-- 1. Recreate parts_new_public view WITHOUT sensitive pricing columns
DROP VIEW IF EXISTS public.parts_new_public;
CREATE VIEW public.parts_new_public
WITH (security_invoker = on) AS
SELECT
  id,
  name,
  oem_number,
  price_with_vat,
  availability,
  catalog_source,
  category,
  manufacturer,
  compatible_vehicles,
  description,
  image_urls,
  internal_code,
  last_price_update,
  updated_at,
  segment,
  packaging,
  currency,
  family
FROM parts_new;

-- 2. Storage RLS: Only owners can manage their uploads in service-photos
CREATE POLICY "Authenticated users can upload service photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'service-photos');

CREATE POLICY "Authenticated users can read service photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'service-photos');

CREATE POLICY "Users can delete own service photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'service-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 3. Storage RLS for fault-photos
CREATE POLICY "Authenticated users can upload fault photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'fault-photos');

CREATE POLICY "Authenticated users can read fault photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'fault-photos');

CREATE POLICY "Users can delete own fault photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'fault-photos' AND (storage.foldername(name))[1] = auth.uid()::text);

-- 4. Storage RLS for service-order-photos
CREATE POLICY "Authenticated users can upload order photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'service-order-photos');

CREATE POLICY "Authenticated users can read order photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'service-order-photos');

CREATE POLICY "Users can delete own order photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'service-order-photos' AND (storage.foldername(name))[1] = auth.uid()::text);
