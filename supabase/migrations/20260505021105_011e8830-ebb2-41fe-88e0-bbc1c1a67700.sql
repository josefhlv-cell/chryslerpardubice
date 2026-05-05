
ALTER TABLE public.parts_new
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

UPDATE public.parts_new
SET is_active = false
WHERE catalog_source IN ('epc-ai', 'ai-epc')
  AND is_active = true;

UPDATE public.parts_new
SET is_active = false
WHERE catalog_source = 'makro'
  AND is_active = true;

UPDATE public.parts_new
SET availability = 'on_order',
    price_with_vat = 0,
    price_without_vat = 0
WHERE catalog_source = '7zap'
  AND (price_with_vat IS NULL OR price_with_vat = 0)
  AND is_active = true;

UPDATE public.parts_new
SET availability = 'on_order'
WHERE price_with_vat > 100000
  AND catalog_source = '7zap';

CREATE INDEX IF NOT EXISTS idx_parts_new_active_source
  ON public.parts_new(catalog_source, is_active)
  WHERE is_active = true;

INSERT INTO public.catalog_event_log(source, event, level, message, details)
VALUES ('migration', 'catalog_cleanup_2026_05_04', 'info',
  'Skryty AI/makro dily, 7zap bez ceny -> on_order, nerealne ceny opraveny',
  '{}'::jsonb);
