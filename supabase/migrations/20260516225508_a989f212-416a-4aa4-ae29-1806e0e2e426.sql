CREATE TABLE IF NOT EXISTS public.catcar_test (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number text NOT NULL,
  name text,
  category text,
  subcategory text,
  image_url text,
  position text,
  price_with_vat numeric,
  price_found boolean DEFAULT false,
  price_variant text,
  vehicle text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catcar_test_oem ON public.catcar_test(oem_number);

ALTER TABLE public.catcar_test ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage catcar_test"
ON public.catcar_test FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));