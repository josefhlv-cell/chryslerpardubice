-- vehicle_inquiries: zakázat NULL user_id
DROP POLICY IF EXISTS "Users can create inquiries" ON public.vehicle_inquiries;
CREATE POLICY "Users can create own inquiries"
ON public.vehicle_inquiries
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- service_lifts: pouze authenticated SELECT
DROP POLICY IF EXISTS "Anyone can view lifts" ON public.service_lifts;
DROP POLICY IF EXISTS "Public can view lifts" ON public.service_lifts;
CREATE POLICY "Authenticated can view lifts"
ON public.service_lifts
FOR SELECT
TO authenticated
USING (true);