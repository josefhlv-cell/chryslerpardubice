
UPDATE public.parts_new
SET category = trim(regexp_replace(category, '\s*\([A-Za-z/ ]+\)\s*$', ''))
WHERE category ~ '\s*\([A-Za-z/ ]+\)\s*$';

UPDATE public.parts_new SET category = 'Chlazení' WHERE category = 'Chladící systém';

INSERT INTO public.catalog_vehicle_compatibility
  (part_id, nextis_vehicle_id, brand, model, engine, year_from, year_to, is_oem, match_method, match_confidence, source)
SELECT DISTINCT
  p.id, v.id, v.brand, v.model, v.engine, v.year_from, v.year_to,
  false, 'compat_text_auto', 85, 'manual'::catalog_source_type
FROM public.parts_new p
JOIN public.nextis_vehicles v
  ON p.compatible_vehicles ILIKE v.brand || ' ' || v.model || '%'
WHERE p.compatible_vehicles IS NOT NULL
  AND p.compatible_vehicles <> ''
ON CONFLICT (part_id, nextis_vehicle_id) WHERE nextis_vehicle_id IS NOT NULL DO NOTHING;
