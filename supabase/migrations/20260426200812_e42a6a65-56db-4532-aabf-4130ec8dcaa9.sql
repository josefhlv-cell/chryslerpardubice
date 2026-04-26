
-- Move compatibility links (dedupe inline)
INSERT INTO public.catalog_vehicle_compatibility (part_id, brand, model, engine, year_from, year_to, is_oem, source, match_method, match_confidence)
SELECT DISTINCT winner.id, c.brand, c.model, c.engine, c.year_from, c.year_to, c.is_oem, c.source, c.match_method, c.match_confidence
FROM public.catalog_vehicle_compatibility c
JOIN public._dedup_winners loser  ON loser.id = c.part_id AND loser.rn > 1
JOIN public._dedup_winners winner ON winner.oem_number = loser.oem_number AND winner.rn = 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_vehicle_compatibility c2
  WHERE c2.part_id = winner.id
    AND lower(c2.brand) = lower(c.brand) AND lower(c2.model) = lower(c.model)
    AND coalesce(lower(c2.engine),'') = coalesce(lower(c.engine),'')
);

DELETE FROM public.catalog_vehicle_compatibility 
WHERE part_id IN (SELECT id FROM public._dedup_winners WHERE rn > 1);

-- Move EPC links
UPDATE public.epc_part_links epl SET part_id = winner.id
FROM public._dedup_winners loser
JOIN public._dedup_winners winner ON winner.oem_number = loser.oem_number AND winner.rn = 1
WHERE epl.part_id = loser.id;

-- Move catalog_part_categories
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT DISTINCT winner.id, cpc.category_id, cpc.is_primary
FROM public.catalog_part_categories cpc
JOIN public._dedup_winners loser  ON loser.id = cpc.part_id AND loser.rn > 1
JOIN public._dedup_winners winner ON winner.oem_number = loser.oem_number AND winner.rn = 1
WHERE NOT EXISTS (
  SELECT 1 FROM public.catalog_part_categories cpc2
  WHERE cpc2.part_id = winner.id AND cpc2.category_id = cpc.category_id
);
DELETE FROM public.catalog_part_categories WHERE part_id IN (SELECT id FROM public._dedup_winners WHERE rn > 1);

-- Move orders + service_order_parts
UPDATE public.orders SET part_id = winner.id
FROM public._dedup_winners loser
JOIN public._dedup_winners winner ON winner.oem_number = loser.oem_number AND winner.rn = 1
WHERE orders.part_id = loser.id;

UPDATE public.service_order_parts SET part_id = winner.id
FROM public._dedup_winners loser
JOIN public._dedup_winners winner ON winner.oem_number = loser.oem_number AND winner.rn = 1
WHERE service_order_parts.part_id = loser.id;

-- DELETE losers
DELETE FROM public.parts_new WHERE id IN (SELECT id FROM public._dedup_winners WHERE rn > 1);

-- Add unique constraint to prevent regrowth
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parts_new_oem_number_unique') THEN
    ALTER TABLE public.parts_new ADD CONSTRAINT parts_new_oem_number_unique UNIQUE (oem_number);
  END IF;
END $$;

-- Cleanup temp table
DROP TABLE IF EXISTS public._dedup_winners;
