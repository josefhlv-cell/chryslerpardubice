
-- ============================================================
-- FÁZE 1: Unifikovaná katalogová architektura (paralelní běh)
-- Žádná modifikace parts_new / parts_catalog. Pouze nové tabulky.
-- ============================================================

-- 1) ENUM pro zdroje katalogu
DO $$ BEGIN
  CREATE TYPE public.catalog_source_type AS ENUM (
    'mopar', 'mopar_oem', 'sag', 'autokelly', 'jm', 'csv', 'epc', 'ai', 'manual'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Hierarchický strom kategorií (Nextis-style + globální sekce)
CREATE TABLE IF NOT EXISTS public.catalog_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
  slug text NOT NULL,
  name_cs text NOT NULL,
  name_en text,
  -- typ uzlu pro odlišení vehicle hierarchy vs product categories
  node_type text NOT NULL DEFAULT 'category',
    -- 'brand' | 'model' | 'type' | 'engine' | 'category' | 'subcategory' | 'global'
  -- vazba na konkrétní vozidlo (pro vehicle nodes)
  vehicle_brand text,
  vehicle_model text,
  vehicle_engine text,
  year_from int,
  year_to int,
  -- meta
  source catalog_source_type NOT NULL DEFAULT 'manual',
  external_id text, -- pro mapování na Nextis ID
  sort_order int DEFAULT 0,
  is_global boolean DEFAULT false, -- globální sekce (Náplně, Pneumatiky)
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_catalog_categories_parent ON public.catalog_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_node_type ON public.catalog_categories(node_type);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_vehicle ON public.catalog_categories(vehicle_brand, vehicle_model);
CREATE INDEX IF NOT EXISTS idx_catalog_categories_external ON public.catalog_categories(source, external_id);

ALTER TABLE public.catalog_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view catalog categories"
  ON public.catalog_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins manage catalog categories"
  ON public.catalog_categories FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3) N:N přiřazení dílů do kategorií (1 díl může být ve více kategoriích)
CREATE TABLE IF NOT EXISTS public.catalog_part_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts_new(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.catalog_categories(id) ON DELETE CASCADE,
  is_primary boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (part_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_part_categories_part ON public.catalog_part_categories(part_id);
CREATE INDEX IF NOT EXISTS idx_part_categories_category ON public.catalog_part_categories(category_id);

ALTER TABLE public.catalog_part_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view part categories"
  ON public.catalog_part_categories FOR SELECT
  USING (true);

CREATE POLICY "Admins manage part categories"
  ON public.catalog_part_categories FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4) Strukturovaná kompatibilita díl ↔ vozidlo
CREATE TABLE IF NOT EXISTS public.catalog_vehicle_compatibility (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL REFERENCES public.parts_new(id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text NOT NULL,
  vehicle_type text,         -- karoserie/varianta (např. "300C", "Charger SRT")
  engine text,               -- "3.6L V6 Pentastar"
  year_from int,
  year_to int,
  source catalog_source_type DEFAULT 'manual',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compat_part ON public.catalog_vehicle_compatibility(part_id);
CREATE INDEX IF NOT EXISTS idx_compat_vehicle 
  ON public.catalog_vehicle_compatibility(brand, model, year_from, year_to);
CREATE INDEX IF NOT EXISTS idx_compat_engine ON public.catalog_vehicle_compatibility(engine);

ALTER TABLE public.catalog_vehicle_compatibility ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view compatibility"
  ON public.catalog_vehicle_compatibility FOR SELECT
  USING (true);

CREATE POLICY "Admins manage compatibility"
  ON public.catalog_vehicle_compatibility FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 5) OEM-FIRST prioritní funkce (IMMUTABLE → použitelné v indexech)
CREATE OR REPLACE FUNCTION public.oem_priority_rank(_source text)
RETURNS int
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE lower(coalesce(_source, ''))
    WHEN 'mopar'      THEN 1   -- originál #1
    WHEN 'mopar_oem'  THEN 1
    WHEN 'csv'        THEN 2   -- ručně spravovaný
    WHEN 'sag'        THEN 3
    WHEN 'autokelly'  THEN 4
    WHEN 'jm'         THEN 5   -- Nextis aftermarket
    WHEN 'epc'        THEN 6
    WHEN 'ai'         THEN 9
    ELSE 10
  END
$$;

-- 6) Trigger pro updated_at na catalog_categories
DROP TRIGGER IF EXISTS trg_catalog_categories_updated ON public.catalog_categories;
CREATE TRIGGER trg_catalog_categories_updated
  BEFORE UPDATE ON public.catalog_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 7) Seed globálních kategorií (Náplně, Auto-chemie, Pneu, Příslušenství)
INSERT INTO public.catalog_categories (slug, name_cs, name_en, node_type, is_global, sort_order, source)
VALUES
  ('napln-a-kapaliny', 'Náplně a kapaliny', 'Fluids & Oils', 'global', true, 100, 'manual'),
  ('autochemie',       'Autochemie',         'Auto-chemistry', 'global', true, 110, 'manual'),
  ('pneu-a-disky',     'Pneumatiky a disky', 'Tires & Wheels', 'global', true, 120, 'manual'),
  ('prislusenstvi',    'Příslušenství a nářadí', 'Accessories & Tools', 'global', true, 130, 'manual')
ON CONFLICT DO NOTHING;

-- 8) Seed kořenových uzlů pro povolené značky (Chrysler, Dodge, RAM, Cadillac, Lancia)
INSERT INTO public.catalog_categories (slug, name_cs, name_en, node_type, vehicle_brand, sort_order, source)
VALUES
  ('chrysler', 'Chrysler', 'Chrysler', 'brand', 'Chrysler', 1, 'manual'),
  ('dodge',    'Dodge',    'Dodge',    'brand', 'Dodge',    2, 'manual'),
  ('ram',      'RAM',      'RAM',      'brand', 'RAM',      3, 'manual'),
  ('cadillac', 'Cadillac', 'Cadillac', 'brand', 'Cadillac', 4, 'manual'),
  ('lancia',   'Lancia',   'Lancia',   'brand', 'Lancia',   5, 'manual')
ON CONFLICT DO NOTHING;

-- 9) Feature flag pro nový katalog
INSERT INTO public.feature_flags (feature_key, description, enabled)
VALUES
  ('catalog_unified_v2', 'Nová unifikovaná architektura katalogu (Nextis-style + OEM-first)', false),
  ('catalog_jm', 'J+M Autodíly / Nextis jako zdroj katalogu', true)
ON CONFLICT (feature_key) DO NOTHING;
