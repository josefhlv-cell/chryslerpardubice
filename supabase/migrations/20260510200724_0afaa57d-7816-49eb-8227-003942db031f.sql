
-- Tabulka mapování motorů na TecDoc K-type
CREATE TABLE IF NOT EXISTS public.vehicle_engine_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  engine text NOT NULL,
  year_from integer,
  year_to integer,
  power_kw integer,
  fuel text,
  vin_pattern text,
  k_type bigint NOT NULL,
  k_type_label text,
  source text NOT NULL DEFAULT 'manual',
  verified_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vem_brand_model_engine
  ON public.vehicle_engine_mappings (lower(brand), lower(model), lower(engine));

CREATE INDEX IF NOT EXISTS idx_vem_ktype
  ON public.vehicle_engine_mappings (k_type);

CREATE UNIQUE INDEX IF NOT EXISTS uq_vem_config_ktype
  ON public.vehicle_engine_mappings (
    lower(brand), lower(model), lower(engine),
    coalesce(year_from, 0), coalesce(year_to, 9999),
    coalesce(vin_pattern, ''), k_type
  );

ALTER TABLE public.vehicle_engine_mappings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view vehicle engine mappings" ON public.vehicle_engine_mappings;
CREATE POLICY "Anyone can view vehicle engine mappings"
  ON public.vehicle_engine_mappings FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Admins manage vehicle engine mappings" ON public.vehicle_engine_mappings;
CREATE POLICY "Admins manage vehicle engine mappings"
  ON public.vehicle_engine_mappings FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_vem_updated_at ON public.vehicle_engine_mappings;
CREATE TRIGGER trg_vem_updated_at
  BEFORE UPDATE ON public.vehicle_engine_mappings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Feature flag pro legacy admin nástroje
INSERT INTO public.feature_flags (feature_key, enabled, description)
VALUES ('legacy_aftermarket_admin', false, 'Zobrazit staré admin nástroje Makro/SAG/AutoKelly/AI-aftermarket/EPC queue')
ON CONFLICT (feature_key) DO NOTHING;
