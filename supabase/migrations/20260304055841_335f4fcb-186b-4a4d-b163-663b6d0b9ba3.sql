
-- Fix overly permissive INSERT policy on vehicle_inquiries
DROP POLICY "Anyone can create inquiries" ON public.vehicle_inquiries;

CREATE POLICY "Authenticated users can create inquiries"
  ON public.vehicle_inquiries FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
