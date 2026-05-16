-- Block anonymous users from reading vehicle inquiries
CREATE POLICY "Block anon from reading inquiries"
ON public.vehicle_inquiries
FOR SELECT
TO anon
USING (false);