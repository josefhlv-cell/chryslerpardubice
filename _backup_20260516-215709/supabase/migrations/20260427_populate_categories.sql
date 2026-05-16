-- Migration: Populate catalog_part_categories and catalog_vehicle_compatibility
-- Purpose: Fill missing category and vehicle data for parts in parts_new table
-- This uses intelligent keyword matching based on part names and descriptions

-- ============================================================================
-- 1. POPULATE catalog_vehicle_compatibility from parts_new
-- ============================================================================
-- For each part, create compatibility records for common Chrysler/Dodge vehicles

INSERT INTO public.catalog_vehicle_compatibility (part_id, brand, model, engine, year_from, year_to, is_oem, source, match_method, match_confidence)
SELECT DISTINCT
  p.id,
  'Chrysler' as brand,
  CASE 
    WHEN p.name ILIKE '%Town%Country%' OR p.family ILIKE '%Town%Country%' THEN 'Town & Country'
    WHEN p.name ILIKE '%300%' OR p.family ILIKE '%300%' THEN '300'
    WHEN p.name ILIKE '%Sebring%' OR p.family ILIKE '%Sebring%' THEN 'Sebring'
    WHEN p.name ILIKE '%Pacifica%' OR p.family ILIKE '%Pacifica%' THEN 'Pacifica'
    ELSE NULL
  END as model,
  NULL as engine,
  2000 as year_from,
  2024 as year_to,
  true as is_oem,
  'parts_new' as source,
  'name-keyword' as match_method,
  50 as match_confidence
FROM public.parts_new p
WHERE p.id NOT IN (
  SELECT DISTINCT part_id FROM public.catalog_vehicle_compatibility
)
AND (
  p.name ILIKE '%Town%Country%' OR 
  p.name ILIKE '%300%' OR 
  p.name ILIKE '%Sebring%' OR 
  p.name ILIKE '%Pacifica%' OR
  p.family ILIKE '%Town%Country%' OR 
  p.family ILIKE '%300%' OR 
  p.family ILIKE '%Sebring%' OR 
  p.family ILIKE '%Pacifica%'
)
ON CONFLICT (part_id, brand, model, engine) DO NOTHING;

-- Add Dodge vehicles
INSERT INTO public.catalog_vehicle_compatibility (part_id, brand, model, engine, year_from, year_to, is_oem, source, match_method, match_confidence)
SELECT DISTINCT
  p.id,
  'Dodge' as brand,
  CASE 
    WHEN p.name ILIKE '%Durango%' OR p.family ILIKE '%Durango%' THEN 'Durango'
    WHEN p.name ILIKE '%Dakota%' OR p.family ILIKE '%Dakota%' THEN 'Dakota'
    WHEN p.name ILIKE '%RAM%' OR p.family ILIKE '%RAM%' THEN 'RAM'
    WHEN p.name ILIKE '%Charger%' OR p.family ILIKE '%Charger%' THEN 'Charger'
    ELSE NULL
  END as model,
  NULL as engine,
  2000 as year_from,
  2024 as year_to,
  true as is_oem,
  'parts_new' as source,
  'name-keyword' as match_method,
  50 as match_confidence
FROM public.parts_new p
WHERE p.id NOT IN (
  SELECT DISTINCT part_id FROM public.catalog_vehicle_compatibility
)
AND (
  p.name ILIKE '%Durango%' OR 
  p.name ILIKE '%Dakota%' OR 
  p.name ILIKE '%RAM%' OR 
  p.name ILIKE '%Charger%' OR
  p.family ILIKE '%Durango%' OR 
  p.family ILIKE '%Dakota%' OR 
  p.family ILIKE '%RAM%' OR 
  p.family ILIKE '%Charger%'
)
ON CONFLICT (part_id, brand, model, engine) DO NOTHING;

-- Add universal vehicles (for parts without specific model match)
INSERT INTO public.catalog_vehicle_compatibility (part_id, brand, model, engine, year_from, year_to, is_oem, source, match_method, match_confidence)
SELECT DISTINCT
  p.id,
  'Chrysler' as brand,
  NULL as model,
  NULL as engine,
  2000 as year_from,
  2024 as year_to,
  true as is_oem,
  'parts_new' as source,
  'universal' as match_method,
  30 as match_confidence
FROM public.parts_new p
WHERE p.id NOT IN (
  SELECT DISTINCT part_id FROM public.catalog_vehicle_compatibility
)
LIMIT 1406  -- Limit to avoid duplicates
ON CONFLICT (part_id, brand, model, engine) DO NOTHING;

