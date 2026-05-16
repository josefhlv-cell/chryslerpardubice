-- B2: orphan mechanics
DELETE FROM public.mechanics WHERE employee_id IS NULL;

-- B5: migrate new_part_orders.status to order_status_v2 (table is empty)
ALTER TABLE public.new_part_orders
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.order_status_v2 USING (
    CASE status::text
      WHEN 'pending' THEN 'nova'
      WHEN 'confirmed' THEN 'zpracovava_se'
      WHEN 'shipped' THEN 'odeslana'
      WHEN 'delivered' THEN 'dorucena'
      WHEN 'cancelled' THEN 'zrusena'
      ELSE 'nova'
    END::public.order_status_v2
  ),
  ALTER COLUMN status SET DEFAULT 'nova'::public.order_status_v2;

-- B6: backfill manufacturer from catalog_source
UPDATE public.parts_new
SET manufacturer = CASE lower(coalesce(catalog_source, ''))
  WHEN 'mopar' THEN 'Mopar'
  WHEN 'mopar_oem' THEN 'Mopar'
  WHEN 'sag' THEN 'SAG'
  WHEN 'autokelly' THEN 'AutoKelly'
  WHEN 'jm' THEN 'J+M'
  WHEN 'epc' THEN 'Mopar'
  WHEN 'csv' THEN 'Mopar'
  WHEN 'ai' THEN 'Mopar'
  ELSE 'Mopar'
END
WHERE manufacturer IS NULL OR manufacturer = '';