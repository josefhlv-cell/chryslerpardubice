-- Iterativní deduplikace všech sourozeneckých uzlů se stejným (parent_id, slug)
DO $$
DECLARE 
  iter int := 0;
  affected int;
BEGIN
  LOOP
    iter := iter + 1;
    EXIT WHEN iter > 10;
    
    -- Najdi duplicitní (parent_id, slug)  
    WITH dups AS (
      SELECT id, parent_id, slug,
             ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn,
             FIRST_VALUE(id) OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS keep_id
      FROM public.catalog_categories
    )
    -- Přesměruj děti na keepera
    UPDATE public.catalog_categories child
    SET parent_id = d.keep_id
    FROM dups d
    WHERE child.parent_id = d.id AND d.rn > 1;
    
    -- Přesměruj part mapping
    WITH dups AS (
      SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn,
             FIRST_VALUE(id) OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS keep_id
      FROM public.catalog_categories
    )
    UPDATE public.catalog_part_categories pc
    SET category_id = d.keep_id
    FROM dups d
    WHERE pc.category_id = d.id AND d.rn > 1
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_part_categories pc2 
        WHERE pc2.part_id = pc.part_id AND pc2.category_id = d.keep_id
      );
    
    -- Smaž zbylé duplicitní mapping (ten co by konfliktoval)
    DELETE FROM public.catalog_part_categories pc
    WHERE EXISTS (
      SELECT 1 FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn
        FROM public.catalog_categories
      ) d WHERE d.id = pc.category_id AND d.rn > 1
    );
    
    -- Smaž duplicitní uzly
    DELETE FROM public.catalog_categories WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn
        FROM public.catalog_categories
      ) x WHERE rn > 1
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
    RAISE NOTICE 'Iterace %: smazáno % duplicit', iter, affected;
  END LOOP;
END$$;