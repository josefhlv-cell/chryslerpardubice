-- Unified OBD permissions, live sessions, and remote commands

CREATE TABLE IF NOT EXISTS public.obd_live_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_id UUID NULL,
  vin TEXT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  dtcs JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.obd_live_sessions
  ADD COLUMN IF NOT EXISTS vehicle_id UUID NULL,
  ADD COLUMN IF NOT EXISTS vin TEXT NULL,
  ADD COLUMN IF NOT EXISTS payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS dtcs JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_seen DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
  FROM public.obd_live_sessions
)
DELETE FROM public.obd_live_sessions s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS obd_live_sessions_user_id_uidx ON public.obd_live_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_obd_live_sessions_active_seen ON public.obd_live_sessions(is_active, last_seen DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obd_live_sessions TO authenticated;
GRANT ALL ON public.obd_live_sessions TO service_role;
ALTER TABLE public.obd_live_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own sessions" ON public.obd_live_sessions;
DROP POLICY IF EXISTS "Admins view consented sessions" ON public.obd_live_sessions;
DROP POLICY IF EXISTS "obd_live_sessions_user_all" ON public.obd_live_sessions;
DROP POLICY IF EXISTS "obd_live_sessions_admin_all" ON public.obd_live_sessions;

CREATE POLICY "obd_live_sessions_user_all"
  ON public.obd_live_sessions
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "obd_live_sessions_admin_all"
  ON public.obd_live_sessions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE IF NOT EXISTS public.obd_permissions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  live_data BOOLEAN NOT NULL DEFAULT true,
  dtc_read BOOLEAN NOT NULL DEFAULT true,
  dtc_clear BOOLEAN NOT NULL DEFAULT false,
  can_bus BOOLEAN NOT NULL DEFAULT false,
  uds BOOLEAN NOT NULL DEFAULT false,
  coding BOOLEAN NOT NULL DEFAULT false,
  terminal BOOLEAN NOT NULL DEFAULT false,
  logging BOOLEAN NOT NULL DEFAULT true,
  reverse_engineering BOOLEAN NOT NULL DEFAULT false,
  discovery BOOLEAN NOT NULL DEFAULT false,
  ai_diagnostics BOOLEAN NOT NULL DEFAULT true,
  dev_mode BOOLEAN NOT NULL DEFAULT false,
  flash BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.obd_permissions
  ADD COLUMN IF NOT EXISTS live_data BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dtc_read BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dtc_clear BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS can_bus BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS uds BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS coding BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS terminal BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS logging BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reverse_engineering BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discovery BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_diagnostics BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dev_mode BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flash BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS obd_permissions_user_id_uidx ON public.obd_permissions(user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obd_permissions TO authenticated;
GRANT ALL ON public.obd_permissions TO service_role;
ALTER TABLE public.obd_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obd_permissions_select_own_or_admin" ON public.obd_permissions;
DROP POLICY IF EXISTS "obd_permissions_insert_own_or_admin" ON public.obd_permissions;
DROP POLICY IF EXISTS "obd_permissions_update_admin" ON public.obd_permissions;
DROP POLICY IF EXISTS "obd_permissions_delete_admin" ON public.obd_permissions;
DROP POLICY IF EXISTS "obd_permissions_user_select" ON public.obd_permissions;
DROP POLICY IF EXISTS "obd_permissions_admin_all" ON public.obd_permissions;

CREATE POLICY "obd_permissions_user_select"
  ON public.obd_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "obd_permissions_admin_all"
  ON public.obd_permissions
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE OR REPLACE FUNCTION public.obd_permissions_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_obd_permissions_touch_updated ON public.obd_permissions;
CREATE TRIGGER trg_obd_permissions_touch_updated
  BEFORE UPDATE ON public.obd_permissions
  FOR EACH ROW EXECUTE FUNCTION public.obd_permissions_touch_updated_at();

DO $$
BEGIN
  IF to_regclass('public.customer_obd_permissions') IS NOT NULL THEN
    INSERT INTO public.obd_permissions (
      user_id, live_data, dtc_read, dtc_clear, can_bus, uds, coding, terminal,
      logging, reverse_engineering, discovery, ai_diagnostics, dev_mode, flash,
      created_at, updated_at
    )
    SELECT
      au.id,
      COALESCE(cop.live_data, true),
      COALESCE(cop.read_dtc, true),
      COALESCE(cop.clear_dtc, false),
      COALESCE(cop.actuator_tests, false),
      false,
      COALESCE(cop.coding, false),
      false,
      true,
      false,
      false,
      true,
      false,
      COALESCE(cop.ecu_flash, false),
      COALESCE(cop.created_at, now()),
      COALESCE(cop.updated_at, now())
    FROM public.customer_obd_permissions cop
    LEFT JOIN public.profiles p ON p.id = cop.user_id OR p.user_id = cop.user_id
    JOIN auth.users au ON au.id = COALESCE(p.user_id, cop.user_id)
    ON CONFLICT (user_id) DO UPDATE SET
      live_data = EXCLUDED.live_data,
      dtc_read = EXCLUDED.dtc_read,
      dtc_clear = EXCLUDED.dtc_clear,
      can_bus = EXCLUDED.can_bus,
      coding = EXCLUDED.coding,
      flash = EXCLUDED.flash,
      updated_at = now();
  END IF;
END $$;

INSERT INTO public.obd_permissions (user_id)
SELECT p.user_id
FROM public.profiles p
LEFT JOIN public.obd_permissions op ON op.user_id = p.user_id
WHERE p.user_id IS NOT NULL AND op.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.ensure_obd_permissions_for_user(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.obd_permissions (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.ensure_obd_permissions_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ensure_obd_permissions_for_user(uuid) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.obd_remote_commands (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  command_type TEXT NOT NULL,
  command_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'done', 'error')),
  result JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  executed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.obd_remote_commands
  ADD COLUMN IF NOT EXISTS command_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_obd_remote_commands_user_status ON public.obd_remote_commands(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_obd_remote_commands_created_by ON public.obd_remote_commands(created_by, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obd_remote_commands TO authenticated;
GRANT ALL ON public.obd_remote_commands TO service_role;
ALTER TABLE public.obd_remote_commands ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obd_remote_commands_admin_all" ON public.obd_remote_commands;
DROP POLICY IF EXISTS "obd_remote_commands_user_select" ON public.obd_remote_commands;
DROP POLICY IF EXISTS "obd_remote_commands_user_update" ON public.obd_remote_commands;

CREATE POLICY "obd_remote_commands_admin_all"
  ON public.obd_remote_commands
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "obd_remote_commands_user_select"
  ON public.obd_remote_commands
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "obd_remote_commands_user_update"
  ON public.obd_remote_commands
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.obd_remote_commands_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_obd_remote_commands_touch_updated ON public.obd_remote_commands;
CREATE TRIGGER trg_obd_remote_commands_touch_updated
  BEFORE UPDATE ON public.obd_remote_commands
  FOR EACH ROW EXECUTE FUNCTION public.obd_remote_commands_touch_updated_at();

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.obd_remote_commands;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.obd_live_sessions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.obd_permissions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DROP TABLE IF EXISTS public.customer_obd_permission_audit;
DROP TABLE IF EXISTS public.customer_obd_permissions;