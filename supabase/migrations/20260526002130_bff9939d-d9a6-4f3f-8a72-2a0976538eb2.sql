CREATE TABLE IF NOT EXISTS public.jm_graphical_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  engine TEXT,
  k_type TEXT,
  section_id TEXT NOT NULL,
  section_name TEXT,
  image_url TEXT,
  image_base64 TEXT,
  part_positions JSONB DEFAULT '[]'::jsonb,
  scraped_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jm_graphical_catalog_unique UNIQUE (brand, model, engine, section_id)
);

CREATE INDEX IF NOT EXISTS idx_jm_graphical_catalog_vehicle
  ON public.jm_graphical_catalog (brand, model, engine);

ALTER TABLE public.jm_graphical_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read graphical catalog" ON public.jm_graphical_catalog;
CREATE POLICY "Admins can read graphical catalog"
  ON public.jm_graphical_catalog FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Service role manages graphical catalog" ON public.jm_graphical_catalog;
CREATE POLICY "Service role manages graphical catalog"
  ON public.jm_graphical_catalog FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_jm_graphical_catalog_updated_at ON public.jm_graphical_catalog;
CREATE TRIGGER trg_jm_graphical_catalog_updated_at
  BEFORE UPDATE ON public.jm_graphical_catalog
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();