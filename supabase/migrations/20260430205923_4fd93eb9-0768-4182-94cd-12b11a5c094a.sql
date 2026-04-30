
-- Sloučit engine duplicity podle (parent_id, name_cs) — slug může být různý
DO $$
DECLARE r RECORD; canonical_id uuid;
BEGIN
  FOR r IN
    SELECT parent_id, name_cs, array_agg(id ORDER BY created_at) ids
    FROM catalog_categories WHERE node_type='engine' AND parent_id IS NOT NULL
    GROUP BY parent_id, name_cs HAVING COUNT(*) > 1
  LOOP
    canonical_id := r.ids[1];
    UPDATE catalog_part_categories SET category_id = canonical_id WHERE category_id = ANY(r.ids[2:]);
    DELETE FROM catalog_categories WHERE id = ANY(r.ids[2:]);
  END LOOP;
END $$;

-- Normalizovat slug u engine podle name_cs (odstranit kW/rok suffixy ve slugu)
UPDATE catalog_categories
SET slug = lower(regexp_replace(regexp_replace(name_cs, '\s+', '-', 'g'), '[^a-z0-9-]', '', 'g'))
WHERE node_type='engine';
