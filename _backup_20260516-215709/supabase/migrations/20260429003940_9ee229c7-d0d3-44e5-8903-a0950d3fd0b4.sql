
-- 1) Normalizace kategorií — sloučení duplicit a EN-suffixů na kanonické CZ názvy
UPDATE public.parts_new SET category = 'Brzdové zařízení'
  WHERE category IN ('Brzdový systém','Brzdový systém (Brakes)','Brzdy');

UPDATE public.parts_new SET category = 'Karoserie'
  WHERE category IN ('Karoserie (Body)','Body','Karosérie');

UPDATE public.parts_new SET category = 'Odpružení'
  WHERE category IN ('Odpružení (Suspension)','Suspension','Náprava','Podvozek (Chassis)','Podvozek');

UPDATE public.parts_new SET category = 'Motor'
  WHERE category IN ('Motor (Engine)','Engine');

UPDATE public.parts_new SET category = 'Elektroinstalace'
  WHERE category IN ('Elektroinstalace (Electrical)','Electrical','Elektoinstalace (Electrical)','Elektrika');

UPDATE public.parts_new SET category = 'Chlazení'
  WHERE category IN ('Chladící systém (Cooling)','Chladící systém','Cooling','Chladicí systém');

UPDATE public.parts_new SET category = 'Klimatizace'
  WHERE category IN ('Klimatizace (A/C)','A/C','HVAC');

UPDATE public.parts_new SET category = 'Výfuk'
  WHERE category IN ('Výfuk (Exhaust)','Exhaust','Výfukový systém');

UPDATE public.parts_new SET category = 'Převodovka'
  WHERE category IN ('Převodovka (Transmission)','Transmission','Gearbox');

UPDATE public.parts_new SET category = 'Údržba'
  WHERE category IN ('Údržba (Maintenance)','Maintenance');

UPDATE public.parts_new SET category = 'Osvětlení'
  WHERE category IN ('Lighting','Světla');

UPDATE public.parts_new SET category = 'Řízení'
  WHERE category IN ('Steering');

UPDATE public.parts_new SET category = 'Interiér'
  WHERE category IN ('Interior');

UPDATE public.parts_new SET category = 'Palivový systém'
  WHERE category IN ('Fuel system','Palivo');

UPDATE public.parts_new SET category = 'Kapaliny a oleje'
  WHERE category IN ('Fluids','Oleje','Náplně');

UPDATE public.parts_new SET category = 'Filtry'
  WHERE category IN ('Filters');

UPDATE public.parts_new SET category = 'Pneumatiky'
  WHERE category IN ('Tyres','Tires','Pneu');

UPDATE public.parts_new SET category = 'Příslušenství'
  WHERE category IN ('Příslušenství a nástroje','Accessories','Tools');

UPDATE public.parts_new SET category = 'Ostatní'
  WHERE category IS NULL OR category = '';

-- 2) Reklasifikace dílů s názvy které jasně určují kategorii (i když mají v DB např. "Údržba" nebo "Ostatní")
-- Brzdy
UPDATE public.parts_new SET category = 'Brzdové zařízení'
  WHERE category NOT IN ('Brzdové zařízení')
    AND (name ~* '\m(brzd|brake|destič|kotouč|třmen|trmen|abs|caliper|rotor|pad)\M'
         OR name ~* '(bremse|bremsbel|bremsschei|bremssattel)');

-- Filtry
UPDATE public.parts_new SET category = 'Filtry'
  WHERE category NOT IN ('Filtry')
    AND name ~* '\m(filtr|filter|oelfilter|luftfilter|kraftstofffilter|kabinov|pollen)\M';

-- Motor — pouze pokud nemá lepší kategorii
UPDATE public.parts_new SET category = 'Motor'
  WHERE category IN ('Ostatní','Údržba')
    AND name ~* '\m(motor|engine|piston|kolben|svíčk|svick|spark|zapalova|valve|ventil|rozvod|timing|hlava válc|cylinder head|zylinderkopf)\M';

