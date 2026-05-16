
-- Záloha (idempotent)
CREATE TABLE IF NOT EXISTS _backup_catalog_categories_20260430_v3 AS SELECT * FROM catalog_categories;
CREATE TABLE IF NOT EXISTS _backup_catalog_part_categories_20260430_v3 AS SELECT * FROM catalog_part_categories;

-- Pomocná funkce: bezpečně přepojí parent_id, smaže duplikáty se slug kolizí
CREATE OR REPLACE FUNCTION _safe_repoint_children(_old_parent uuid, _new_parent uuid) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  child RECORD;
  existing_id uuid;
BEGIN
  FOR child IN
    SELECT id, slug FROM catalog_categories WHERE parent_id = _old_parent
  LOOP
    -- Existuje už uzel se stejným slugem pod novým rodičem?
    SELECT id INTO existing_id FROM catalog_categories
      WHERE parent_id = _new_parent AND slug = child.slug LIMIT 1;
    IF existing_id IS NOT NULL AND existing_id != child.id THEN
      -- Kolize: přesměruj děti dítěte i mappings, pak smaž
      PERFORM _safe_repoint_children(child.id, existing_id);
      UPDATE catalog_part_categories SET category_id = existing_id WHERE category_id = child.id;
      DELETE FROM catalog_categories WHERE id = child.id;
    ELSE
      UPDATE catalog_categories SET parent_id = _new_parent WHERE id = child.id;
    END IF;
  END LOOP;
END $$;

-- 1) RAM normalizace
UPDATE catalog_categories SET vehicle_brand = 'RAM' WHERE vehicle_brand = 'Ram';
UPDATE catalog_categories SET slug = lower(regexp_replace(slug, '^ram-', 'ram-', 'g')) WHERE vehicle_brand='RAM';
UPDATE catalog_vehicle_compatibility SET brand = 'RAM' WHERE brand = 'Ram';
UPDATE nextis_vehicles SET brand = 'RAM' WHERE brand = 'Ram';

-- 2) Normalizovat ENGINE názvy NEJDŘÍVE (vytvoří víc duplicit, ale opravíme)
UPDATE catalog_categories
SET name_cs = trim(regexp_replace(name_cs, '\s*\([^)]*\)\s*', '', 'g'))
WHERE node_type = 'engine' AND name_cs ~ '\(';

-- 3) Sloučit duplicitní ENGINE pod stejným rodičem (po normalizaci názvů)
DO $$
DECLARE r RECORD; canonical_id uuid;
BEGIN
  FOR r IN
    SELECT parent_id, slug, array_agg(id ORDER BY created_at) ids
    FROM catalog_categories WHERE node_type='engine' AND parent_id IS NOT NULL
    GROUP BY parent_id, slug HAVING COUNT(*) > 1
  LOOP
    canonical_id := r.ids[1];
    UPDATE catalog_part_categories SET category_id = canonical_id WHERE category_id = ANY(r.ids[2:]);
    DELETE FROM catalog_categories WHERE id = ANY(r.ids[2:]);
  END LOOP;
END $$;

-- 4) Sloučit duplicitní MODEL nodes (přes safe repoint)
DO $$
DECLARE r RECORD; canonical_id uuid; dup_id uuid;
BEGIN
  FOR r IN
    SELECT vehicle_brand, lower(vehicle_model) lm, array_agg(id ORDER BY created_at) ids
    FROM catalog_categories WHERE node_type='model'
    GROUP BY vehicle_brand, lower(vehicle_model) HAVING COUNT(*) > 1
  LOOP
    canonical_id := r.ids[1];
    FOREACH dup_id IN ARRAY r.ids[2:] LOOP
      PERFORM _safe_repoint_children(dup_id, canonical_id);
      UPDATE catalog_part_categories SET category_id = canonical_id WHERE category_id = dup_id;
      DELETE FROM catalog_categories WHERE id = dup_id;
    END LOOP;
  END LOOP;
END $$;

-- 5) Po merge modelů znovu sloučit engine duplicity (mohly vzniknout)
DO $$
DECLARE r RECORD; canonical_id uuid;
BEGIN
  FOR r IN
    SELECT parent_id, slug, array_agg(id ORDER BY created_at) ids
    FROM catalog_categories WHERE node_type='engine' AND parent_id IS NOT NULL
    GROUP BY parent_id, slug HAVING COUNT(*) > 1
  LOOP
    canonical_id := r.ids[1];
    UPDATE catalog_part_categories SET category_id = canonical_id WHERE category_id = ANY(r.ids[2:]);
    DELETE FROM catalog_categories WHERE id = ANY(r.ids[2:]);
  END LOOP;
END $$;

-- 6) Sloučení kategorií (duplicitní názvy)
DO $$
DECLARE
  mapping jsonb := '{
    "Filtr": "Filtry",
    "Karoserie": "Karosérie",
    "Výfukový systém": "Výfuk",
    "Odpružení / tlumení": "Odpružení",
    "Kola / pneu": "Pneumatiky",
    "Pohon kol": "Pohon nápravy",
    "Palivové čerpadlo": "Palivový systém",
    "Díly pro servis / kontrolu / údržbu": "Údržba"
  }'::jsonb;
  k text; v text;
  old_id uuid; new_id uuid;
BEGIN
  FOR k, v IN SELECT * FROM jsonb_each_text(mapping) LOOP
    -- Pro každý starý uzel najdi/vytvoř kanonický se stejným parent_id
    FOR old_id IN SELECT id FROM catalog_categories WHERE name_cs = k AND node_type='category' LOOP
      SELECT id INTO new_id FROM catalog_categories
        WHERE name_cs = v AND node_type='category'
        AND COALESCE(parent_id::text,'NULL') = COALESCE((SELECT parent_id FROM catalog_categories WHERE id=old_id)::text,'NULL')
        LIMIT 1;
      IF new_id IS NULL THEN
        -- prostě přejmenuj
        UPDATE catalog_categories SET name_cs = v, slug = lower(regexp_replace(v,'[^a-zA-Z0-9]+','-','g')) WHERE id = old_id;
      ELSE
        UPDATE catalog_part_categories SET category_id = new_id WHERE category_id = old_id;
        PERFORM _safe_repoint_children(old_id, new_id);
        DELETE FROM catalog_categories WHERE id = old_id;
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 7) parts_new.category sjednocení
UPDATE parts_new SET category = 'Filtry' WHERE category = 'Filtr';
UPDATE parts_new SET category = 'Karosérie' WHERE category = 'Karoserie';
UPDATE parts_new SET category = 'Výfuk' WHERE category = 'Výfukový systém';
UPDATE parts_new SET category = 'Odpružení' WHERE category = 'Odpružení / tlumení';
UPDATE parts_new SET category = 'Pneumatiky' WHERE category = 'Kola / pneu';
UPDATE parts_new SET category = 'Pohon nápravy' WHERE category = 'Pohon kol';
UPDATE parts_new SET category = 'Palivový systém' WHERE category = 'Palivové čerpadlo';
UPDATE parts_new SET category = 'Údržba' WHERE category = 'Díly pro servis / kontrolu / údržbu';

-- 8) Smazat duplicitní part-category vazby
DELETE FROM catalog_part_categories a USING catalog_part_categories b
WHERE a.ctid < b.ctid AND a.part_id = b.part_id AND a.category_id = b.category_id;

-- Cleanup helper
DROP FUNCTION _safe_repoint_children(uuid, uuid);
