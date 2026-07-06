
CREATE TABLE public.obd_debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  vehicle_id uuid,
  adapter_id text,
  adapter_name text,
  connection_state text,
  elm_profile text,
  polling_paused boolean,
  command_type text,
  command text,
  raw_response text,
  cleaned_response text,
  status text,
  error text,
  warnings jsonb,
  duration_ms integer,
  metadata jsonb
);

CREATE INDEX idx_obd_debug_logs_created_at ON public.obd_debug_logs (created_at DESC);
CREATE INDEX idx_obd_debug_logs_user_id ON public.obd_debug_logs (user_id);
CREATE INDEX idx_obd_debug_logs_command_type ON public.obd_debug_logs (command_type);
CREATE INDEX idx_obd_debug_logs_status ON public.obd_debug_logs (status);

GRANT SELECT, INSERT ON public.obd_debug_logs TO authenticated;
GRANT DELETE ON public.obd_debug_logs TO authenticated;
GRANT ALL ON public.obd_debug_logs TO service_role;

ALTER TABLE public.obd_debug_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all obd debug logs"
  ON public.obd_debug_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own obd debug logs"
  ON public.obd_debug_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Authenticated can insert own obd debug logs"
  ON public.obd_debug_logs FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NULL OR auth.uid() = user_id);

CREATE POLICY "Admins can delete obd debug logs"
  ON public.obd_debug_logs FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
