
ALTER TABLE public.catalog_diagnostic_runs
  ADD COLUMN IF NOT EXISTS critical_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.catalog_diagnostic_fixes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.catalog_diagnostic_runs(id) ON DELETE CASCADE,
  fix_type text NOT NULL,           -- normalize_categories | mark_on_order | dedupe_oem | translate_names | rebuild_compatibility
  severity text NOT NULL DEFAULT 'medium', -- critical | high | medium | low
  title text NOT NULL,
  description text,
  affected_count integer NOT NULL DEFAULT 0,
  preview jsonb NOT NULL DEFAULT '[]'::jsonb,    -- sample of changes
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,    -- params for applying
  status text NOT NULL DEFAULT 'pending',        -- pending | approved | applied | rejected | failed
  applied_count integer,
  applied_at timestamptz,
  applied_by uuid,
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cdf_run ON public.catalog_diagnostic_fixes(run_id);
CREATE INDEX IF NOT EXISTS idx_cdf_status ON public.catalog_diagnostic_fixes(status);

ALTER TABLE public.catalog_diagnostic_fixes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage diag fixes" ON public.catalog_diagnostic_fixes
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