-- ============================================================================
-- 2. POPULATE catalog_part_categories based on part name and description
-- ============================================================================

-- Brakes / Brzdové zařízení
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'brakes' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%brake%' OR p.name ILIKE '%brz%' OR p.name ILIKE '%disc%' OR
  p.name ILIKE '%pad%' OR p.name ILIKE '%caliper%' OR p.name ILIKE '%rotor%' OR
  p.description ILIKE '%brake%' OR p.description ILIKE '%brz%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Engine / Motor
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'engine' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%engine%' OR p.name ILIKE '%motor%' OR p.name ILIKE '%cylinder%' OR
  p.name ILIKE '%valve%' OR p.name ILIKE '%gasket%' OR p.name ILIKE '%timing%' OR
  p.description ILIKE '%engine%' OR p.description ILIKE '%motor%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Cooling / Chlazení
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'cooling' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%coolant%' OR p.name ILIKE '%radiator%' OR p.name ILIKE '%cooler%' OR
  p.name ILIKE '%thermostat%' OR p.name ILIKE '%water%pump%' OR p.name ILIKE '%fan%' OR
  p.description ILIKE '%cooling%' OR p.description ILIKE '%radiator%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Suspension / Odpružení
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'suspension' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%shock%' OR p.name ILIKE '%strut%' OR p.name ILIKE '%spring%' OR
  p.name ILIKE '%suspension%' OR p.name ILIKE '%arm%' OR p.name ILIKE '%bushing%' OR
  p.description ILIKE '%suspension%' OR p.description ILIKE '%shock%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Electrical / Elektroinstalace
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'electrical' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%alternator%' OR p.name ILIKE '%starter%' OR p.name ILIKE '%battery%' OR
  p.name ILIKE '%spark%' OR p.name ILIKE '%wire%' OR p.name ILIKE '%relay%' OR
  p.description ILIKE '%electrical%' OR p.description ILIKE '%alternator%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Filters / Filtry
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'filters' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%filter%' OR p.name ILIKE '%air%' OR p.name ILIKE '%oil%' OR
  p.name ILIKE '%fuel%' OR p.description ILIKE '%filter%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Fuel System / Palivový systém
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'fuel-system' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%fuel%' OR p.name ILIKE '%pump%' OR p.name ILIKE '%injector%' OR
  p.description ILIKE '%fuel%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Transmission / Převodovka
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'transmission' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%transmission%' OR p.name ILIKE '%gearbox%' OR p.name ILIKE '%clutch%' OR
  p.description ILIKE '%transmission%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Body / Karoserie
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'body' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%door%' OR p.name ILIKE '%bumper%' OR p.name ILIKE '%panel%' OR
  p.name ILIKE '%trim%' OR p.name ILIKE '%mirror%' OR p.name ILIKE '%window%' OR
  p.description ILIKE '%body%' OR p.description ILIKE '%door%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Interior / Interiér
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'interior' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%seat%' OR p.name ILIKE '%mat%' OR p.name ILIKE '%carpet%' OR
  p.name ILIKE '%dashboard%' OR p.name ILIKE '%console%' OR
  p.description ILIKE '%interior%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Liquids & Oils / Kapaliny a oleje
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'liquids' LIMIT 1),
  true
FROM public.parts_new p
WHERE p.id NOT IN (SELECT DISTINCT part_id FROM public.catalog_part_categories)
AND (
  p.name ILIKE '%oil%' OR p.name ILIKE '%coolant%' OR p.name ILIKE '%fluid%' OR
  p.name ILIKE '%brake%liquid%' OR p.description ILIKE '%liquid%'
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- Default category for unmatched parts
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT
  p.id,
  (SELECT id FROM public.catalog_categories WHERE slug = 'other' LIMIT 1),
  false
FROM public.parts_new p
WHERE p.id NOT IN (
  SELECT DISTINCT part_id FROM public.catalog_part_categories
)
ON CONFLICT (part_id, category_id) DO NOTHING;

-- ============================================================================
-- 3. Log completion
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '[MIGRATION] Populated catalog_vehicle_compatibility: % records',
    (SELECT COUNT(*) FROM public.catalog_vehicle_compatibility);
  RAISE NOTICE '[MIGRATION] Populated catalog_part_categories: % records',
    (SELECT COUNT(*) FROM public.catalog_part_categories);
END $$;
