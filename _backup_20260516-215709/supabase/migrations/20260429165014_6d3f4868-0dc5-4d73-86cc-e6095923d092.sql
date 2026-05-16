
-- Catalog diagnostic runs (job orchestration)
CREATE TABLE IF NOT EXISTS public.catalog_diagnostic_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending', -- pending|running|completed|failed|cancelled
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  total_combinations integer NOT NULL DEFAULT 0,
  processed_combinations integer NOT NULL DEFAULT 0,
  total_parts_found integer NOT NULL DEFAULT 0,
  issues_found integer NOT NULL DEFAULT 0,
  current_step text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.catalog_diagnostic_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.catalog_diagnostic_runs(id) ON DELETE CASCADE,
  brand text NOT NULL,
  model text NOT NULL,
  engine text,
  category text,
  parts_count integer NOT NULL DEFAULT 0,
  oem_unique_count integer NOT NULL DEFAULT 0,
  duplicates_count integer NOT NULL DEFAULT 0,
  missing_names_count integer NOT NULL DEFAULT 0,
  missing_prices_count integer NOT NULL DEFAULT 0,
  zero_price_count integer NOT NULL DEFAULT 0,
  uncategorized_count integer NOT NULL DEFAULT 0,
  issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  sample_oems jsonb NOT NULL DEFAULT '[]'::jsonb,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdr_run ON public.catalog_diagnostic_results(run_id);
CREATE INDEX IF NOT EXISTS idx_cdr_brand_model ON public.catalog_diagnostic_results(brand, model);

ALTER TABLE public.catalog_diagnostic_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.catalog_diagnostic_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage diag runs" ON public.catalog_diagnostic_runs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage diag results" ON public.catalog_diagnostic_results
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.touch_catalog_diag_run()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_diag_run ON public.catalog_diagnostic_runs;
CREATE TRIGGER trg_touch_diag_run BEFORE UPDATE ON public.catalog_diagnostic_runs
  FOR EACH ROW EXECUTE FUNCTION public.touch_catalog_diag_run();
