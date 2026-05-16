
CREATE TABLE public.parts_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_code text NOT NULL,
  name text NOT NULL,
  brand text,
  price numeric NOT NULL DEFAULT 0,
  available boolean NOT NULL DEFAULT true,
  category text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_parts_catalog_oem ON public.parts_catalog (oem_code);
CREATE INDEX idx_parts_catalog_name ON public.parts_catalog USING gin (to_tsvector('simple', name));

ALTER TABLE public.parts_catalog ENABLE ROW LEVEL SECURITY;

-- Anyone can search/view parts (public catalog)
CREATE POLICY "Anyone can view parts catalog"
  ON public.parts_catalog FOR SELECT
  USING (true);

-- Only admins can manage catalog
CREATE POLICY "Admins can manage parts catalog"
  ON public.parts_catalog FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));
