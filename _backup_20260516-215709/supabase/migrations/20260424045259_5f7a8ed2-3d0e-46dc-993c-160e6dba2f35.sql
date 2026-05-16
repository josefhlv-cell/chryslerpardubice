
-- 1) Nextis vehicles canonical table
CREATE TABLE IF NOT EXISTS public.nextis_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id text UNIQUE,
  brand text NOT NULL,
  model text NOT NULL,
  engine text,
  year_from integer,
  year_to integer,
  body_type text,
  fuel text,
  transmission text,
  power_kw integer,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nextis_vehicles_brand_model ON public.nextis_vehicles (lower(brand), lower(model));
CREATE INDEX IF NOT EXISTS idx_nextis_vehicles_engine ON public.nextis_vehicles (lower(engine));
CREATE UNIQUE INDEX IF NOT EXISTS uq_nextis_vehicles_combo ON public.nextis_vehicles (
  lower(brand), lower(model), lower(coalesce(engine,'')), coalesce(year_from,0), coalesce(year_to,9999)
);

ALTER TABLE public.nextis_vehicles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view nextis vehicles" ON public.nextis_vehicles;
CREATE POLICY "Anyone can view nextis vehicles" ON public.nextis_vehicles
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage nextis vehicles" ON public.nextis_vehicles;
CREATE POLICY "Admins manage nextis vehicles" ON public.nextis_vehicles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_nextis_vehicles_updated
  BEFORE UPDATE ON public.nextis_vehicles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Extend compatibility table
ALTER TABLE public.catalog_vehicle_compatibility
  ADD COLUMN IF NOT EXISTS nextis_vehicle_id uuid REFERENCES public.nextis_vehicles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_oem boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_method text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS match_confidence integer DEFAULT 100;

CREATE INDEX IF NOT EXISTS idx_compat_nextis_vehicle ON public.catalog_vehicle_compatibility (nextis_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_compat_part ON public.catalog_vehicle_compatibility (part_id);
CREATE INDEX IF NOT EXISTS idx_compat_part_nextis ON public.catalog_vehicle_compatibility (part_id, nextis_vehicle_id);
CREATE INDEX IF NOT EXISTS idx_compat_is_oem ON public.catalog_vehicle_compatibility (is_oem) WHERE is_oem = true;

-- prevent duplicate links
CREATE UNIQUE INDEX IF NOT EXISTS uq_compat_part_vehicle ON public.catalog_vehicle_compatibility (part_id, nextis_vehicle_id)
  WHERE nextis_vehicle_id IS NOT NULL;

-- 3) Match review queue (for fuzzy matches)
CREATE TABLE IF NOT EXISTS public.compatibility_match_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  part_id uuid NOT NULL,
  nextis_vehicle_id uuid NOT NULL REFERENCES public.nextis_vehicles(id) ON DELETE CASCADE,
  oem_number text,
  matched_oem text,
  match_method text NOT NULL DEFAULT 'fuzzy',
  match_confidence integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_match_queue_status ON public.compatibility_match_queue (status);
CREATE INDEX IF NOT EXISTS idx_match_queue_part ON public.compatibility_match_queue (part_id);

ALTER TABLE public.compatibility_match_queue ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage match queue" ON public.compatibility_match_queue;
CREATE POLICY "Admins manage match queue" ON public.compatibility_match_queue
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 4) Helper functions

-- Normalize OEM number for fuzzy matching
CREATE OR REPLACE FUNCTION public.normalize_oem(_oem text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT upper(regexp_replace(coalesce(_oem, ''), '[\s\-\._/]', '', 'g'))
$$;

-- Find or create a nextis vehicle row
CREATE OR REPLACE FUNCTION public.find_or_create_nextis_vehicle(
  _brand text,
  _model text,
  _engine text DEFAULT NULL,
  _year_from integer DEFAULT NULL,
  _year_to integer DEFAULT NULL,
  _external_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _id uuid;
BEGIN
  SELECT id INTO _id
  FROM public.nextis_vehicles
  WHERE lower(brand) = lower(_brand)
    AND lower(model) = lower(_model)
    AND lower(coalesce(engine,'')) = lower(coalesce(_engine,''))
    AND coalesce(year_from,0) = coalesce(_year_from,0)
    AND coalesce(year_to,9999) = coalesce(_year_to,9999)
  LIMIT 1;

  IF _id IS NULL THEN
    INSERT INTO public.nextis_vehicles (brand, model, engine, year_from, year_to, external_id)
    VALUES (_brand, _model, _engine, _year_from, _year_to, _external_id)
    RETURNING id INTO _id;
  END IF;

  RETURN _id;
END;
$$;

-- Bulk attach a part to all matching vehicles
CREATE OR REPLACE FUNCTION public.bulk_attach_part_to_vehicles(
  _part_id uuid,
  _brand text,
  _model_pattern text DEFAULT NULL,
  _engine_pattern text DEFAULT NULL,
  _year_from integer DEFAULT NULL,
  _year_to integer DEFAULT NULL,
  _is_oem boolean DEFAULT false
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _count integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admins can bulk attach';
  END IF;

  WITH inserted AS (
    INSERT INTO public.catalog_vehicle_compatibility
      (part_id, nextis_vehicle_id, brand, model, engine, year_from, year_to, is_oem, match_method, match_confidence, source)
    SELECT
      _part_id,
      v.id,
      v.brand,
      v.model,
      v.engine,
      v.year_from,
      v.year_to,
      _is_oem,
      'bulk',
      100,
      'manual'::catalog_source_type
    FROM public.nextis_vehicles v
    WHERE lower(v.brand) = lower(_brand)
      AND (_model_pattern IS NULL OR v.model ILIKE _model_pattern)
      AND (_engine_pattern IS NULL OR coalesce(v.engine,'') ILIKE _engine_pattern)
      AND (_year_from IS NULL OR coalesce(v.year_from, 9999) >= _year_from)
      AND (_year_to IS NULL OR coalesce(v.year_to, 0) <= _year_to)
    ON CONFLICT (part_id, nextis_vehicle_id) WHERE nextis_vehicle_id IS NOT NULL DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO _count FROM inserted;

  RETURN _count;
END;
$$;
