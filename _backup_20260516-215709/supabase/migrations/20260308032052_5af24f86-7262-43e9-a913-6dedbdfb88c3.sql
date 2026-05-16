
-- Indexes for fast part search
CREATE INDEX IF NOT EXISTS idx_parts_new_oem ON public.parts_new (oem_number);
CREATE INDEX IF NOT EXISTS idx_parts_new_name ON public.parts_new USING gin (to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_parts_new_category ON public.parts_new (category);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_oem ON public.parts_catalog (oem_code);
CREATE INDEX IF NOT EXISTS idx_parts_catalog_name ON public.parts_catalog USING gin (to_tsvector('simple', name));

-- Part supersession tracking
CREATE TABLE IF NOT EXISTS public.part_supersessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  old_oem_number text NOT NULL,
  new_oem_number text NOT NULL,
  source text DEFAULT 'catalog',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(old_oem_number, new_oem_number)
);

ALTER TABLE public.part_supersessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view supersessions" ON public.part_supersessions FOR SELECT USING (true);
CREATE POLICY "Admins can manage supersessions" ON public.part_supersessions FOR ALL USING (has_role(auth.uid(), 'admin'::app_role));

-- Add description and compatible_vehicles columns to parts_new
ALTER TABLE public.parts_new ADD COLUMN IF NOT EXISTS description text;
ALTER TABLE public.parts_new ADD COLUMN IF NOT EXISTS compatible_vehicles text;
ALTER TABLE public.parts_new ADD COLUMN IF NOT EXISTS catalog_source text DEFAULT 'mopar';
ALTER TABLE public.parts_new ADD COLUMN IF NOT EXISTS availability text DEFAULT 'unknown';
ALTER TABLE public.parts_new ADD COLUMN IF NOT EXISTS manufacturer text;
ALTER TABLE public.parts_new ADD COLUMN IF NOT EXISTS image_urls text[];
