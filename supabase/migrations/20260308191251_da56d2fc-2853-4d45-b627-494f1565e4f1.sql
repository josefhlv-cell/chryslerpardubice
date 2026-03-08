
-- Performance indexes for EPC catalog
CREATE INDEX IF NOT EXISTS idx_parts_new_oem_number ON public.parts_new (oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new (category);
CREATE INDEX IF NOT EXISTS idx_parts_new_manufacturer ON public.parts_new (manufacturer);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_oem_code ON public.parts_catalog (oem_code);
CREATE INDEX IF NOT EXISTS idx_epc_categories_brand_model ON public.epc_categories (brand, model);
CREATE INDEX IF NOT EXISTS idx_epc_categories_engine ON public.epc_categories (engine);
CREATE INDEX IF NOT EXISTS idx_epc_categories_category ON public.epc_categories (category);
CREATE INDEX IF NOT EXISTS idx_epc_part_links_category_id ON public.epc_part_links (epc_category_id);
CREATE INDEX IF NOT EXISTS idx_epc_part_links_oem ON public.epc_part_links (oem_number);
CREATE INDEX IF NOT EXISTS idx_part_crossref_oem ON public.part_crossref (oem_number);
CREATE INDEX IF NOT EXISTS idx_part_supersessions_old ON public.part_supersessions (old_oem_number);
CREATE INDEX IF NOT EXISTS idx_part_supersessions_new ON public.part_supersessions (new_oem_number);
CREATE INDEX IF NOT EXISTS idx_user_vehicles_vin ON public.user_vehicles (vin);
