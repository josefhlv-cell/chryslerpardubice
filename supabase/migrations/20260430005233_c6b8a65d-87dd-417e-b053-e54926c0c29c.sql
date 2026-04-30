
-- ============================================================
-- J+M tree mirror: replace per-engine categories with one global J+M tree
-- ============================================================

-- 1. Smazat staré per-engine kategorie a subkategorie + jejich mapování
DELETE FROM catalog_part_categories WHERE category_id IN (
  SELECT id FROM catalog_categories WHERE node_type IN ('category','subcategory','global')
);
DELETE FROM catalog_categories WHERE node_type IN ('category','subcategory','global');

-- 2. Vytvořit nové globální J+M kategorie (top level)
WITH new_cats(slug, name_cs, sort_order) AS (
  VALUES
    ('bezpecnostni-system', 'Bezpečnostní systém', 1),
    ('brzdove-zarizeni', 'Brzdové zařízení', 2),
    ('cisteni-skel', 'Čištění skel', 3),
    ('dily-pro-servis', 'Díly pro servis / kontrolu / údržbu', 4),
    ('elektroinstalace', 'Elektroinstalace', 5),
    ('filtr', 'Filtr', 6),
    ('hybridni-pohon', 'Hybridní / elektrický pohon', 7),
    ('chlazeni', 'Chlazení', 8),
    ('informacni-system', 'Informační / komunikační systém', 9),
    ('karoserie', 'Karosérie', 10),
    ('klimatizace', 'Klimatizace', 11),
    ('kola-pneu', 'Kola / pneu', 12),
    ('komfortni-systemy', 'Komfortní systémy', 13),
    ('motor', 'Motor', 14),
    ('odpruzeni-tlumeni', 'Odpružení / tlumení', 15),
    ('palivove-cerpadlo', 'Palivové čerpadlo', 16),
    ('pohon-kol', 'Pohon kol', 17),
    ('pohon-napravy', 'Pohon nápravy', 18),
    ('prepravni-vybaveni', 'Přepravní vybavení', 19),
    ('rizeni', 'Řízení', 20),
    ('spojka', 'Spojka', 21),
    ('vyfukovy-system', 'Výfukový systém', 22),
    ('zapalovani-zhaveni', 'Zapalování / žhavení', 23),
    ('prevodovka', 'Převodovka', 24)
)
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT slug, name_cs, 'category', NULL, sort_order, true FROM new_cats;

-- 3. Vytvořit subkategorie pro hlavní oblasti (J+M strom dle screenshotů)
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='brzdove-zarizeni' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('brzdova-kapalina','Brzdová kapalina',1),
    ('brzdove-hadicky','Brzdové hadičky',2),
    ('brzdovy-trmen','Brzdový třmen',3),
    ('brzdovy-valecek','Brzdový váleček',4),
    ('bubnova-brzda','Bubnová brzda',5),
    ('kotoucova-brzda','Kotoučová brzda',6),
    ('paky-bowdeny','Páky / bowdeny',7),
    ('parkovaci-brzda','Parkovací brzda',8),
    ('regulace-jizdni-dynamiky','Regulace jízdní dynamiky',9),
    ('saci-pumpa','Sací pumpa',10),
    ('spinac-brzdoveho-svetla','Spínač brzdového světla',11)
  ) AS s(slug,name_cs,so);

-- Sub-subkategorie pro Kotoučová brzda
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='kotoucova-brzda' AND node_type='subcategory')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('brzdove-obuk','Brzdové obložení',1),
    ('brzdovy-kotouc','Brzdový kotouč',2),
    ('prislusenstvi-brzdy','Příslušenství',3),
    ('souprava-brzd','Souprava brzd',4)
  ) AS s(slug,name_cs,so);

-- Filtr → podkategorie
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='filtr' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('olejovy-filtr','Olejový filtr',1),
    ('vzduchovy-filtr','Vzduchový filtr',2),
    ('palivovy-filtr','Palivový filtr',3),
    ('kabinovy-filtr','Kabinový filtr (pylový)',4),
    ('hydraulicky-filtr','Hydraulický filtr',5),
    ('filtr-prevodovky','Filtr převodovky',6)
  ) AS s(slug,name_cs,so);

-- Motor → podkategorie
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='motor' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('hlava-valcu','Hlava válců',1),
    ('rozvody-motoru','Rozvody motoru',2),
    ('mazani-motoru','Mazání motoru',3),
    ('sani-motoru','Sání motoru',4),
    ('tesneni-motoru','Těsnění motoru',5),
    ('ulozeni-motoru','Uložení motoru',6),
    ('turbodmychadlo','Turbodmychadlo',7)
  ) AS s(slug,name_cs,so);

-- Chlazení
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='chlazeni' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('chladic-motoru','Chladič motoru',1),
    ('vodni-cerpadlo','Vodní čerpadlo',2),
    ('termostat','Termostat',3),
    ('hadice-chlazeni','Hadice chlazení',4),
    ('expanzni-nadoba','Expanzní nádoba',5),
    ('ventilator-chlazeni','Ventilátor chlazení',6)
  ) AS s(slug,name_cs,so);

-- Odpružení / tlumení
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='odpruzeni-tlumeni' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('tlumice-prujnosti','Tlumiče',1),
    ('pruziny-podvozku','Pružiny',2),
    ('ramena-naprav','Ramena náprav',3),
    ('silentbloky','Silentbloky',4),
    ('stabilizatory','Stabilizátory',5),
    ('loziska-kol','Ložiska kol',6)
  ) AS s(slug,name_cs,so);

-- Elektroinstalace
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='elektroinstalace' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('alternator','Alternátor',1),
    ('starter','Startér',2),
    ('baterie','Baterie',3),
    ('rele-pojistky','Relé a pojistky',4),
    ('senzory','Senzory',5),
    ('kabelaz','Kabeláž',6)
  ) AS s(slug,name_cs,so);

-- Klimatizace
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='klimatizace' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('kompresor-klima','Kompresor klimatizace',1),
    ('kondenzator-klima','Kondenzátor',2),
    ('hadice-klima','Hadice klimatizace',3),
    ('ventilator-interieru','Ventilátor interiéru',4)
  ) AS s(slug,name_cs,so);

-- Karosérie
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='karoserie' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('naraznik','Nárazník',1),
    ('kapota','Kapota',2),
    ('dvere-karoserie','Dveře',3),
    ('blatnik','Blatník',4),
    ('maska-chladice','Maska chladiče',5),
    ('skla-karoserie','Skla',6),
    ('zrcatka','Zrcátka',7)
  ) AS s(slug,name_cs,so);

-- Výfukový systém
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='vyfukovy-system' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('katalyzator','Katalyzátor',1),
    ('tlumic-vyfuku','Tlumič výfuku',2),
    ('lambda-sonda','Lambda sonda',3),
    ('dpf-filtr','DPF filtr',4)
  ) AS s(slug,name_cs,so);

-- Zapalování / žhavení
WITH parent AS (SELECT id FROM catalog_categories WHERE slug='zapalovani-zhaveni' AND node_type='category')
INSERT INTO catalog_categories (slug, name_cs, node_type, parent_id, sort_order, is_global)
SELECT s.slug, s.name_cs, 'subcategory', parent.id, s.so, true FROM parent,
  (VALUES
    ('zapalovaci-svicka','Zapalovací svíčka',1),
    ('zapalovaci-civka','Zapalovací cívka',2),
    ('zhaveni-svicka','Žhavící svíčka',3)
  ) AS s(slug,name_cs,so);
