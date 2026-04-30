UPDATE public.catalog_categories
SET slug = lower(regexp_replace(vehicle_engine, '[^a-zA-Z0-9]+', '-', 'g')) 
        || COALESCE('-' || power_kw || 'kw', '')
WHERE node_type='engine';

DO $$
DECLARE iter int := 0; affected int;
BEGIN
  LOOP
    iter := iter + 1; EXIT WHEN iter > 5;
    WITH dups AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY parent_id, slug ORDER BY created_at) AS rn,
             FIRST_VALUE(id) OVER (PARTITION BY parent_id, slug ORDER BY created_at) AS keep_id
      FROM public.catalog_categories WHERE node_type='engine'
    )
    UPDATE public.catalog_categories child SET parent_id = d.keep_id
    FROM dups d WHERE child.parent_id = d.id AND d.rn > 1;
    
    DELETE FROM public.catalog_categories WHERE id IN (
      SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY parent_id, slug ORDER BY created_at) AS rn
        FROM public.catalog_categories WHERE node_type='engine') x WHERE rn > 1);
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
  END LOOP;
END$$;