
-- ============ 1. Vzdálená OBD diagnostika ============
CREATE TABLE public.obd_live_consents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  granted boolean NOT NULL DEFAULT false,
  granted_at timestamptz,
  revoked_at timestamptz,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.obd_live_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own consent" ON public.obd_live_consents
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view all consents" ON public.obd_live_consents
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TABLE public.obd_live_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_id uuid,
  vin text,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  dtcs jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.obd_live_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_obd_sessions_user ON public.obd_live_sessions(user_id, is_active);
CREATE POLICY "Users manage own sessions" ON public.obd_live_sessions
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins view consented sessions" ON public.obd_live_sessions
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    AND EXISTS (
      SELECT 1 FROM public.obd_live_consents c
      WHERE c.user_id = obd_live_sessions.user_id AND c.granted = true
    )
  );
ALTER PUBLICATION supabase_realtime ADD TABLE public.obd_live_sessions;

-- ============ 2. DTC knihovna ============
CREATE TABLE public.dtc_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  system text NOT NULL DEFAULT 'powertrain',
  severity text NOT NULL DEFAULT 'medium',
  title_cs text NOT NULL,
  description_cs text,
  causes_cs text,
  solution_cs text,
  affected_models text[] DEFAULT '{}',
  source text DEFAULT 'manual',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dtc_codes ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_dtc_code ON public.dtc_codes(code);
CREATE POLICY "Anyone reads DTC" ON public.dtc_codes FOR SELECT USING (true);
CREATE POLICY "Admins manage DTC" ON public.dtc_codes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_dtc_updated BEFORE UPDATE ON public.dtc_codes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 3. TSB databáze ============
CREATE TABLE public.tsbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tsb_number text NOT NULL UNIQUE,
  title_cs text NOT NULL,
  summary_cs text,
  full_text text,
  vin_pattern text,
  brand text,
  model text,
  year_from integer,
  year_to integer,
  system text,
  source_url text,
  published_at date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.tsbs ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_tsbs_model ON public.tsbs(brand, model);
CREATE POLICY "Anyone reads TSBs" ON public.tsbs FOR SELECT USING (true);
CREATE POLICY "Admins manage TSBs" ON public.tsbs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE TRIGGER trg_tsbs_updated BEFORE UPDATE ON public.tsbs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ 4. Admin Push (Web + FCM) ============
CREATE TABLE public.admin_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth_key text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE public.admin_push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage push subs" ON public.admin_push_subscriptions FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = user_id)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = user_id);

CREATE TABLE public.admin_fcm_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  device_info jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);
ALTER TABLE public.admin_fcm_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage own FCM tokens" ON public.admin_fcm_tokens FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = user_id)
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND auth.uid() = user_id);

-- ============ 5. Audit log ============
CREATE TABLE public.admin_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id text,
  details jsonb DEFAULT '{}'::jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_audit_admin ON public.admin_audit_log(admin_id, created_at DESC);
CREATE INDEX idx_audit_entity ON public.admin_audit_log(entity_type, entity_id);
CREATE POLICY "Admins view audit log" ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admins write audit log" ON public.admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) AND admin_id = auth.uid());

-- ============ 6. Mechanic offline queue ============
CREATE TABLE public.mechanic_offline_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mechanic_user_id uuid NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  error text,
  client_created_at timestamptz NOT NULL,
  synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.mechanic_offline_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_offline_mechanic ON public.mechanic_offline_queue(mechanic_user_id, status);
CREATE POLICY "Mechanics manage own queue" ON public.mechanic_offline_queue FOR ALL TO authenticated
  USING (auth.uid() = mechanic_user_id) WITH CHECK (auth.uid() = mechanic_user_id);
CREATE POLICY "Admins view all queues" ON public.mechanic_offline_queue FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- ============ 7. Feature flags pre-seed ============
INSERT INTO public.feature_flags (feature_key, enabled, description) VALUES
  ('admin_remote_obd', true, 'Vzdálená OBD diagnostika v adminu'),
  ('dtc_library', true, 'DTC knihovna s českými popisy'),
  ('tsb_database', true, 'TSB databáze hledatelná podle VIN'),
  ('admin_mobile_view', true, 'Mobilní zjednodušený admin view'),
  ('admin_vin_scanner', true, 'VIN/QR scanner v admin appce'),
  ('admin_push_notifications', true, 'Push notifikace pro adminy'),
  ('mechanic_offline_mode', true, 'Offline režim pro mechaniky'),
  ('admin_audit_log', true, 'Audit log akcí adminů')
ON CONFLICT (feature_key) DO NOTHING;
