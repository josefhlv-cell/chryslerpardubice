CREATE POLICY "Anyone can delete cache"
ON public.api_cache
FOR DELETE
USING (true);