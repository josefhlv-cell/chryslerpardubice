
UPDATE public.parts_new SET name = 'Brzdový kotouč' WHERE name ILIKE 'bremsscheibe';
UPDATE public.parts_new SET name = 'Brzdové destičky' WHERE name ILIKE 'bremsbelaege' OR name ILIKE 'bremsbelag';
UPDATE public.parts_new SET name = 'Brzdový třmen' WHERE name ILIKE 'bremssattel';
UPDATE public.parts_new SET name = 'Filtr' WHERE name = 'FILTER' OR name = 'Filter';
UPDATE public.parts_new SET name = 'Olejový filtr' WHERE name ILIKE 'oelfilter%';
UPDATE public.parts_new SET name = 'Vzduchový filtr' WHERE name ILIKE 'luftfilter%';
UPDATE public.parts_new SET name = 'Kabelový svazek' WHERE name = 'KABELSTRANG';
UPDATE public.parts_new SET name = 'Řídicí jednotka' WHERE name = 'STEUERGERAET' OR name = 'ELEKTR.STEUERGERAET';
UPDATE public.parts_new SET name = 'Výměník tepla' WHERE name = 'WAERMETAUSCHER';
UPDATE public.parts_new SET name = 'Držák' WHERE name = 'HALTER';
