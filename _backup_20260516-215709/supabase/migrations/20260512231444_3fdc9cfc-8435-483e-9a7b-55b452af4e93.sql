
ALTER TABLE public.nextis_vehicles DROP CONSTRAINT IF EXISTS nextis_vehicles_external_id_key;
CREATE INDEX IF NOT EXISTS idx_nextis_vehicles_external_id ON public.nextis_vehicles(external_id) WHERE external_id IS NOT NULL;
