-- 1. FIXED: Recreate parts_new_public view WITH proper JOINs to category & vehicles
DROP VIEW IF EXISTS public.parts_new_public CASCADE;

CREATE VIEW public.parts_new_public
WITH (security_invoker = on) AS
SELECT
  p.id,
  p.name,
  p.oem_number,
  p.price_with_vat,
  p.availability,
  p.catalog_source,
  -- FIXED: Join to catalog_part_categories to get actual category names
  COALESCE(STRING_AGG(DISTINCT cc.name_cs, ', ') FILTER (WHERE cc.name_cs IS NOT NULL), NULL) as category,
  p.manufacturer,
  -- FIXED: Join to catalog_vehicle_compatibility to build compatible_vehicles string
  COALESCE(STRING_AGG(DISTINCT cvc.brand || ' ' || COALESCE(cvc.model, '') || ' ' || COALESCE(cvc.engine, ''), ' | ') 
    FILTER (WHERE cvc.brand IS NOT NULL), NULL) as compatible_vehicles,
  p.description,
  p.image_urls,
  p.internal_code,
  p.last_price_update,
  p.updated_at,
  p.segment,
  p.packaging,
  p.currency,
  p.family,
  p.price_without_vat
FROM parts_new p
LEFT JOIN catalog_part_categories cpc ON cpc.part_id = p.id
LEFT JOIN catalog_categories cc ON cc.id = cpc.category_id
LEFT JOIN catalog_vehicle_compatibility cvc ON cvc.part_id = p.id
GROUP BY 
  p.id, p.name, p.oem_number, p.price_with_vat, p.price_without_vat,
  p.availability, p.catalog_source, p.manufacturer, p.description,
  p.image_urls, p.internal_code, p.last_price_update, p.updated_at,
  p.segment, p.packaging, p.currency, p.family;

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
