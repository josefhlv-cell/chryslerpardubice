INSERT INTO feature_flags (feature_key, enabled, description)
VALUES ('catalog_alternatives', true, 'Zobrazit režim Náhrady za OEM v katalogu dílů (SAG, AutoKelly)')
ON CONFLICT (feature_key) DO NOTHING;