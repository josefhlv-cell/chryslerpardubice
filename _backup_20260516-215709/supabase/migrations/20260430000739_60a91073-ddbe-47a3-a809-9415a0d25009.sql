WITH engine_power AS (
  SELECT * FROM (VALUES
    ('2.5 CRD', 105), ('2.7 V6', 142), ('2.8 CRD', 130), ('2.0 CRD', 103), ('2.0', 115),
    ('2.0T', 175), ('2.2 CRD', 89), ('2.4', 130), ('1.6', 85),
    ('3.0 CRD', 160), ('3.0 V6 CRD', 176), ('3.0 EcoDiesel', 179), ('3.2 V6', 160), ('3.2 SRT-6', 246),
    ('3.3 V6', 128), ('3.5 V6', 186), ('3.6 V6', 210), ('3.6 V6 Hybrid', 194), ('3.7 V6', 156),
    ('3.8 V6', 145), ('4.0 V6', 187), ('4.6 V8', 239), ('5.3 V8', 239),
    ('5.7 HEMI', 268), ('6.0 V8', 254), ('6.1 SRT8', 317), ('6.2 V8', 313),
    ('6.4 SRT', 350), ('6.4 HEMI', 302), ('6.7 Cummins', 276)
  ) AS t(engine, kw)
)
UPDATE public.catalog_categories cc
SET power_kw = ep.kw
FROM engine_power ep
WHERE cc.node_type = 'engine' AND cc.vehicle_engine = ep.engine AND cc.power_kw IS NULL;

UPDATE public.catalog_categories
SET name_cs = vehicle_engine 
  || COALESCE(' (' || power_kw || ' kW', '')
  || COALESCE(', ' || year_from::text || COALESCE('–' || year_to::text, '+'), '')
  || CASE WHEN power_kw IS NOT NULL OR year_from IS NOT NULL THEN ')' ELSE '' END
WHERE node_type = 'engine';

-- Také přidáme power_kw do nextis_vehicles, kde je NULL, dle stejné mapy
WITH engine_power AS (
  SELECT * FROM (VALUES
    ('2.5 CRD', 105), ('2.7 V6', 142), ('2.8 CRD', 130), ('2.0 CRD', 103), ('2.0', 115),
    ('2.0T', 175), ('2.2 CRD', 89), ('2.4', 130), ('1.6', 85),
    ('3.0 CRD', 160), ('3.0 V6 CRD', 176), ('3.0 EcoDiesel', 179), ('3.2 V6', 160), ('3.2 SRT-6', 246),
    ('3.3 V6', 128), ('3.5 V6', 186), ('3.6 V6', 210), ('3.6 V6 Hybrid', 194), ('3.7 V6', 156),
    ('3.8 V6', 145), ('4.0 V6', 187), ('4.6 V8', 239), ('5.3 V8', 239),
    ('5.7 HEMI', 268), ('6.0 V8', 254), ('6.1 SRT8', 317), ('6.2 V8', 313),
    ('6.4 SRT', 350), ('6.4 HEMI', 302), ('6.7 Cummins', 276)
  ) AS t(engine, kw)
)
UPDATE public.nextis_vehicles nv
SET power_kw = ep.kw
FROM engine_power ep
WHERE nv.engine = ep.engine AND nv.power_kw IS NULL;

-- Oprava generických názvů "Mopar XXX — Kategorie" → smysluplnější placeholder dokud se nedotáhnou z J+M
UPDATE public.parts_new
SET name = CASE category
    WHEN 'Motor' THEN 'Díl motoru — Mopar ' || oem_number
    WHEN 'Karoserie' THEN 'Karosářský díl — Mopar ' || oem_number
    WHEN 'Elektroinstalace' THEN 'Elektro díl — Mopar ' || oem_number
    WHEN 'Klimatizace' THEN 'Díl klimatizace — Mopar ' || oem_number
    WHEN 'Brzdový systém' THEN 'Brzdový díl — Mopar ' || oem_number
    WHEN 'Filtry' THEN 'Filtr — Mopar ' || oem_number
    WHEN 'Chlazení' THEN 'Díl chlazení — Mopar ' || oem_number
    ELSE COALESCE(category, 'Náhradní díl') || ' — Mopar ' || oem_number
  END
WHERE name LIKE 'Mopar %—%';