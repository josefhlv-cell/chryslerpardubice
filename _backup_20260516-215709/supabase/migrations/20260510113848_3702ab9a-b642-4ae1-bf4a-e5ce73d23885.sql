-- ============================================
-- J+M YQ Katalog - kompletní schéma (Fáze 1)
-- ============================================

-- 1. Modely vozidel
CREATE TABLE IF NOT EXISTS public.jq_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_slug TEXT,
  jq_model_id TEXT,
  year_from INTEGER,
  year_to INTEGER,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, model_name)
);
CREATE INDEX IF NOT EXISTS idx_jq_models_brand ON public.jq_models(brand);

-- 2. Motorizace
CREATE TABLE IF NOT EXISTS public.jq_engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.jq_models(id) ON DELETE CASCADE,
  engine_code TEXT NOT NULL,
  engine_name TEXT,
  submodel TEXT,
  power_kw INTEGER,
  power_hp INTEGER,
  fuel_type TEXT,
  displacement INTEGER,
  engine_code_tech TEXT,
  year_from INTEGER,
  year_to INTEGER,
  jq_engine_id TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, engine_code, submodel)
);
CREATE INDEX IF NOT EXISTS idx_jq_engines_model ON public.jq_engines(model_id);
CREATE INDEX IF NOT EXISTS idx_jq_engines_tech ON public.jq_engines(engine_code_tech);

-- 3. Kategorie (strom)
CREATE TABLE IF NOT EXISTS public.jq_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.jq_categories(id) ON DELETE CASCADE,
  name_cs TEXT NOT NULL,
  name_en TEXT,
  jq_category_id TEXT,
  path TEXT[],
  slug TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  part_count INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jq_categories_parent ON public.jq_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_jq_categories_jqid ON public.jq_categories(jq_category_id);

-- 4. Spojení motorizace ↔ kategorie
CREATE TABLE IF NOT EXISTS public.jq_engine_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id UUID NOT NULL REFERENCES public.jq_engines(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.jq_categories(id) ON DELETE CASCADE,
  part_count INTEGER NOT NULL DEFAULT 0,
  UNIQUE (engine_id, category_id)
);

-- 5. Základní info o dílech (bulk)
CREATE TABLE IF NOT EXISTS public.jq_parts_basic (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  category_id UUID REFERENCES public.jq_categories(id) ON DELETE SET NULL,
  jq_part_id TEXT,
  manufacturer TEXT,
  tecdoc_number TEXT,
  compatible_engines TEXT[],
  compatible_years JSONB,
  image_urls TEXT[],
  notes TEXT,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oem_number, manufacturer)
);
CREATE INDEX IF NOT EXISTS idx_jq_parts_oem ON public.jq_parts_basic(oem_number);
CREATE INDEX IF NOT EXISTS idx_jq_parts_category ON public.jq_parts_basic(category_id);

-- 6. Spojení díl ↔ motorizace
CREATE TABLE IF NOT EXISTS public.jq_part_engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.jq_parts_basic(id) ON DELETE CASCADE,
  engine_id UUID NOT NULL REFERENCES public.jq_engines(id) ON DELETE CASCADE,
  UNIQUE (part_id, engine_id)
);

-- 7. Detailní parametry (lazy + cache 30 dní)
CREATE TABLE IF NOT EXISTS public.jq_part_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL UNIQUE REFERENCES public.jq_parts_basic(id) ON DELETE CASCADE,
  technical_params JSONB,
  description TEXT,
  full_images TEXT[],
  oe_numbers TEXT[],
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days')
);

-- 8. Technická schémata (lazy + cache 30 dní)
CREATE TABLE IF NOT EXISTS public.jq_schemas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES public.jq_categories(id) ON DELETE CASCADE,
  engine_id UUID NOT NULL REFERENCES public.jq_engines(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  image_data TEXT,
  part_positions JSONB,
  cached_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  UNIQUE (category_id, engine_id)
);

-- 9. Real-time ceny
CREATE TABLE IF NOT EXISTS public.jq_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL UNIQUE REFERENCES public.jq_parts_basic(id) ON DELETE CASCADE,
  price_without_vat NUMERIC(10,2),
  price_with_vat NUMERIC(10,2),
  availability TEXT,
  quantity INTEGER,
  delivery_days INTEGER,
  supplier TEXT NOT NULL DEFAULT 'jm',
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Progress scrapování
CREATE TABLE IF NOT EXISTS public.jq_scrape_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  stage TEXT,
  total_items INTEGER NOT NULL DEFAULT 0,
  done_items INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- RLS – veřejné čtení, admin write
-- ============================================
DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'jq_models','jq_engines','jq_categories','jq_engine_categories',
    'jq_parts_basic','jq_part_engines','jq_part_details','jq_schemas',
    'jq_prices','jq_scrape_progress'
  ]) LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    EXECUTE format('DROP POLICY IF EXISTS "%I_public_read" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%I_public_read" ON public.%I FOR SELECT USING (true)', t, t);

    EXECUTE format('DROP POLICY IF EXISTS "%I_admin_all" ON public.%I', t, t);
    EXECUTE format('CREATE POLICY "%I_admin_all" ON public.%I FOR ALL USING (public.has_role(auth.uid(), ''admin''::app_role)) WITH CHECK (public.has_role(auth.uid(), ''admin''::app_role))', t, t);
  END LOOP;
END $$;

-- updated_at trigger pro scrape_progress
DROP TRIGGER IF EXISTS trg_jq_scrape_progress_updated ON public.jq_scrape_progress;
CREATE TRIGGER trg_jq_scrape_progress_updated
  BEFORE UPDATE ON public.jq_scrape_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();