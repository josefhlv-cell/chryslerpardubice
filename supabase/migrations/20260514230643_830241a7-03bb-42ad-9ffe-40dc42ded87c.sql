-- Vrátit původní permisivní RLS politiku (frontend čte parts_new přímo na mnoha místech)
DROP POLICY IF EXISTS "Only admins can view parts_new directly" ON public.parts_new;

CREATE POLICY "Anyone can view public catalog fields"
ON public.parts_new
FOR SELECT
TO anon, authenticated
USING (true);

-- Column-level ochrana: revoke vše, grant jen public sloupce
REVOKE SELECT ON public.parts_new FROM anon, authenticated;

GRANT SELECT (
  id, oem_number, internal_code, name, family, category, segment, packaging,
  price_without_vat, price_with_vat, currency, updated_at, last_price_update,
  description, compatible_vehicles, catalog_source, availability, manufacturer,
  image_urls
) ON public.parts_new TO anon, authenticated;

-- Admini si dál čtou vše přes service_role / admin policy
GRANT SELECT ON public.parts_new TO service_role;