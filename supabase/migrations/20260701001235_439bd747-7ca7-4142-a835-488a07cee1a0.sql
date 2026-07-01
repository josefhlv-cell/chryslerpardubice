
-- 1) Deduplicate obd_live_sessions per user_id, keep newest
WITH ranked AS (
  SELECT id, user_id,
         ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY last_seen DESC NULLS LAST, created_at DESC NULLS LAST) AS rn
  FROM public.obd_live_sessions
)
DELETE FROM public.obd_live_sessions s
USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- Add UNIQUE(user_id) so ON CONFLICT works reliably
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.obd_live_sessions'::regclass
      AND conname = 'obd_live_sessions_user_id_key'
  ) THEN
    ALTER TABLE public.obd_live_sessions
      ADD CONSTRAINT obd_live_sessions_user_id_key UNIQUE (user_id);
  END IF;
END$$;

-- 2) obd_permissions table
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

GRANT SELECT, INSERT, UPDATE, DELETE ON public.obd_permissions TO authenticated;
GRANT ALL ON public.obd_permissions TO service_role;

ALTER TABLE public.obd_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "obd_permissions_select_own_or_admin" ON public.obd_permissions;
CREATE POLICY "obd_permissions_select_own_or_admin"
  ON public.obd_permissions
  FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "obd_permissions_insert_own_or_admin" ON public.obd_permissions;
CREATE POLICY "obd_permissions_insert_own_or_admin"
  ON public.obd_permissions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "obd_permissions_update_admin" ON public.obd_permissions;
CREATE POLICY "obd_permissions_update_admin"
  ON public.obd_permissions
  FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "obd_permissions_delete_admin" ON public.obd_permissions;
CREATE POLICY "obd_permissions_delete_admin"
  ON public.obd_permissions
  FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- updated_at trigger
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

-- Auto-create default permission row on profile creation (best-effort)
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

GRANT EXECUTE ON FUNCTION public.ensure_obd_permissions_for_user(uuid) TO authenticated, service_role;

-- Backfill for existing users
INSERT INTO public.obd_permissions (user_id)
SELECT p.user_id FROM public.profiles p
LEFT JOIN public.obd_permissions op ON op.user_id = p.user_id
WHERE op.user_id IS NULL
ON CONFLICT (user_id) DO NOTHING;
