DO $$
DECLARE
  loop_count int := 0;
  affected int;
BEGIN
  LOOP
    loop_count := loop_count + 1;
    EXIT WHEN loop_count > 20;

    -- Find duplicate siblings (same parent_id + slug)
    DROP TABLE IF EXISTS _dup_pairs;
    CREATE TEMP TABLE _dup_pairs AS
    WITH ranked AS (
      SELECT id, parent_id, slug, name_cs,
        ROW_NUMBER() OVER (
          PARTITION BY COALESCE(parent_id::text,'ROOT'), slug
          ORDER BY (SELECT count(*) FROM public.catalog_categories c WHERE c.parent_id = catalog_categories.id) DESC,
                   length(name_cs) ASC, id ASC
        ) AS rn
      FROM public.catalog_categories
    ),
    keepers AS (SELECT parent_id, slug, id AS keep_id FROM ranked WHERE rn = 1)
    SELECT r.id AS loser_id, k.keep_id
    FROM ranked r
    JOIN keepers k
      ON COALESCE(k.parent_id::text,'ROOT') = COALESCE(r.parent_id::text,'ROOT')
     AND k.slug = r.slug
    WHERE r.rn > 1;

    SELECT count(*) INTO affected FROM _dup_pairs;
    EXIT WHEN affected = 0;

    -- Repoint children of losers to keepers
    UPDATE public.catalog_categories cc
    SET parent_id = dp.keep_id
    FROM _dup_pairs dp
    WHERE cc.parent_id = dp.loser_id
      -- avoid duplicate sibling on the keeper
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_categories x
        WHERE x.parent_id = dp.keep_id AND x.slug = cc.slug
      );

    -- Any remaining children under loser (would have collided): delete their part mappings + node
    DELETE FROM public.catalog_part_categories
    WHERE category_id IN (
      SELECT cc.id FROM public.catalog_categories cc
      JOIN _dup_pairs dp ON cc.parent_id = dp.loser_id
    );
    DELETE FROM public.catalog_categories
    WHERE parent_id IN (SELECT loser_id FROM _dup_pairs);

    -- Repoint part mappings on losers themselves
    UPDATE public.catalog_part_categories pc
    SET category_id = dp.keep_id
    FROM _dup_pairs dp
    WHERE pc.category_id = dp.loser_id
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_part_categories x
        WHERE x.part_id = pc.part_id AND x.category_id = dp.keep_id
      );
    DELETE FROM public.catalog_part_categories
    WHERE category_id IN (SELECT loser_id FROM _dup_pairs);

    -- Finally delete loser nodes
    DELETE FROM public.catalog_categories
    WHERE id IN (SELECT loser_id FROM _dup_pairs);
  END LOOP;
END $$;

-- Now collapse remaining model duplicates that share (brand, model) but different slugs
DO $$
DECLARE
  loop_count int := 0;
  affected int;
BEGIN
  LOOP
    loop_count := loop_count + 1;
    EXIT WHEN loop_count > 10;

    DROP TABLE IF EXISTS _model_dups;
    CREATE TEMP TABLE _model_dups AS
    WITH ranked AS (
      SELECT id, vehicle_brand, vehicle_model, slug, parent_id,
        ROW_NUMBER() OVER (
          PARTITION BY vehicle_brand, vehicle_model
          ORDER BY (SELECT count(*) FROM public.catalog_categories c WHERE c.parent_id = catalog_categories.id) DESC,
                   length(name_cs) ASC, id ASC
        ) AS rn
      FROM public.catalog_categories WHERE node_type='model'
    ),
    keepers AS (SELECT vehicle_brand, vehicle_model, id AS keep_id FROM ranked WHERE rn=1)
    SELECT r.id AS loser_id, k.keep_id
    FROM ranked r
    JOIN keepers k ON k.vehicle_brand=r.vehicle_brand AND k.vehicle_model=r.vehicle_model
    WHERE r.rn > 1;

    SELECT count(*) INTO affected FROM _model_dups;
    EXIT WHEN affected = 0;

    -- Move engines from loser to keeper, but skip if keeper already has same-slug engine (those will be folded in next outer iteration via slug-based dedupe)
    UPDATE public.catalog_categories cc
    SET parent_id = md.keep_id
    FROM _model_dups md
    WHERE cc.parent_id = md.loser_id
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_categories x
        WHERE x.parent_id = md.keep_id AND x.slug = cc.slug
      );

    -- Move part mappings off losers
    UPDATE public.catalog_part_categories pc
    SET category_id = md.keep_id
    FROM _model_dups md
    WHERE pc.category_id = md.loser_id
      AND NOT EXISTS (
        SELECT 1 FROM public.catalog_part_categories x
        WHERE x.part_id = pc.part_id AND x.category_id = md.keep_id
      );
    DELETE FROM public.catalog_part_categories WHERE category_id IN (SELECT loser_id FROM _model_dups);

    -- For any engines still under loser (slug collision), delete them and their subtree
    WITH RECURSIVE subtree AS (
      SELECT id FROM public.catalog_categories WHERE parent_id IN (SELECT loser_id FROM _model_dups)
      UNION ALL
      SELECT c.id FROM public.catalog_categories c JOIN subtree s ON c.parent_id = s.id
    )
    DELETE FROM public.catalog_part_categories WHERE category_id IN (SELECT id FROM subtree);

    WITH RECURSIVE subtree AS (
      SELECT id FROM public.catalog_categories WHERE parent_id IN (SELECT loser_id FROM _model_dups)
      UNION ALL
      SELECT c.id FROM public.catalog_categories c JOIN subtree s ON c.parent_id = s.id
    )
    DELETE FROM public.catalog_categories WHERE id IN (SELECT id FROM subtree);

    -- Delete loser models
    DELETE FROM public.catalog_categories WHERE id IN (SELECT loser_id FROM _model_dups);
  END LOOP;
END $$;

-- Clean labels: model nodes show plain model name
UPDATE public.catalog_categories
SET name_cs = vehicle_model
WHERE node_type = 'model'
  AND vehicle_model IS NOT NULL
  AND name_cs <> vehicle_model;