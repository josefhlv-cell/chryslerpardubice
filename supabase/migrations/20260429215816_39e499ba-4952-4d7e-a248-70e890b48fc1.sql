-- 1) Remove Jeep / Hummer from compatibility
DELETE FROM public.catalog_vehicle_compatibility
WHERE brand ILIKE 'jeep' OR brand ILIKE 'hummer';

-- 2) Backfill missing categories using keyword rules
UPDATE public.parts_new SET category = 'Brzdové zařízení'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND (name ILIKE '%brzd%' OR name ILIKE '%kotouč%' OR name ILIKE '%destič%' OR name ILIKE '%třmen%' OR name ILIKE '%abs %');

UPDATE public.parts_new SET category = 'Filtry'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND name ILIKE '%filtr%';

UPDATE public.parts_new SET category = 'Motor'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND (name ILIKE '%hlava válc%' OR name ILIKE '%vačk%' OR name ILIKE '%klikov%' OR name ILIKE '%píst%' OR name ILIKE '%olejov%van%' OR name ILIKE '%turbo%');

UPDATE public.parts_new SET category = 'Chlazení'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND (name ILIKE '%chladič%' OR name ILIKE '%termostat%' OR name ILIKE '%vodní čerpadl%' OR name ILIKE '%ventilát%');

UPDATE public.parts_new SET category = 'Výfuk'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND (name ILIKE '%výfuk%' OR name ILIKE '%katalyz%' OR name ILIKE '%lambd%');

UPDATE public.parts_new SET category = 'Odpružení'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND (name ILIKE '%tlumič%' OR name ILIKE '%pružin%' OR name ILIKE '%rameno%' OR name ILIKE '%silentbl%' OR name ILIKE '%stabiliz%');

UPDATE public.parts_new SET category = 'Elektroinstalace'
WHERE (category IS NULL OR category = '' OR category = 'Ostatní')
  AND (name ILIKE '%alternát%' OR name ILIKE '%startér%' OR name ILIKE '%baterie%' OR name ILIKE '%svíčk%' OR name ILIKE '%cívk%' OR name ILIKE '%relé%');

-- 3) Repair Mopar OEM-only names
UPDATE public.parts_new
SET name = name || ' — ' || category
WHERE name ~ '^Mopar [A-Z0-9]+$' AND category IS NOT NULL AND category <> '' AND category <> 'Ostatní';

-- 4) Sync availability with price
UPDATE public.parts_new
SET availability = 'on_order'
WHERE (price_without_vat IS NULL OR price_without_vat <= 0)
  AND COALESCE(availability,'') <> 'on_order';