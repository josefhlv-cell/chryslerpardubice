
-- Full cleanup: drop per-vehicle category tree, keep only global J+M tree + brand/model/engine nav nodes

-- 1. Snapshot before
INSERT INTO public.catalog_snapshots(label, trigger, stats)
SELECT 'pre-tree-cleanup-' || to_char(now(),'YYYYMMDDHH24MI'), 'manual_cleanup',
  jsonb_build_object(
    'categories_total', (SELECT COUNT(*) FROM catalog_categories),
    'per_vehicle', (SELECT COUNT(*) FROM catalog_categories WHERE node_type IN ('category','subcategory') AND is_global IS NOT TRUE),
    'global', (SELECT COUNT(*) FROM catalog_categories WHERE is_global=true),
    'mappings', (SELECT COUNT(*) FROM catalog_part_categories)
  );

-- 2. Drop per-vehicle category/subcategory nodes (those that are NOT global J+M tree)
DELETE FROM public.catalog_part_categories
WHERE category_id IN (
  SELECT id FROM public.catalog_categories
  WHERE node_type IN ('category','subcategory') AND is_global IS NOT TRUE
);

DELETE FROM public.catalog_categories
WHERE node_type IN ('category','subcategory') AND is_global IS NOT TRUE;

-- 3. Dedup global nodes by (parent_id, slug) — keep oldest, reroute mappings + children
DO $$
DECLARE iter int := 0; affected int;
BEGIN
  LOOP
    iter := iter + 1; EXIT WHEN iter > 10;
    WITH dups AS (
      SELECT id,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS keep_id
      FROM public.catalog_categories WHERE is_global=true
    )
    UPDATE public.catalog_categories child SET parent_id = d.keep_id
    FROM dups d WHERE child.parent_id = d.id AND d.rn > 1;

    WITH dups AS (
      SELECT id,
        ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn,
        FIRST_VALUE(id) OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS keep_id
      FROM public.catalog_categories WHERE is_global=true
    )
    UPDATE public.catalog_part_categories pc SET category_id = d.keep_id
    FROM dups d WHERE pc.category_id = d.id AND d.rn > 1
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_part_categories pc2
        WHERE pc2.part_id = pc.part_id AND pc2.category_id = d.keep_id
      );

    DELETE FROM public.catalog_part_categories pc
    WHERE EXISTS (
      SELECT 1 FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn
        FROM public.catalog_categories WHERE is_global=true
      ) d WHERE d.id = pc.category_id AND d.rn > 1
    );

    DELETE FROM public.catalog_categories WHERE id IN (
      SELECT id FROM (
        SELECT id, ROW_NUMBER() OVER (PARTITION BY COALESCE(parent_id::text,'root'), slug ORDER BY created_at) AS rn
        FROM public.catalog_categories WHERE is_global=true
      ) x WHERE rn > 1
    );
    GET DIAGNOSTICS affected = ROW_COUNT;
    EXIT WHEN affected = 0;
  END LOOP;
END$$;

-- 4. Log
INSERT INTO public.catalog_event_log(source, event, level, message, details)
VALUES ('migration','tree_cleanup_full','info','Plný cleanup: zachován jen globální J+M strom + nav uzly',
  jsonb_build_object(
    'categories_after', (SELECT COUNT(*) FROM catalog_categories),
    'global_after', (SELECT COUNT(*) FROM catalog_categories WHERE is_global=true)
  ));
