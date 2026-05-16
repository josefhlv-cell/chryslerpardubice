CREATE OR REPLACE VIEW public.parts_new_public
WITH (security_invoker=on) AS
SELECT
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
  family,
  price_without_vat
FROM public.parts_new;