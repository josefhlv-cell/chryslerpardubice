CREATE UNIQUE INDEX IF NOT EXISTS vehicle_engine_mappings_bme_uniq
ON public.vehicle_engine_mappings (brand, model, COALESCE(engine, ''));

ALTER TABLE public.vehicle_engine_mappings
  DROP CONSTRAINT IF EXISTS vehicle_engine_mappings_bme_key;

-- Add a real constraint where possible (engine may be null for some rows)
DO $$
BEGIN
  BEGIN
    ALTER TABLE public.vehicle_engine_mappings
      ADD CONSTRAINT vehicle_engine_mappings_bme_key UNIQUE (brand, model, engine);
  EXCEPTION WHEN duplicate_table THEN NULL;
  WHEN others THEN NULL;
  END;
END$$;