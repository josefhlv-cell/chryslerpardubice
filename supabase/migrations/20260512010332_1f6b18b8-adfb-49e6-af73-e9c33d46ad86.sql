CREATE TABLE IF NOT EXISTS public.mopar_price_staging (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number text NOT NULL UNIQUE,
  search_variant text,
  catalog_name text,
  price_without_vat numeric,
  price_with_vat numeric,
  exists_in_parts_new boolean DEFAULT false,
  status text NOT NULL DEFAULT 'found',
  found_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  imported_at timestamptz,
  enum_batch text,
  notes text
);

CREATE INDEX IF NOT EXISTS mopar_price_staging_status_idx ON public.mopar_price_staging(status);
CREATE INDEX IF NOT EXISTS mopar_price_staging_batch_idx ON public.mopar_price_staging(enum_batch);
CREATE INDEX IF NOT EXISTS mopar_price_staging_exists_idx ON public.mopar_price_staging(exists_in_parts_new);

ALTER TABLE public.mopar_price_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mopar staging"
  ON public.mopar_price_staging FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Progress tracking table for the enumeration job
CREATE TABLE IF NOT EXISTS public.mopar_enum_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id text NOT NULL UNIQUE,
  mode text NOT NULL DEFAULT 'test',
  total_candidates int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  found int NOT NULL DEFAULT 0,
  not_found int NOT NULL DEFAULT 0,
  errors int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  last_error text
);

ALTER TABLE public.mopar_enum_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage mopar enum runs"
  ON public.mopar_enum_runs FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));