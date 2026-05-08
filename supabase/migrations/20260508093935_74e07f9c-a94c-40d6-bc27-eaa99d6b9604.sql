UPDATE public.parts_new
SET availability = 'on_order',
    last_price_update = COALESCE(last_price_update, now())
WHERE catalog_source = '7zap'
  AND (price_with_vat IS NULL OR price_with_vat <= 0)
  AND availability IS DISTINCT FROM 'on_order';