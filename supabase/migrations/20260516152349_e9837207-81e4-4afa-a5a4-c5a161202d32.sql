
-- Map "Chrysler 300" -> 300C, 300M
INSERT INTO public.catalog_vehicle_compatibility
  (part_id, nextis_vehicle_id, brand, model, engine, year_from, year_to, is_oem, match_method, match_confidence, source)
SELECT DISTINCT p.id, v.id, v.brand, v.model, v.engine, v.year_from, v.year_to,
  false, 'compat_text_generic', 75, 'manual'::catalog_source_type
FROM public.parts_new p
JOIN public.nextis_vehicles v ON v.brand='Chrysler' AND v.model IN ('300C','300M')
WHERE p.compatible_vehicles ILIKE 'Chrysler 300%' AND p.compatible_vehicles NOT ILIKE 'Chrysler 300C%' AND p.compatible_vehicles NOT ILIKE 'Chrysler 300M%'
ON CONFLICT (part_id, nextis_vehicle_id) WHERE nextis_vehicle_id IS NOT NULL DO NOTHING;

-- Map "Dodge Ram" -> Ram 1500
INSERT INTO public.catalog_vehicle_compatibility
  (part_id, nextis_vehicle_id, brand, model, engine, year_from, year_to, is_oem, match_method, match_confidence, source)
SELECT DISTINCT p.id, v.id, v.brand, v.model, v.engine, v.year_from, v.year_to,
  false, 'compat_text_generic', 75, 'manual'::catalog_source_type
FROM public.parts_new p
JOIN public.nextis_vehicles v ON v.brand='Dodge' AND v.model='Ram 1500'
WHERE p.compatible_vehicles ILIKE 'Dodge Ram%' AND p.compatible_vehicles NOT ILIKE 'Dodge Ram 1500%'
ON CONFLICT (part_id, nextis_vehicle_id) WHERE nextis_vehicle_id IS NOT NULL DO NOTHING;
