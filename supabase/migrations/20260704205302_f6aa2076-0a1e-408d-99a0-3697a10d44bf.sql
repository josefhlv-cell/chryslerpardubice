
CREATE TABLE IF NOT EXISTS public.obd_pid_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vin text,
  vehicle_profile text,
  key text NOT NULL,
  header text,
  command text,
  response_prefix text,
  decoder_id text,
  unit text,
  last_raw_response text,
  last_valid_value numeric,
  confidence text,
  source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS obd_pid_cache_unique
  ON public.obd_pid_cache (user_id, COALESCE(vin,''), key);

CREATE INDEX IF NOT EXISTS obd_pid_cache_vin_idx ON public.obd_pid_cache (vin);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obd_pid_cache TO authenticated;
GRANT ALL ON public.obd_pid_cache TO service_role;

ALTER TABLE public.obd_pid_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own pid cache select" ON public.obd_pid_cache;
CREATE POLICY "own pid cache select" ON public.obd_pid_cache
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "own pid cache write" ON public.obd_pid_cache;
CREATE POLICY "own pid cache write" ON public.obd_pid_cache
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

DROP TRIGGER IF EXISTS obd_pid_cache_touch ON public.obd_pid_cache;
CREATE TRIGGER obd_pid_cache_touch
  BEFORE UPDATE ON public.obd_pid_cache
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
