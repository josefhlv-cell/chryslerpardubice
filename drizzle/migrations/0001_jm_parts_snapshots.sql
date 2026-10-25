CREATE TABLE public.jm_parts_snapshots (
  vehicle_key text PRIMARY KEY,
  engine_id integer,
  data jsonb NOT NULL,
  item_count integer NOT NULL DEFAULT 0,
  fetched_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.jm_parts_snapshots TO service_role;
ALTER TABLE public.jm_parts_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read jm snapshots" ON public.jm_parts_snapshots FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.jm_parts_snapshots TO authenticated;
CREATE INDEX jm_parts_snapshots_engine_idx ON public.jm_parts_snapshots(engine_id, fetched_at DESC);
INSERT INTO public.jm_parts_snapshots(vehicle_key, engine_id, data, item_count, fetched_at)
SELECT cache_key, NULLIF(data->>'engineID','')::int, data, jsonb_array_length(data->'items'), created_at
FROM public.api_cache WHERE cache_type='jm_parts_for_engine' AND jsonb_typeof(data->'items')='array' AND jsonb_array_length(data->'items')>0
ON CONFLICT (vehicle_key) DO NOTHING;