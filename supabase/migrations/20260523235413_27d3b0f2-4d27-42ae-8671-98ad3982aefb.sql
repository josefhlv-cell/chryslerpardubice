
ALTER TABLE public.catalog_categories_bak_pretreev2 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_part_categories_bak_pretreev2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read bak categories"
  ON public.catalog_categories_bak_pretreev2 FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins read bak part categories"
  ON public.catalog_part_categories_bak_pretreev2 FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));
