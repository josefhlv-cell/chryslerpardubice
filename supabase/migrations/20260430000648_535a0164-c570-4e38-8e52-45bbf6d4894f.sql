-- Engines: add power_kw to catalog_categories so the tree distinguishes engine variants by power.
ALTER TABLE public.catalog_categories ADD COLUMN IF NOT EXISTS power_kw integer;

-- Convenient index for tree queries scoped by brand/model/engine + year
CREATE INDEX IF NOT EXISTS idx_catalog_categories_brand_model_node
  ON public.catalog_categories (vehicle_brand, vehicle_model, node_type);

-- Helper view exposing engine cards with year+power for the catalog UI
CREATE OR REPLACE VIEW public.catalog_engine_variants AS
SELECT id, parent_id, vehicle_brand, vehicle_model, vehicle_engine, year_from, year_to, power_kw, slug, name_cs
FROM public.catalog_categories
WHERE node_type = 'engine';

GRANT SELECT ON public.catalog_engine_variants TO anon, authenticated;