
-- Hybrid catalog setup: ensure schema supports J+M tree mirror + per-part diagnostics

-- 1) Ensure unique index for upsert in catalog_categories (parent_id, slug)
CREATE UNIQUE INDEX IF NOT EXISTS catalog_categories_parent_slug_uidx
  ON public.catalog_categories (COALESCE(parent_id::text, 'ROOT'), slug);

-- 2) Speed-up part lookup by category
CREATE INDEX IF NOT EXISTS catalog_part_categories_category_idx
  ON public.catalog_part_categories (category_id);
CREATE INDEX IF NOT EXISTS catalog_part_categories_part_idx
  ON public.catalog_part_categories (part_id);

-- 3) Per-part diagnostic table (lightweight, complements existing catalog_diagnostic_*)
CREATE TABLE IF NOT EXISTS public.part_diagnostics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL,
  name_status text NOT NULL DEFAULT 'unknown',         -- ok | suspicious | incorrect
  category_status text NOT NULL DEFAULT 'unknown',     -- ok | mismatch
  description_status text NOT NULL DEFAULT 'unknown',  -- ok | poor
  oem_status text NOT NULL DEFAULT 'unknown',          -- matched | missing | invalid
  suggested_name text,
  suggested_category text,
  suggested_description text,
  suggested_oem_matches jsonb DEFAULT '[]'::jsonb,
  notes text,
  applied boolean NOT NULL DEFAULT false,
  applied_at timestamptz,
  applied_by uuid,
  backup_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS part_diagnostics_part_idx ON public.part_diagnostics (part_id);
CREATE INDEX IF NOT EXISTS part_diagnostics_applied_idx ON public.part_diagnostics (applied);

ALTER TABLE public.part_diagnostics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage part diagnostics"
  ON public.part_diagnostics FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Track J+M tree sync runs
CREATE TABLE IF NOT EXISTS public.jm_tree_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'pending',  -- pending | running | done | failed
  scope text NOT NULL DEFAULT 'all',        -- all | brand:Chrysler ...
  vehicles_total int NOT NULL DEFAULT 0,
  vehicles_done int NOT NULL DEFAULT 0,
  categories_created int NOT NULL DEFAULT 0,
  parts_classified int NOT NULL DEFAULT 0,
  current_step text,
  last_error text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
ALTER TABLE public.jm_tree_sync_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage jm tree sync"
  ON public.jm_tree_sync_runs FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 5) Feature flag for new tree (default off, admin enables when ready)
INSERT INTO public.feature_flags (feature_key, enabled, description)
VALUES ('catalog_jm_tree', false, 'Use new J+M-style 5-level catalog tree from catalog_categories')
ON CONFLICT (feature_key) DO NOTHING;
