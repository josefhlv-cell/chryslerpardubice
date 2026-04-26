ALTER VIEW public.parts_new_public SET (security_invoker = true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'parts_new'
      AND policyname = 'Anyone can view public catalog fields'
  ) THEN
    CREATE POLICY "Anyone can view public catalog fields"
    ON public.parts_new
    FOR SELECT
    TO anon, authenticated
    USING (true);
  END IF;
END $$;

GRANT SELECT (
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
) ON public.parts_new TO anon, authenticated;

GRANT SELECT ON public.parts_new_public TO anon, authenticated;