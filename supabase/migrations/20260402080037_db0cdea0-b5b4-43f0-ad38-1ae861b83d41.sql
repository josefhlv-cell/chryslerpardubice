-- 1. Create vehicles_public view excluding VIN
CREATE OR REPLACE VIEW public.vehicles_public AS
SELECT v.id, v.brand, v.model, v.year, v.price, v.mileage, v.fuel, v.power, v.engine,
       v.transmission, v.color, v.condition, v.description, v.images, v.listing_url,
       v.is_active, v.created_at, v.updated_at
FROM public.vehicles v
WHERE v.is_active = true;

-- 2. Make storage buckets private
UPDATE storage.buckets SET public = false WHERE id IN ('service-photos', 'fault-photos', 'service-order-photos');

-- 3. Fix storage RLS
DROP POLICY IF EXISTS "Authenticated users can read service photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view fault photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read order photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view service photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view fault photos" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view order photos" ON storage.objects;

CREATE POLICY "Admins can read all storage photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id IN ('service-photos', 'fault-photos', 'service-order-photos')
  AND public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "Users can read own fault photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'fault-photos'
  AND (storage.foldername(storage.objects.name))[1] = auth.uid()::text
);

CREATE POLICY "Users can read own service order photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'service-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.user_id = auth.uid()
    AND (storage.foldername(storage.objects.name))[1] = 'orders'
    AND (storage.foldername(storage.objects.name))[2] = so.id::text
  )
);

CREATE POLICY "Mechanics can read assigned order photos"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'service-order-photos'
  AND EXISTS (
    SELECT 1 FROM public.service_orders so
    JOIN public.mechanics m ON so.mechanic_id = m.id
    JOIN public.employees e ON m.employee_id = e.id
    WHERE e.user_id = auth.uid()
    AND e.active = true
    AND m.active = true
    AND (storage.foldername(storage.objects.name))[1] = 'orders'
    AND (storage.foldername(storage.objects.name))[2] = so.id::text
  )
);