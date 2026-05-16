
CREATE INDEX IF NOT EXISTS idx_parts_new_oem ON public.parts_new(oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new(category);
CREATE INDEX IF NOT EXISTS idx_epc_categories_brand_model ON public.epc_categories(brand, model);
