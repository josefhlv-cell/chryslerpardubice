
-- Backfill description into winner from any duplicate that has it
UPDATE public.parts_new p SET
  description = donor.description
FROM (
  SELECT w.oem_number, w.id as winner_id,
    (SELECT description FROM public._dedup_winners d WHERE d.oem_number=w.oem_number AND length(coalesce(d.description,'')) > 10 ORDER BY d.rn LIMIT 1) AS description
  FROM public._dedup_winners w WHERE w.rn=1
) donor
WHERE p.id = donor.winner_id 
  AND donor.description IS NOT NULL 
  AND (p.description IS NULL OR length(p.description) < 10);

-- Backfill image_urls
UPDATE public.parts_new p SET
  image_urls = donor.image_urls
FROM (
  SELECT w.oem_number, w.id as winner_id,
    (SELECT image_urls FROM public._dedup_winners d WHERE d.oem_number=w.oem_number AND d.image_urls IS NOT NULL AND array_length(d.image_urls,1)>0 ORDER BY d.rn LIMIT 1) AS image_urls
  FROM public._dedup_winners w WHERE w.rn=1
) donor
WHERE p.id = donor.winner_id 
  AND donor.image_urls IS NOT NULL 
  AND (p.image_urls IS NULL OR array_length(p.image_urls,1) IS NULL);

-- Backfill prices
UPDATE public.parts_new p SET
  price_with_vat = donor.price_with_vat,
  price_without_vat = COALESCE(donor.price_without_vat, ROUND(donor.price_with_vat / 1.21, 2))
FROM (
  SELECT w.oem_number, w.id as winner_id,
    (SELECT price_with_vat FROM public._dedup_winners d WHERE d.oem_number=w.oem_number AND d.price_with_vat>0 ORDER BY d.rn LIMIT 1) AS price_with_vat,
    (SELECT price_without_vat FROM public._dedup_winners d WHERE d.oem_number=w.oem_number AND d.price_without_vat>0 ORDER BY d.rn LIMIT 1) AS price_without_vat
  FROM public._dedup_winners w WHERE w.rn=1
) donor
WHERE p.id = donor.winner_id 
  AND donor.price_with_vat IS NOT NULL 
  AND p.price_with_vat <= 0;
