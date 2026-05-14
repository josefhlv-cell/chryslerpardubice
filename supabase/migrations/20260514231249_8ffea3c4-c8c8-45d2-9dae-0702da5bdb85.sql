DROP POLICY IF EXISTS "Anyone can view mechanics" ON public.mechanics;
DROP POLICY IF EXISTS "Public can view mechanics" ON public.mechanics;
CREATE POLICY "Authenticated can view mechanics"
ON public.mechanics
FOR SELECT
TO authenticated
USING (true);