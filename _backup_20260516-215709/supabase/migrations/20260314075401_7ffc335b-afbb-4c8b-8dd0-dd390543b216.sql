-- 1. Fix api_cache: restrict write access to authenticated users only
DROP POLICY IF EXISTS "Anyone can insert cache" ON public.api_cache;
DROP POLICY IF EXISTS "Anyone can update cache" ON public.api_cache;
DROP POLICY IF EXISTS "Anyone can delete cache" ON public.api_cache;

CREATE POLICY "Authenticated can insert cache" ON public.api_cache
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update cache" ON public.api_cache
  FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete cache" ON public.api_cache
  FOR DELETE TO authenticated USING (true);

-- 2. Fix epc_generation_queue: restrict write access to authenticated users
DROP POLICY IF EXISTS "Anyone can insert queue" ON public.epc_generation_queue;
DROP POLICY IF EXISTS "Anyone can update queue" ON public.epc_generation_queue;

CREATE POLICY "Authenticated can insert queue" ON public.epc_generation_queue
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Admins can update queue" ON public.epc_generation_queue
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- 3. Fix vehicle_inquiries INSERT policy
DROP POLICY IF EXISTS "Users can create inquiries" ON public.vehicle_inquiries;
DROP POLICY IF EXISTS "Anyone can create inquiries" ON public.vehicle_inquiries;
DROP POLICY IF EXISTS "Authenticated can create inquiries" ON public.vehicle_inquiries;

CREATE POLICY "Users can create inquiries" ON public.vehicle_inquiries
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 4. Create a public view for parts_new that hides admin pricing columns
CREATE OR REPLACE VIEW public.parts_new_public
WITH (security_invoker = on) AS
  SELECT id, name, oem_number, price_with_vat, price_without_vat, 
         availability, catalog_source, category, manufacturer, 
         compatible_vehicles, description, image_urls, internal_code,
         last_price_update, updated_at, segment, packaging, currency, family
  FROM public.parts_new;