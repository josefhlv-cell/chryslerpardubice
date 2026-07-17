
CREATE TABLE public.delphi_dev_executions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vin TEXT,
  hardware TEXT,
  ecu TEXT,
  protocol TEXT,
  request TEXT,
  response TEXT,
  parsed JSONB,
  session TEXT,
  result_status TEXT,
  risk_level TEXT,
  function_id TEXT,
  function_name TEXT,
  function_kind TEXT,
  reason_unverified TEXT,
  tx TEXT,
  rx TEXT,
  transport_log TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX delphi_dev_executions_created_at_idx ON public.delphi_dev_executions (created_at DESC);
CREATE INDEX delphi_dev_executions_user_id_idx ON public.delphi_dev_executions (user_id);

GRANT SELECT, INSERT ON public.delphi_dev_executions TO authenticated;
GRANT ALL ON public.delphi_dev_executions TO service_role;

ALTER TABLE public.delphi_dev_executions ENABLE ROW LEVEL SECURITY;

-- Admins vidí a spravují vše, běžný uživatel může jen insertovat vlastní záznam (audit trail).
CREATE POLICY "delphi_dev_exec_admin_all" ON public.delphi_dev_executions
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "delphi_dev_exec_self_insert" ON public.delphi_dev_executions
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- Trigger, aby user_id vždy odpovídal auth.uid() (pokud není service_role).
CREATE OR REPLACE FUNCTION public.delphi_dev_exec_set_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NULL THEN NEW.user_id := auth.uid(); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER delphi_dev_exec_set_user_trg
  BEFORE INSERT ON public.delphi_dev_executions
  FOR EACH ROW EXECUTE FUNCTION public.delphi_dev_exec_set_user();
