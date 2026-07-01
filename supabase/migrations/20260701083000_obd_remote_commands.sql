CREATE TABLE IF NOT EXISTS public.obd_remote_commands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,

  command_type TEXT NOT NULL,
  command_payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending',
  result JSONB NULL,
  error TEXT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ NULL
);

ALTER TABLE public.obd_remote_commands
  ADD COLUMN IF NOT EXISTS created_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS command_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result JSONB NULL,
  ADD COLUMN IF NOT EXISTS error TEXT NULL,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_obd_remote_commands_user_id
ON public.obd_remote_commands(user_id);

CREATE INDEX IF NOT EXISTS idx_obd_remote_commands_created_by
ON public.obd_remote_commands(created_by);

CREATE INDEX IF NOT EXISTS idx_obd_remote_commands_status
ON public.obd_remote_commands(status);

CREATE INDEX IF NOT EXISTS idx_obd_remote_commands_created_at
ON public.obd_remote_commands(created_at DESC);

CREATE OR REPLACE FUNCTION public.update_obd_remote_commands_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_obd_remote_commands_updated_at
ON public.obd_remote_commands;

CREATE TRIGGER trg_obd_remote_commands_updated_at
BEFORE UPDATE ON public.obd_remote_commands
FOR EACH ROW
EXECUTE FUNCTION public.update_obd_remote_commands_updated_at();

ALTER TABLE public.obd_remote_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obd_remote_commands_select" ON public.obd_remote_commands;
DROP POLICY IF EXISTS "obd_remote_commands_insert" ON public.obd_remote_commands;
DROP POLICY IF EXISTS "obd_remote_commands_update" ON public.obd_remote_commands;
DROP POLICY IF EXISTS "obd_remote_commands_delete" ON public.obd_remote_commands;

CREATE POLICY "obd_remote_commands_select"
ON public.obd_remote_commands
FOR SELECT
TO authenticated
USING (
  user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY "obd_remote_commands_insert"
ON public.obd_remote_commands
FOR INSERT
TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR created_by IS NULL
);

CREATE POLICY "obd_remote_commands_update"
ON public.obd_remote_commands
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR created_by = auth.uid()
)
WITH CHECK (
  user_id = auth.uid()
  OR created_by = auth.uid()
);

CREATE POLICY "obd_remote_commands_delete"
ON public.obd_remote_commands
FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
);

NOTIFY pgrst, 'reload schema';