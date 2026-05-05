
-- Plán: vypočítat target_global_parent pro každou subkategorii, pak v rámci (target_parent, slug) vybrat jednu canonical, zbytek remapovat a smazat.

-- STEP A: compute target global parent per subcategory
DROP TABLE IF EXISTS _subcat_remap;
CREATE TEMP TABLE _subcat_remap AS
SELECT 
  sc.id AS sub_id,
  sc.slug AS sub_slug,
  sc.created_at AS sub_created,
  global_cat.id AS target_parent_id
FROM catalog_categories sc
JOIN catalog_categories parent ON sc.parent_id = parent.id
JOIN catalog_categories global_cat 
  ON global_cat.is_global=true AND global_cat.node_type='category'
  AND lower(trim(global_cat.name_cs)) = lower(trim(parent.name_cs))
WHERE sc.node_type='subcategory' AND parent.is_global=false;

-- Also include subcats already directly under global parent
INSERT INTO _subcat_remap
SELECT sc.id, sc.slug, sc.created_at, sc.parent_id
FROM catalog_categories sc
JOIN catalog_categories parent ON sc.parent_id=parent.id
WHERE sc.node_type='subcategory' AND parent.is_global=true AND parent.node_type='category'
  AND sc.id NOT IN (SELECT sub_id FROM _subcat_remap);

-- STEP B: pick canonical per (target_parent_id, slug)
DROP TABLE IF EXISTS _subcat_canonical;
CREATE TEMP TABLE _subcat_canonical AS
SELECT DISTINCT ON (target_parent_id, sub_slug)
  target_parent_id, sub_slug, sub_id AS canonical_id
FROM _subcat_remap
ORDER BY target_parent_id, sub_slug, sub_created;

-- STEP C: build full remap (each sub_id → canonical_id)
DROP TABLE IF EXISTS _subcat_full_map;
CREATE TEMP TABLE _subcat_full_map AS
SELECT r.sub_id, c.canonical_id, r.target_parent_id
FROM _subcat_remap r
JOIN _subcat_canonical c USING (target_parent_id, sub_slug);

-- STEP D: remap catalog_part_categories
UPDATE catalog_part_categories cpc
SET category_id = m.canonical_id
FROM _subcat_full_map m
WHERE cpc.category_id = m.sub_id AND cpc.category_id <> m.canonical_id;

-- STEP E: delete non-canonical subcats
DELETE FROM catalog_categories
WHERE id IN (SELECT sub_id FROM _subcat_full_map WHERE sub_id <> canonical_id);

-- STEP F: update parent_id of canonical subcategories
UPDATE catalog_categories sc
SET parent_id = m.target_parent_id
FROM _subcat_full_map m
WHERE sc.id = m.canonical_id AND sc.parent_id <> m.target_parent_id;

-- STEP G: drop scoped (non-global) category nodes
DELETE FROM catalog_categories WHERE node_type='category' AND is_global=false;

-- Verify
DO $$
DECLARE 
  v_globals int; v_subs int; v_orphans int;
BEGIN
  SELECT COUNT(*) INTO v_globals FROM catalog_categories WHERE is_global=true AND node_type='category';
  SELECT COUNT(*) INTO v_subs FROM catalog_categories WHERE node_type='subcategory';
  SELECT COUNT(*) INTO v_orphans FROM catalog_categories sc 
    WHERE sc.node_type='subcategory' 
    AND NOT EXISTS (SELECT 1 FROM catalog_categories p WHERE p.id=sc.parent_id AND p.is_global=true);
  RAISE NOTICE 'Tree shape: % global cats, % subcats, % orphan subcats', v_globals, v_subs, v_orphans;
END $$;
