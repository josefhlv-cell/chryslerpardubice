
-- Add price management columns to parts_new
ALTER TABLE public.parts_new 
  ADD COLUMN IF NOT EXISTS price_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_price numeric,
  ADD COLUMN IF NOT EXISTS admin_margin_percent numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_price_update timestamptz DEFAULT now();

-- Create price history table
CREATE TABLE public.price_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES public.parts_new(id) ON DELETE CASCADE NOT NULL,
  old_price_without_vat numeric NOT NULL,
  new_price_without_vat numeric NOT NULL,
  old_price_with_vat numeric NOT NULL,
  new_price_with_vat numeric NOT NULL,
  source text DEFAULT 'auto',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view price history" ON public.price_history FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can manage price history" ON public.price_history FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create EPC catalog structure table
CREATE TABLE public.epc_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  year_from integer,
  year_to integer,
  engine text,
  category text NOT NULL,
  subcategory text,
  diagram_svg text,
  sort_order integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.epc_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view EPC categories" ON public.epc_categories FOR SELECT USING (true);
CREATE POLICY "Admins can manage EPC categories" ON public.epc_categories FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Link parts to EPC categories
CREATE TABLE public.epc_part_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  epc_category_id uuid REFERENCES public.epc_categories(id) ON DELETE CASCADE NOT NULL,
  part_id uuid REFERENCES public.parts_new(id) ON DELETE CASCADE NOT NULL,
  position_label text,
  x_pos numeric,
  y_pos numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.epc_part_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view EPC part links" ON public.epc_part_links FOR SELECT USING (true);
CREATE POLICY "Admins can manage EPC part links" ON public.epc_part_links FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));
