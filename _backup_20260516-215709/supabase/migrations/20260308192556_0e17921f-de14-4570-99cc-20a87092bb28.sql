
CREATE TABLE public.epc_diagrams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  engine text,
  category text NOT NULL,
  subcategory text,
  svg_content text NOT NULL,
  parts_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(brand, model, category, subcategory)
);

ALTER TABLE public.epc_diagrams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view diagrams" ON public.epc_diagrams FOR SELECT USING (true);
CREATE POLICY "Admins can manage diagrams" ON public.epc_diagrams FOR ALL USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE INDEX idx_epc_diagrams_lookup ON public.epc_diagrams(brand, model, category);
