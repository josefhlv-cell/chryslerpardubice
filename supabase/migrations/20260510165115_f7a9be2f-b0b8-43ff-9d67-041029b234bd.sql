
-- =========================================================
-- J+M (Nextis) catalog mirror tables — restored 2026-05-10
-- =========================================================

CREATE TABLE IF NOT EXISTS public.jq_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_slug TEXT,
  jq_model_code TEXT,
  year_from INTEGER,
  year_to INTEGER,
  sort_order INTEGER DEFAULT 0,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (brand, model_name)
);
CREATE INDEX IF NOT EXISTS idx_jq_models_brand ON public.jq_models (lower(brand));

CREATE TABLE IF NOT EXISTS public.jq_engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_id UUID NOT NULL REFERENCES public.jq_models(id) ON DELETE CASCADE,
  engine_label TEXT NOT NULL,           -- "3.8 (SYX53)"
  engine_code TEXT,                     -- "EGH"
  submodel TEXT,                        -- "SYX53"
  power_kw INTEGER,
  power_hp INTEGER,
  fuel TEXT,                            -- Benzín / Diesel / Hybrid / Elektro
  displacement_ccm INTEGER,             -- 3778
  year_from INTEGER,                    -- 2000
  year_to INTEGER,                      -- 2007
  jq_engine_code TEXT,                  -- internal J+M id
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (model_id, engine_label)
);
CREATE INDEX IF NOT EXISTS idx_jq_engines_model ON public.jq_engines (model_id);

CREATE TABLE IF NOT EXISTS public.jq_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES public.jq_categories(id) ON DELETE CASCADE,
  name_cs TEXT NOT NULL,
  name_en TEXT,
  slug TEXT,
  jq_category_code TEXT,
  level INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, name_cs)
);
CREATE INDEX IF NOT EXISTS idx_jq_categories_parent ON public.jq_categories (parent_id);

CREATE TABLE IF NOT EXISTS public.jq_engine_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  engine_id UUID NOT NULL REFERENCES public.jq_engines(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.jq_categories(id) ON DELETE CASCADE,
  part_count INTEGER NOT NULL DEFAULT 0,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (engine_id, category_id)
);
CREATE INDEX IF NOT EXISTS idx_jq_ec_engine ON public.jq_engine_categories (engine_id);
CREATE INDEX IF NOT EXISTS idx_jq_ec_cat ON public.jq_engine_categories (category_id);

CREATE TABLE IF NOT EXISTS public.jq_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number TEXT NOT NULL,
  name TEXT NOT NULL,
  name_en TEXT,
  manufacturer TEXT,
  tecdoc_number TEXT,
  category_id UUID REFERENCES public.jq_categories(id) ON DELETE SET NULL,
  image_url TEXT,
  notes TEXT,
  technical_params JSONB DEFAULT '{}'::jsonb,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (oem_number, manufacturer)
);
CREATE INDEX IF NOT EXISTS idx_jq_parts_cat ON public.jq_parts (category_id);
CREATE INDEX IF NOT EXISTS idx_jq_parts_oem ON public.jq_parts (oem_number);

CREATE TABLE IF NOT EXISTS public.jq_part_engines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id UUID NOT NULL REFERENCES public.jq_parts(id) ON DELETE CASCADE,
  engine_id UUID NOT NULL REFERENCES public.jq_engines(id) ON DELETE CASCADE,
  position_label TEXT,
  UNIQUE (part_id, engine_id)
);
CREATE INDEX IF NOT EXISTS idx_jq_pe_engine ON public.jq_part_engines (engine_id);

CREATE TABLE IF NOT EXISTS public.jq_scrape_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT,
  scope TEXT NOT NULL DEFAULT 'all',
  phase TEXT NOT NULL DEFAULT 'pending',  -- pending|models|engines|categories|parts|done|failed
  status TEXT NOT NULL DEFAULT 'pending', -- pending|running|done|failed
  models_done INTEGER NOT NULL DEFAULT 0,
  engines_done INTEGER NOT NULL DEFAULT 0,
  categories_done INTEGER NOT NULL DEFAULT 0,
  parts_done INTEGER NOT NULL DEFAULT 0,
  current_step TEXT,
  last_error TEXT,
  started_by UUID,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Enable RLS
ALTER TABLE public.jq_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jq_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jq_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jq_engine_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jq_parts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jq_part_engines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jq_scrape_runs ENABLE ROW LEVEL SECURITY;

-- Public read for catalog tables
CREATE POLICY "Anyone can read jq_models" ON public.jq_models FOR SELECT USING (true);
CREATE POLICY "Anyone can read jq_engines" ON public.jq_engines FOR SELECT USING (true);
CREATE POLICY "Anyone can read jq_categories" ON public.jq_categories FOR SELECT USING (true);
CREATE POLICY "Anyone can read jq_engine_categories" ON public.jq_engine_categories FOR SELECT USING (true);
CREATE POLICY "Anyone can read jq_parts" ON public.jq_parts FOR SELECT USING (true);
CREATE POLICY "Anyone can read jq_part_engines" ON public.jq_part_engines FOR SELECT USING (true);

-- Admin write for all
CREATE POLICY "Admins manage jq_models" ON public.jq_models FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage jq_engines" ON public.jq_engines FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage jq_categories" ON public.jq_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage jq_engine_categories" ON public.jq_engine_categories FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage jq_parts" ON public.jq_parts FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage jq_part_engines" ON public.jq_part_engines FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins manage jq_scrape_runs" ON public.jq_scrape_runs FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
