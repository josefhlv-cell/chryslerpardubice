INSERT INTO feature_flags (feature_key, enabled, description)
VALUES 
  ('catalog_sag', true, 'SAG Connect katalog'),
  ('catalog_autokelly', true, 'AutoKelly katalog'),
  ('catalog_intercars', false, 'InterCars katalog')
ON CONFLICT (feature_key) DO NOTHING;