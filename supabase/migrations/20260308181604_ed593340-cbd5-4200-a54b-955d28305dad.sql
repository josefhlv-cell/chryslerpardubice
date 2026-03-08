
-- Part cross-references table
CREATE TABLE IF NOT EXISTS public.part_crossref (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  oem_number TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  part_number TEXT NOT NULL,
  note TEXT,
  source TEXT DEFAULT 'ai',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.part_crossref ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view crossrefs" ON public.part_crossref FOR SELECT USING (true);
CREATE POLICY "Admins can manage crossrefs" ON public.part_crossref FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_parts_new_oem ON public.parts_new (oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new (category);
CREATE INDEX IF NOT EXISTS idx_parts_new_family ON public.parts_new (family);
CREATE INDEX IF NOT EXISTS idx_parts_new_source ON public.parts_new (catalog_source);
CREATE INDEX IF NOT EXISTS idx_parts_new_compatible ON public.parts_new USING gin (to_tsvector('simple', coalesce(compatible_vehicles, '')));
CREATE INDEX IF NOT EXISTS idx_parts_catalog_oem ON public.parts_catalog (oem_code);
CREATE INDEX IF NOT EXISTS idx_epc_categories_lookup ON public.epc_categories (brand, model, category);
CREATE INDEX IF NOT EXISTS idx_epc_part_links_category ON public.epc_part_links (epc_category_id);
CREATE INDEX IF NOT EXISTS idx_part_supersessions_old ON public.part_supersessions (old_oem_number);
CREATE INDEX IF NOT EXISTS idx_part_supersessions_new ON public.part_supersessions (new_oem_number);
CREATE INDEX IF NOT EXISTS idx_part_crossref_oem ON public.part_crossref (oem_number);
