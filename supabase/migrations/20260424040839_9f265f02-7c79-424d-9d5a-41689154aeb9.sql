-- Enable Catalog v2 (Nextis-style unified catalog) for all users
UPDATE public.feature_flags SET enabled = true WHERE feature_key = 'catalog_unified_v2';

-- Disable legacy alternative sources from UI (data preserved)
UPDATE public.feature_flags SET enabled = false WHERE feature_key IN ('catalog_sag', 'catalog_autokelly', 'catalog_intercars');