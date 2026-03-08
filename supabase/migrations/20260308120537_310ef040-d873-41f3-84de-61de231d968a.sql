
-- Add direct part fields to epc_part_links so it works independently of parts_new
ALTER TABLE public.epc_part_links 
  ADD COLUMN IF NOT EXISTS oem_number text,
  ADD COLUMN IF NOT EXISTS part_name text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS note text;

-- Make part_id nullable (no longer required)
ALTER TABLE public.epc_part_links ALTER COLUMN part_id DROP NOT NULL;

-- Performance indexes for epc_categories
CREATE INDEX IF NOT EXISTS idx_epc_categories_brand ON public.epc_categories(brand);
CREATE INDEX IF NOT EXISTS idx_epc_categories_model ON public.epc_categories(model);
CREATE INDEX IF NOT EXISTS idx_epc_categories_engine ON public.epc_categories(engine);
CREATE INDEX IF NOT EXISTS idx_epc_categories_category ON public.epc_categories(category);
CREATE INDEX IF NOT EXISTS idx_epc_categories_brand_model ON public.epc_categories(brand, model);
CREATE INDEX IF NOT EXISTS idx_epc_categories_brand_model_engine ON public.epc_categories(brand, model, engine);
CREATE INDEX IF NOT EXISTS idx_epc_categories_year_range ON public.epc_categories(year_from, year_to);

-- Performance indexes for epc_part_links
CREATE INDEX IF NOT EXISTS idx_epc_part_links_category_id ON public.epc_part_links(epc_category_id);
CREATE INDEX IF NOT EXISTS idx_epc_part_links_oem_number ON public.epc_part_links(oem_number);
CREATE INDEX IF NOT EXISTS idx_epc_part_links_part_id ON public.epc_part_links(part_id);

-- Performance indexes for parts_catalog
CREATE INDEX IF NOT EXISTS idx_parts_catalog_oem_code ON public.parts_catalog(oem_code);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_brand ON public.parts_catalog(brand);

-- Performance indexes for parts_new
CREATE INDEX IF NOT EXISTS idx_parts_new_oem_number ON public.parts_new(oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new(category);
CREATE INDEX IF NOT EXISTS idx_parts_new_manufacturer ON public.parts_new(manufacturer);
