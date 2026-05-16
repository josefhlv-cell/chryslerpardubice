-- Oprava: aftermarket díly s falešným Mopar labelem
UPDATE public.parts_new
SET manufacturer = NULL
WHERE catalog_source IN ('epc-ai', 'ai-epc', 'makro', 'autokelly', 'crossref', 'sag')
  AND lower(manufacturer) = 'mopar';

-- Indexy pro rychlost
CREATE INDEX IF NOT EXISTS idx_parts_new_category_source
  ON public.parts_new(category, catalog_source);

CREATE INDEX IF NOT EXISTS idx_parts_new_oem_lower
  ON public.parts_new(lower(oem_number));

-- Vyčisti catalog_event_log starší 30 dní (debug/info)
DELETE FROM public.catalog_event_log
WHERE created_at < now() - interval '30 days'
  AND level IN ('debug', 'info');