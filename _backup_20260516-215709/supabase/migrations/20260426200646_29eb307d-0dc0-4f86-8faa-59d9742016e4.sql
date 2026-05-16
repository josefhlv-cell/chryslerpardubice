
DROP TABLE IF EXISTS public._dedup_winners;
CREATE TABLE public._dedup_winners AS
WITH ranked AS (
  SELECT id, oem_number, description, image_urls, price_with_vat, price_without_vat, catalog_source,
    ROW_NUMBER() OVER (
      PARTITION BY oem_number
      ORDER BY
        CASE catalog_source
          WHEN 'mopar' THEN 1 WHEN 'crossref' THEN 2 WHEN 'ai-epc' THEN 3
          WHEN 'epc-ai' THEN 4 WHEN 'makro' THEN 5 WHEN '7zap' THEN 6
          WHEN 'epc-link' THEN 7 ELSE 9
        END,
        (price_with_vat > 0)::int DESC,
        (image_urls IS NOT NULL AND array_length(image_urls,1) > 0)::int DESC,
        (description IS NOT NULL AND length(coalesce(description,'')) > 10)::int DESC,
        updated_at DESC
    ) AS rn
  FROM public.parts_new
)
SELECT * FROM ranked;

CREATE INDEX ON public._dedup_winners(oem_number, rn);
CREATE INDEX ON public._dedup_winners(id);