-- Výfuk
UPDATE public.parts_new SET category = 'Výfuk'
  WHERE category NOT IN ('Výfuk')
    AND name ~* '\m(výfuk|exhaust|katalyz|catalyst|schalldaempfer|muffler|svody|manifold)\M';

-- Chlazení
UPDATE public.parts_new SET category = 'Chlazení'
  WHERE category NOT IN ('Chlazení')
    AND name ~* '\m(chlad|radiator|kuehler|kühler|termostat|thermostat|water pump|wasserpumpe|čerpadlo vody)\M';

-- Klimatizace
UPDATE public.parts_new SET category = 'Klimatizace'
  WHERE category NOT IN ('Klimatizace')
    AND name ~* '\m(klimat|a/c|kompresor klima|condenser|kondenzátor klima|hvac)\M';

-- Odpružení
UPDATE public.parts_new SET category = 'Odpružení'
  WHERE category IN ('Ostatní','Údržba')
    AND name ~* '\m(tlumič|tlumic|stossdaempfer|shock|pružin|spring|rameno|control arm|náprav|suspension|silentblok|bushing)\M';

-- Řízení
UPDATE public.parts_new SET category = 'Řízení'
  WHERE category NOT IN ('Řízení')
    AND name ~* '\m(řízení|rizeni|steering|servolenkung|tie rod|kulový čep|ball joint|spojovací tyč)\M';

-- Převodovka
UPDATE public.parts_new SET category = 'Převodovka'
  WHERE category NOT IN ('Převodovka')
    AND name ~* '\m(převodov|prevodov|transmission|gearbox|spojk|clutch|kupplung)\M';

-- Elektro
UPDATE public.parts_new SET category = 'Elektroinstalace'
  WHERE category IN ('Ostatní','Údržba')
    AND name ~* '\m(alternátor|alternator|generátor|generator|startér|starter|anlasser|baterie|battery|kabelstrang|kabelov|wiring|relé|relay|pojistka|fuse|senzor|sensor|geber|steuergeraet)\M';

-- Osvětlení
UPDATE public.parts_new SET category = 'Osvětlení'
  WHERE category NOT IN ('Osvětlení')
    AND name ~* '\m(světlomet|světlo|svetlo|žárovka|zarovka|lamp|scheinwerfer|leuchte|headlight|taillight|bulb)\M';

