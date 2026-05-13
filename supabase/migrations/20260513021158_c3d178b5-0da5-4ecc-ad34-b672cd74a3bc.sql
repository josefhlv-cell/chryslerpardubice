
CREATE TABLE IF NOT EXISTS public.catalog_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  trigger text,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  parts_count integer,
  vehicles_count integer,
  compat_count integer,
  category_count integer,
  price_missing integer,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_snapshots_created ON public.catalog_snapshots(created_at DESC);
ALTER TABLE public.catalog_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all snapshots" ON public.catalog_snapshots FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalog_fix_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fix_type text NOT NULL,
  entity_type text,
  entity_id text,
  before_value jsonb,
  after_value jsonb,
  reason text,
  affected_count integer DEFAULT 1,
  run_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_fix_log_created ON public.catalog_fix_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_catalog_fix_log_type ON public.catalog_fix_log(fix_type);
CREATE INDEX IF NOT EXISTS idx_catalog_fix_log_run ON public.catalog_fix_log(run_id);
ALTER TABLE public.catalog_fix_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all fixlog" ON public.catalog_fix_log FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.catalog_anomalies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid REFERENCES public.parts_new(id) ON DELETE CASCADE,
  oem_number text,
  anomaly_type text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  field text,
  current_value text,
  suggested_value text,
  ai_reason text,
  ai_confidence numeric,
  status text NOT NULL DEFAULT 'open',
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_catalog_anomalies_status ON public.catalog_anomalies(status, severity);
CREATE INDEX IF NOT EXISTS idx_catalog_anomalies_part ON public.catalog_anomalies(part_id);
ALTER TABLE public.catalog_anomalies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin all anomalies" ON public.catalog_anomalies FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
