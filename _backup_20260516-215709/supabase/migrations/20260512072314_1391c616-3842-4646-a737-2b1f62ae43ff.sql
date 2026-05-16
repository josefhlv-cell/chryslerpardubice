
DELETE FROM public.catalog_part_categories;

WITH g AS (
  SELECT id, name_cs FROM public.catalog_categories WHERE node_type='global'
),
classified AS (
  SELECT
    p.id AS part_id,
    (
      SELECT CASE
        WHEN h ~ '(brzd|brake|brems|desti|kotou|trmen| abs |valec)' THEN 'Brzdový systém'
        WHEN h ~ '(filtr|filter)' THEN 'Filtry'
        WHEN h ~ '(chlad|kuehl|cool|termostat|vodni cerpad|wass)' THEN 'Chlazení'
        WHEN h ~ '(altern|start|bater|svick|svicka|kabel|svazek|senzor|sensor|rele|licht|anlass|zhav|zapal)' THEN 'Elektroinstalace'
        WHEN h ~ '(vyfuk|exhaust|katalyz|lambda|dpf)' THEN 'Výfuk'
        WHEN h ~ '(prevod|spojk|clutch|getriebe|kardan|diferenc|poloos)' THEN 'Převodovka'
        WHEN h ~ '(tlumi|pruz|rameno|silent|stabil|lozisk|feder|naprav|podvoz)' THEN 'Odpružení'
        WHEN h ~ '(rizeni|servo|volant|tyc rizeni|lenk)' THEN 'Řízení'
        WHEN h ~ '(svet|lamp|zarov|mlhov|osvet)' THEN 'Osvětlení'
        WHEN h ~ '(klimat|kompresor|kondenz|vypar|topeni|a/c)' THEN 'Klimatizace'
        WHEN h ~ '(paliv|fuel|vstrik|injekt|nadrz)' THEN 'Palivový systém'
        WHEN h ~ '(karoser|naraz|kapot|dver|blatn|zrc|sklo|maska)' THEN 'Karoserie'
        WHEN h ~ '(sedadl|interi|palub|airbag| pas |oper)' THEN 'Interiér'
        WHEN h ~ '(olej|kapalin|fluid|maziv|aditiv)' THEN 'Náplně a kapaliny'
        WHEN h ~ '(pneu|disk|kolo|tpms)' THEN 'Pneumatiky a disky'
        WHEN h ~ '(prislu|nosic|tazn|narad)' THEN 'Příslušenství a nářadí'
        WHEN h ~ '(motor|engine|rozvod|piston)' THEN 'Motor'
        WHEN h ~ '(udrzba|maintenance|servis)' THEN 'Údržba'
        ELSE 'Ostatní'
      END
      FROM (SELECT lower(translate(coalesce(p.name,'')||' '||coalesce(p.category,''),
        'áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ',
        'acdeeinorstuuyzACDEEINORSTUUYZ')) AS h) s
    ) AS gname
  FROM public.parts_new p
)
INSERT INTO public.catalog_part_categories (part_id, category_id, is_primary)
SELECT c.part_id, g.id, true
FROM classified c JOIN g ON g.name_cs = c.gname
ON CONFLICT (part_id, category_id) DO NOTHING;