-- 3) Překlad nejčastějších německých názvů dílů na CZ
UPDATE public.parts_new SET name = 'Kabelový svazek' WHERE name ILIKE 'kabelstrang';
UPDATE public.parts_new SET name = 'Snímač' WHERE name ILIKE 'geber';
UPDATE public.parts_new SET name = 'Světlomet' WHERE name ILIKE 'scheinwerfer';
UPDATE public.parts_new SET name = 'Šroub' WHERE name = 'Sroub';
UPDATE public.parts_new SET name = 'Obložení' WHERE name ILIKE 'verkleidung';
UPDATE public.parts_new SET name = 'Tlumič pérování' WHERE name ILIKE 'stossdaempfer';
UPDATE public.parts_new SET name = 'Držák' WHERE name ILIKE 'halter';
UPDATE public.parts_new SET name = 'Víko' WHERE name ILIKE 'deckel';
UPDATE public.parts_new SET name = 'Kryt' WHERE name ILIKE 'abdeckung';
UPDATE public.parts_new SET name = 'Adaptér' WHERE name ILIKE 'anpassungsgerat';
UPDATE public.parts_new SET name = 'Nádobka' WHERE name ILIKE 'behaelter';
UPDATE public.parts_new SET name = 'Vedení' WHERE name ILIKE 'leitung';
UPDATE public.parts_new SET name = 'Zadní nárazník' WHERE name ILIKE 'stossfaenger hinten';
UPDATE public.parts_new SET name = 'Přední nárazník' WHERE name ILIKE 'stossfaenger vorn';
UPDATE public.parts_new SET name = 'Nárazník' WHERE name ILIKE 'stossfaenger';
UPDATE public.parts_new SET name = 'Dveře' WHERE name ILIKE 'tuer';
UPDATE public.parts_new SET name = 'Vzduchový filtr' WHERE name ILIKE 'luftfilter';
UPDATE public.parts_new SET name = 'Olejový filtr' WHERE name ILIKE 'oelfilter';
UPDATE public.parts_new SET name = 'Záslepka' WHERE name ILIKE 'stopfen';
UPDATE public.parts_new SET name = 'Rozvodový řemen' WHERE name ILIKE 'prevodovy remen';
UPDATE public.parts_new SET name = 'Rám' WHERE name ILIKE 'rahmen';
UPDATE public.parts_new SET name = 'Konektor' WHERE name ILIKE 'verbinder';
UPDATE public.parts_new SET name = 'Tlumič výfuku' WHERE name ILIKE 'schalldaempfer';
UPDATE public.parts_new SET name = 'Ovládání' WHERE name ILIKE 'betaetigung';
UPDATE public.parts_new SET name = 'Filtr par' WHERE name ILIKE 'dampffilter';
UPDATE public.parts_new SET name = 'Pryžový doraz' WHERE name ILIKE 'gummipuffer';
UPDATE public.parts_new SET name = 'Výměník tepla' WHERE name ILIKE 'waermetauscher';
UPDATE public.parts_new SET name = 'Dálkové ovládání' WHERE name ILIKE 'fernsteuerung';
UPDATE public.parts_new SET name = 'Válec' WHERE name ILIKE 'zylinder';
UPDATE public.parts_new SET name = 'Sada ozubených kol' WHERE name ILIKE 'kit zahnraeder';
UPDATE public.parts_new SET name = 'Tlumič' WHERE name ILIKE 'absorber';
UPDATE public.parts_new SET name = 'Šroub' WHERE name ILIKE 'bolzen';
UPDATE public.parts_new SET name = 'Zařízení' WHERE name ILIKE 'vorrichtung';
UPDATE public.parts_new SET name = 'Servo řízení' WHERE name ILIKE 'servolenkung';
UPDATE public.parts_new SET name = 'Vzduchové vedení' WHERE name ILIKE 'luftleitung';
UPDATE public.parts_new SET name = 'Píst' WHERE name ILIKE 'kolben';
UPDATE public.parts_new SET name = 'Závěs' WHERE name ILIKE 'scharnier';
UPDATE public.parts_new SET name = 'Rychlospojka' WHERE name ILIKE 'schnellsiegler';
UPDATE public.parts_new SET name = 'Chladič' WHERE name ILIKE 'kuehler';
UPDATE public.parts_new SET name = 'Hlavní brzdový válec' WHERE name ILIKE 'hauptzylinder';
UPDATE public.parts_new SET name = 'Startér' WHERE name ILIKE 'anlasser';
UPDATE public.parts_new SET name = 'Řídicí jednotka' WHERE name ILIKE 'steuergeraet' OR name ILIKE 'elektr.steuergeraet';
UPDATE public.parts_new SET name = 'Zadní světlo' WHERE name ILIKE 'heckleuchte';
UPDATE public.parts_new SET name = 'Světlo SPZ' WHERE name ILIKE 'kennzeich-leuchte';
UPDATE public.parts_new SET name = 'Vačkový hřídel' WHERE name ILIKE 'steuerwelle';
UPDATE public.parts_new SET name = 'Sada těsnění' WHERE name ILIKE 'dichtungssatz';
UPDATE public.parts_new SET name = 'Elektromotor větráku' WHERE name = 'Elektromotor' AND category = 'Chlazení';
UPDATE public.parts_new SET name = 'Zpětné zrcátko' WHERE name ILIKE 'zpetne zrcatko';
UPDATE public.parts_new SET name = 'Kabelový svazek' WHERE name ILIKE 'svazek vodicu';

-- 4) Index na category pro rychlé filtrování
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new (category);
CREATE INDEX IF NOT EXISTS idx_parts_new_compatible_vehicles ON public.parts_new USING gin (to_tsvector('simple', coalesce(compatible_vehicles, '')));
