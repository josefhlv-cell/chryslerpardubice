CREATE TABLE IF NOT EXISTS public.catcar_oem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number text NOT NULL,
  name text,
  category text,
  subcategory text,
  schema_name text,
  schema_url text,
  position text,
  vehicle_tag text NOT NULL,
  model_id text,
  model_name text,
  year integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS catcar_oem_uniq ON public.catcar_oem (oem_number, vehicle_tag);
CREATE INDEX IF NOT EXISTS catcar_oem_tag_idx ON public.catcar_oem (vehicle_tag);
CREATE INDEX IF NOT EXISTS catcar_oem_oem_idx ON public.catcar_oem (oem_number);
ALTER TABLE public.catcar_oem ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage catcar_oem" ON public.catcar_oem
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TABLE IF NOT EXISTS public.catcar_scrape_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_tag text NOT NULL,
  model_name text,
  year integer,
  status text NOT NULL DEFAULT 'pending',
  categories_done integer NOT NULL DEFAULT 0,
  schemas_done integer NOT NULL DEFAULT 0,
  oems_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS catcar_scrape_progress_tag ON public.catcar_scrape_progress (vehicle_tag);
ALTER TABLE public.catcar_scrape_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage catcar_scrape_progress" ON public.catcar_scrape_progress
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));