-- Add explicit restrictive policy to prevent non-admin reads on parts_new
-- The parts_new_public view should be used for public access instead
CREATE POLICY "Only admins can select parts_new"
ON public.parts_new
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Block anon role explicitly
CREATE POLICY "No anonymous access to parts_new"
ON public.parts_new
FOR SELECT
TO anon
USING (false);