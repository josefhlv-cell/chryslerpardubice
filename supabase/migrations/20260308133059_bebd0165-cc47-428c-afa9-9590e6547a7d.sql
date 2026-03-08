
-- Standardize engine names to match UI catalogTree
UPDATE epc_categories SET engine = '3.6L V6' WHERE engine = '3.6' AND brand = 'Chrysler' AND model = '300C';
UPDATE epc_categories SET engine = '3.6L V6' WHERE engine = '3.6' AND brand = 'Dodge' AND model = 'Challenger';
UPDATE epc_categories SET engine = '5.7L HEMI V8' WHERE engine = '5.7' AND brand = 'Dodge' AND model = 'Charger';
UPDATE epc_categories SET engine = '2.0T' WHERE engine = '2.0' AND brand = 'Jeep' AND model = 'Wrangler';
UPDATE epc_categories SET engine = '3.6L V6' WHERE engine = '3.6' AND brand = 'Jeep' AND model = 'Wrangler';
