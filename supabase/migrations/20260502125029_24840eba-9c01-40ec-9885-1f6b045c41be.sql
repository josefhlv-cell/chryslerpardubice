-- 1. Normalizace názvů kategorií v parts_new
UPDATE public.parts_new SET category = 'Karoserie' WHERE category IN ('Karosérie', 'Karoserie (Body)');
UPDATE public.parts_new SET category = 'Odpružení' WHERE category = 'Odpružení (Suspension)';
UPDATE public.parts_new SET category = 'Brzdové zařízení' WHERE category IN ('Brzdový systém', 'Brzdový systém (Brakes)');
UPDATE public.parts_new SET category = 'Chlazení' WHERE category IN ('Chladící systém', 'Chladící systém (Cooling)');
UPDATE public.parts_new SET category = 'Motor' WHERE category = 'Motor (Engine)';
UPDATE public.parts_new SET category = 'Elektroinstalace' WHERE category = 'Elektroinstalace (Electrical)';
UPDATE public.parts_new SET category = 'Klimatizace' WHERE category = 'Klimatizace (A/C)';
UPDATE public.parts_new SET category = 'Výfuk' WHERE category = 'Výfuk (Exhaust)';
UPDATE public.parts_new SET category = 'Převodovka' WHERE category = 'Převodovka (Transmission)';
UPDATE public.parts_new SET category = 'Údržba' WHERE category = 'Údržba (Maintenance)';
UPDATE public.parts_new SET category = 'Příslušenství a nářadí' WHERE category = 'Příslušenství';
UPDATE public.parts_new SET category = 'Pneumatiky a disky' WHERE category = 'Pneumatiky';
UPDATE public.parts_new SET category = 'Elektroinstalace' WHERE category IN ('Autobaterie', 'Bezpečnostní systém', 'Senzory', 'Snímače emisí');
UPDATE public.parts_new SET category = 'Údržba' WHERE category = 'Čištění skel';

-- 2. Sjednoť značku Ram → RAM
UPDATE public.nextis_vehicles SET brand = 'RAM' WHERE brand = 'Ram';
UPDATE public.catalog_categories SET vehicle_brand = 'RAM' WHERE vehicle_brand = 'Ram';
UPDATE public.catalog_vehicle_compatibility SET brand = 'RAM' WHERE brand = 'Ram';

-- 3. Smaž sirotčí RAM brand bez modelu (po sloučení)
DELETE FROM public.catalog_categories
WHERE vehicle_brand = 'RAM' AND vehicle_model IS NULL AND node_type = 'brand'
  AND id IN (
    SELECT id FROM public.catalog_categories
    WHERE vehicle_brand = 'RAM' AND vehicle_model IS NULL AND node_type='brand'
    ORDER BY created_at
    OFFSET 1
  );

-- 4. Deduplikuj nextis_vehicles po sloučení Ram→RAM
WITH ranked AS (
  SELECT id, brand, model, engine, year_from, year_to,
    ROW_NUMBER() OVER (PARTITION BY brand, lower(model), lower(coalesce(engine,'')), coalesce(year_from,0), coalesce(year_to,9999) ORDER BY created_at) AS rn
  FROM public.nextis_vehicles
)
DELETE FROM public.nextis_vehicles WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 5. Deduplikuj catalog_categories po sloučení (engine/model/brand uzly)
WITH ranked AS (
  SELECT id, parent_id, slug, vehicle_brand, vehicle_model, vehicle_engine, node_type,
    ROW_NUMBER() OVER (
      PARTITION BY node_type, coalesce(vehicle_brand,''), coalesce(vehicle_model,''), coalesce(vehicle_engine,''), coalesce(parent_id::text,'')
      ORDER BY created_at
    ) AS rn
  FROM public.catalog_categories
  WHERE node_type IN ('brand', 'model', 'engine')
)
DELETE FROM public.catalog_categories WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 6. Indexy pro rychlejší hledání
CREATE INDEX IF NOT EXISTS idx_parts_new_oem_upper ON public.parts_new(upper(oem_number));
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new(category);
CREATE INDEX IF NOT EXISTS idx_nextis_brand_model ON public.nextis_vehicles(brand, model);

-- 7. Log opravy
INSERT INTO public.catalog_event_log(source, event, level, message, details)
VALUES ('migration', 'category_normalization', 'info', 'Sjednoceny duplicitni kategorie a RAM brand', '{}'::jsonb);