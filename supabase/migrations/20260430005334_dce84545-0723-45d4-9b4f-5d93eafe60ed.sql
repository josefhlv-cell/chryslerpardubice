
-- Sjednotit category labely v parts_new na nové J+M názvy
UPDATE parts_new SET category = 'Karosérie' WHERE category IN ('Karoserie','Karoserie a exteriérové díly','Dveře a komponenty');
UPDATE parts_new SET category = 'Výfukový systém' WHERE category = 'Výfuk';
UPDATE parts_new SET category = 'Odpružení / tlumení' WHERE category IN ('Odpružení','Zavěšení kol');
UPDATE parts_new SET category = 'Brzdové zařízení' WHERE category IN ('Brzdové třmeny');
UPDATE parts_new SET category = 'Filtr' WHERE category IN ('Filtry','Kabinové filtry','Kabinový filtr');
UPDATE parts_new SET category = 'Motor' WHERE category IN ('Motor a komponenty motoru','Elektronika motoru','Kabelový svazek motoru');
UPDATE parts_new SET category = 'Chlazení' WHERE category = 'Chlazení motoru';
UPDATE parts_new SET category = 'Elektroinstalace' WHERE category IN ('Elektronika','Elektrické komponenty a spínače','Senzory','Snímače a senzory');
UPDATE parts_new SET category = 'Bezpečnostní systém' WHERE category IN ('Airbagy');
UPDATE parts_new SET category = 'Čištění skel' WHERE category = 'Stěrače a ostřikovače';
UPDATE parts_new SET category = 'Kapaliny a oleje' WHERE category IN ('Olej do automatické převodovky');
UPDATE parts_new SET category = 'Kola / pneu' WHERE category = 'Pneumatiky';
UPDATE parts_new SET category = 'Karosérie' WHERE category = 'Štítky a znaky';

-- Re-keyword: doplnit kategorii podle názvu pro 'Ostatní' a NULL
UPDATE parts_new SET category = 'Brzdové zařízení'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND (lower(name) ~ '(brzd|kotou[čc]|desti[čc]k|t[řr]men|abs )');
UPDATE parts_new SET category = 'Filtr'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ 'filtr';
UPDATE parts_new SET category = 'Chlazení'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ '(chladi[čc]|termostat|vodn[íi] [čc]erpadl)';
UPDATE parts_new SET category = 'Motor'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ '(motor|hlava v[áa]lc|olejov[áa] van|va[čc]k|p[íi]st)';
UPDATE parts_new SET category = 'Odpružení / tlumení'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ '(tlumi[čc]|pru[žz]in|silentbl|stabiliz|rameno)';
UPDATE parts_new SET category = 'Elektroinstalace'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ '(altern[áa]tor|start[ée]r|baterie|sv[íi][čc]k|c[íi]vk|rel[ée]|pojistk)';
UPDATE parts_new SET category = 'Výfukový systém'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ '(v[ýy]fuk|katalyz|lambd|dpf)';
UPDATE parts_new SET category = 'Klimatizace'
  WHERE (category IS NULL OR category IN ('Ostatní','Příslušenství')) 
    AND lower(name) ~ '(klimati|kompresor klima|kondenz[áa]tor)';

-- Vyčistit starou mapovací tabulku a postavit znovu na nový strom
DELETE FROM catalog_part_categories;

-- Mapování parts_new.category → catalog_categories (top-level kategorie)
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id
FROM parts_new p
JOIN catalog_categories c ON c.node_type = 'category' 
  AND c.is_global = true
  AND c.name_cs = p.category
WHERE p.category IS NOT NULL
ON CONFLICT DO NOTHING;

-- Subcategory mapování pro Brzdové zařízení
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='brzdovy-trmen' AND lower(p.name) ~ 't[řr]men'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='brzdovy-kotouc' AND lower(p.name) ~ '(kotou[čc])'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='brzdove-obuk' AND lower(p.name) ~ '(desti[čc]k|oblo[žz]en)'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='brzdova-kapalina' AND lower(p.name) ~ 'brzdov[áa] kapal'
ON CONFLICT DO NOTHING;

-- Filtr subcategories
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='olejovy-filtr' AND lower(p.name) ~ 'olejov[ýy] filtr'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='vzduchovy-filtr' AND lower(p.name) ~ 'vzduchov[ýy] filtr'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='palivovy-filtr' AND lower(p.name) ~ 'palivov[ýy] filtr'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='kabinovy-filtr' AND lower(p.name) ~ '(kabinov|pylov)'
ON CONFLICT DO NOTHING;

-- Motor subcategories
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='rozvody-motoru' AND lower(p.name) ~ '(rozvod|zahnriem|kladka rozvodu|napinak)'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='turbodmychadlo' AND lower(p.name) ~ 'turbo'
ON CONFLICT DO NOTHING;

-- Chlazení subcategories
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='vodni-cerpadlo' AND lower(p.name) ~ 'vodn[íi] [čc]erpadl'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='termostat' AND lower(p.name) ~ 'termostat'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='chladic-motoru' AND lower(p.name) ~ 'chladi[čc]'
ON CONFLICT DO NOTHING;

-- Odpružení subcategories
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='tlumice-prujnosti' AND lower(p.name) ~ 'tlumi[čc]'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='pruziny-podvozku' AND lower(p.name) ~ 'pru[žz]in'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='loziska-kol' AND lower(p.name) ~ 'lo[žz]isk'
ON CONFLICT DO NOTHING;

-- Elektroinstalace
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='alternator' AND lower(p.name) ~ 'altern[áa]tor'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='starter' AND lower(p.name) ~ 'start[ée]r'
ON CONFLICT DO NOTHING;

-- Zapalování
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='zapalovaci-svicka' AND lower(p.name) ~ 'zapalovac[íi] sv[íi][čc]k'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='zapalovaci-civka' AND lower(p.name) ~ 'zapalovac[íi] c[íi]vk'
ON CONFLICT DO NOTHING;

-- Výfuk
INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='katalyzator' AND lower(p.name) ~ 'katalyz'
ON CONFLICT DO NOTHING;

INSERT INTO catalog_part_categories (part_id, category_id)
SELECT p.id, c.id FROM parts_new p, catalog_categories c
WHERE c.slug='lambda-sonda' AND lower(p.name) ~ 'lambd'
ON CONFLICT DO NOTHING;
