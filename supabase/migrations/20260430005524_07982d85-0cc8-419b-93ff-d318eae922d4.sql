
-- Doplnit manufacturer = Mopar pro všechny 7zap a mopar zdroje (oficiální OEM katalog)
UPDATE parts_new
SET manufacturer = 'Mopar'
WHERE catalog_source IN ('7zap','mopar','mopar_oem','epc-link')
  AND (manufacturer IS NULL OR manufacturer = '');

-- Vyčistit "Mopar" z názvů typu "— Mopar 04806159AB" (zbytečné, výrobce je už ve sloupci)
UPDATE parts_new
SET name = regexp_replace(name, '\s*[—-]\s*Mopar\s+[A-Z0-9]+\s*$', '', 'i')
WHERE name ~ 'Mopar\s+[A-Z0-9]{8,}';

-- Pokud po čištění zůstal prázdný/příliš krátký název, doplnit kategorii + OEM
UPDATE parts_new
SET name = COALESCE(NULLIF(category, ''), 'Díl') || ' ' || oem_number
WHERE LENGTH(TRIM(COALESCE(name, ''))) < 5;
