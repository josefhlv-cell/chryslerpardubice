
-- 1) BACKUP existing working tree
CREATE TABLE IF NOT EXISTS public.catalog_categories_bak_pretreev2 AS
  SELECT * FROM public.catalog_categories;

CREATE TABLE IF NOT EXISTS public.catalog_part_categories_bak_pretreev2 AS
  SELECT * FROM public.catalog_part_categories;

-- 2) NEW parallel tree (mirrors J+M structure)
CREATE TABLE IF NOT EXISTS public.jm_category_tree_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  engine text NOT NULL,
  k_type integer NOT NULL,
  gen_art_id integer NOT NULL,
  gen_art_name text NOT NULL,
  part_count integer NOT NULL DEFAULT 0,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (brand, model, engine, k_type, gen_art_id)
);

CREATE INDEX IF NOT EXISTS idx_jm_tree_v2_brand_model ON public.jm_category_tree_v2(brand, model, engine);
CREATE INDEX IF NOT EXISTS idx_jm_tree_v2_ktype ON public.jm_category_tree_v2(k_type);

ALTER TABLE public.jm_category_tree_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads jm_category_tree_v2"
  ON public.jm_category_tree_v2 FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage jm_category_tree_v2"
  ON public.jm_category_tree_v2 FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3) NEW per-node parts cache (1:1 podle J+M genArt seznamu)
CREATE TABLE IF NOT EXISTS public.jm_part_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES public.jm_category_tree_v2(id) ON DELETE CASCADE,
  oem_number text NOT NULL,
  name text,
  manufacturer text,
  price_with_vat numeric,
  price_without_vat numeric,
  stock integer DEFAULT 0,
  availability text,
  image_url text,
  raw jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (node_id, oem_number)
);

CREATE INDEX IF NOT EXISTS idx_jm_part_v2_node ON public.jm_part_v2(node_id);
CREATE INDEX IF NOT EXISTS idx_jm_part_v2_oem ON public.jm_part_v2(oem_number);

ALTER TABLE public.jm_part_v2 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone reads jm_part_v2"
  ON public.jm_part_v2 FOR SELECT TO public USING (true);

CREATE POLICY "Admins manage jm_part_v2"
  ON public.jm_part_v2 FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 4) Snapshot audit
INSERT INTO public.catalog_snapshots (label, trigger, stats, notes)
VALUES (
  'pre-tree-v2-' || to_char(now(), 'YYYYMMDDHH24MI'),
  'tree-v2-build',
  jsonb_build_object(
    'catalog_categories', (SELECT count(*) FROM public.catalog_categories),
    'catalog_part_categories', (SELECT count(*) FROM public.catalog_part_categories)
  ),
  'Záloha před stavbou jm_category_tree_v2 (paralelní strom 1:1 podle J+M genArt).'
);
