-- First check if we need unique constraint on oem_number
-- parts_new doesn't have a unique constraint on oem_number, so we use upsert via a temp approach
-- Delete duplicates first, then insert
DELETE FROM parts_new WHERE oem_number IN ('68052370AA','68052370AB','68052370AC','68052371AA','68456886','68764829','68395495','68685744','68389289','68730266','68109054','68152753','05281090AD','68191349AC');

INSERT INTO parts_new (oem_number, name, price_without_vat, price_with_vat, category, manufacturer, availability, catalog_source, compatible_vehicles, family)
VALUES
  ('68052370AA', 'Přední brzdové destičky OE', 1850, 2238.50, 'Brzdy', 'Mopar', 'available', 'mopar', 'Chrysler 300C, Chrysler Pacifica, Chrysler Town & Country, Chrysler Voyager, Dodge Charger, Dodge Challenger, Dodge Durango, Dodge Grand Caravan, Jeep Grand Cherokee, Jeep Cherokee, Jeep Compass, Jeep Wrangler, RAM 1500', 'Brzdy'),
  ('68052370AB', 'Přední brzdové destičky HD (Heavy Duty)', 2250, 2722.50, 'Brzdy', 'Mopar', 'available', 'mopar', 'Chrysler 300C, Chrysler Pacifica, Chrysler Town & Country, Chrysler Voyager, Dodge Charger, Dodge Challenger, Dodge Durango, Dodge Grand Caravan, Jeep Grand Cherokee, Jeep Cherokee, Jeep Compass, Jeep Wrangler, RAM 1500', 'Brzdy'),
  ('68052370AC', 'Zadní brzdové destičky OE', 1550, 1875.50, 'Brzdy', 'Mopar', 'available', 'mopar', 'Chrysler 300C, Dodge Charger, Dodge Challenger, Dodge Durango, Jeep Grand Cherokee, RAM 1500', 'Brzdy'),
  ('68052371AA', 'Zadní brzdové destičky OE', 1450, 1754.50, 'Brzdy', 'Mopar', 'available', 'mopar', 'Chrysler 300C, Chrysler Pacifica, Chrysler Town & Country, Dodge Grand Caravan, Jeep Cherokee, Jeep Compass, Jeep Wrangler', 'Brzdy'),
  ('68456886', 'Brzdové destičky přední Chrysler 300C', 2100, 2541.00, 'Brzdy', 'Mopar', 'available', 'mopar', 'Chrysler 300C', 'Brzdy'),
  ('68764829', 'Brzdové destičky přední Chrysler 300C SRT', 2650, 3206.50, 'Brzdy', 'Mopar', 'on_order', 'mopar', 'Chrysler 300C 5.7L HEMI V8', 'Brzdy'),
  ('68395495', 'Brzdové destičky přední Dodge Challenger', 2200, 2662.00, 'Brzdy', 'Mopar', 'available', 'mopar', 'Dodge Challenger', 'Brzdy'),
  ('68685744', 'Brzdové destičky přední Dodge Challenger SRT', 2900, 3509.00, 'Brzdy', 'Mopar', 'on_order', 'mopar', 'Dodge Challenger 6.2L Hellcat, Dodge Challenger 6.4L Scat Pack', 'Brzdy'),
  ('68389289', 'Brzdové destičky přední Dodge Charger', 2100, 2541.00, 'Brzdy', 'Mopar', 'available', 'mopar', 'Dodge Charger', 'Brzdy'),
  ('68730266', 'Brzdové destičky přední Dodge Charger SRT', 2800, 3388.00, 'Brzdy', 'Mopar', 'on_order', 'mopar', 'Dodge Charger 5.7L HEMI V8, Dodge Charger 6.2L Hellcat', 'Brzdy'),
  ('68109054', 'Brzdové destičky přední Jeep Wrangler', 1950, 2359.50, 'Brzdy', 'Mopar', 'available', 'mopar', 'Jeep Wrangler', 'Brzdy'),
  ('68152753', 'Brzdové destičky přední Jeep Wrangler JL', 2050, 2480.50, 'Brzdy', 'Mopar', 'available', 'mopar', 'Jeep Wrangler 2.0T, Jeep Wrangler 3.6L V6', 'Brzdy'),
  ('05281090AD', 'Olejový filtr HEMI', 380, 459.80, 'Motor', 'Mopar', 'available', 'mopar', 'Dodge Charger 5.7L HEMI V8, Dodge Challenger 5.7L HEMI V8, Chrysler 300C 5.7L HEMI V8, Jeep Grand Cherokee 5.7L HEMI V8, RAM 1500 5.7L HEMI, Dodge Durango 5.7L HEMI V8', 'Motor'),
  ('68191349AC', 'Olejový filtr 3.6L V6', 350, 423.50, 'Motor', 'Mopar', 'available', 'mopar', 'Chrysler 300C 3.6L V6, Chrysler Pacifica 3.6L V6, Chrysler Town & Country 3.6L V6, Chrysler Voyager 3.6L V6, Dodge Charger 3.6L V6, Dodge Challenger 3.6L V6, Dodge Durango 3.6L V6, Dodge Grand Caravan 3.6L V6, Jeep Grand Cherokee 3.6L V6, Jeep Cherokee 3.2L V6, Jeep Wrangler 3.6L V6', 'Motor')