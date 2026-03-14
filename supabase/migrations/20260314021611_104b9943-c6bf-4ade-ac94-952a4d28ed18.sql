
-- ================================================
-- FEATURE FLAGS
-- ================================================
CREATE TABLE public.feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key text UNIQUE NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read feature flags"
  ON public.feature_flags FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage feature flags"
  ON public.feature_flags FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed default flags
INSERT INTO public.feature_flags (feature_key, enabled, description) VALUES
  ('service_orders', true, 'Servisní zakázky'),
  ('service_checkin', true, 'Digitální předávací protokol'),
  ('service_photos', true, 'Fotodokumentace opravy'),
  ('service_parts', true, 'Použití dílů v opravě'),
  ('service_approval', true, 'Schválení opravy zákazníkem'),
  ('service_invoices', true, 'Fakturace'),
  ('service_scheduler', false, 'Plánování servisu - kalendář'),
  ('mechanic_tasks', true, 'Úkoly mechanika'),
  ('service_statistics', true, 'Statistiky servisu'),
  ('notifications', true, 'Notifikace');

-- ================================================
-- MECHANICS
-- ================================================
CREATE TABLE public.mechanics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  specialization text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mechanics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view mechanics"
  ON public.mechanics FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage mechanics"
  ON public.mechanics FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ================================================
-- SERVICE LIFTS
-- ================================================
CREATE TABLE public.service_lifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  status text NOT NULL DEFAULT 'free',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_lifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view lifts"
  ON public.service_lifts FOR SELECT TO public
  USING (true);

CREATE POLICY "Admins can manage lifts"
  ON public.service_lifts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ================================================
-- SERVICE ORDERS
-- ================================================
CREATE TYPE public.service_order_status AS ENUM (
  'received',
  'diagnostics',
  'waiting_approval',
  'waiting_parts',
  'in_repair',
  'testing',
  'ready_pickup',
  'completed'
);

CREATE TABLE public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.user_vehicles(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  mechanic_id uuid REFERENCES public.mechanics(id) ON DELETE SET NULL,
  lift_id uuid REFERENCES public.service_lifts(id) ON DELETE SET NULL,
  status public.service_order_status NOT NULL DEFAULT 'received',
  description text,
  mileage integer,
  planned_work text,
  estimated_price numeric,
  eta_completion timestamptz,
  labor_price numeric DEFAULT 0,
  parts_total numeric DEFAULT 0,
  total_price numeric DEFAULT 0,
  vat_rate numeric DEFAULT 21,
  customer_approved boolean,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage service orders"
  ON public.service_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own service orders"
  ON public.service_orders FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own service orders for approval"
  ON public.service_orders FOR UPDATE TO authenticated
  USING (auth.uid() = user_id AND status = 'waiting_approval');

-- ================================================
-- SERVICE ORDER STATUS HISTORY
-- ================================================
CREATE TABLE public.service_order_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  old_status text,
  new_status text NOT NULL,
  changed_by uuid,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_order_status_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage status history"
  ON public.service_order_status_history FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own order status history"
  ON public.service_order_status_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.user_id = auth.uid()
    )
  );

-- ================================================
-- SERVICE CHECKINS
-- ================================================
CREATE TABLE public.service_checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  mileage integer,
  fuel_level text,
  visible_damage text,
  notes text,
  photos text[] DEFAULT '{}',
  signature_image text,
  checkin_date timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage checkins"
  ON public.service_checkins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own checkins"
  ON public.service_checkins FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.user_id = auth.uid()
    )
  );

-- ================================================
-- SERVICE ORDER PHOTOS
-- ================================================
CREATE TABLE public.service_order_photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  photo_url text NOT NULL,
  phase text NOT NULL DEFAULT 'before',
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_order_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage order photos"
  ON public.service_order_photos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own order photos"
  ON public.service_order_photos FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.user_id = auth.uid()
    )
  );

-- ================================================
-- SERVICE ORDER PARTS
-- ================================================
CREATE TABLE public.service_order_parts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  part_id uuid REFERENCES public.parts_new(id) ON DELETE SET NULL,
  name text NOT NULL,
  oem_number text,
  price numeric NOT NULL DEFAULT 0,
  quantity integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_order_parts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage order parts"
  ON public.service_order_parts FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own order parts"
  ON public.service_order_parts FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.user_id = auth.uid()
    )
  );

-- ================================================
-- SERVICE INVOICES
-- ================================================
CREATE TABLE public.service_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  labor_price numeric NOT NULL DEFAULT 0,
  parts_price numeric NOT NULL DEFAULT 0,
  vat_amount numeric NOT NULL DEFAULT 0,
  total_price numeric NOT NULL DEFAULT 0,
  invoice_number text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage invoices"
  ON public.service_invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own invoices"
  ON public.service_invoices FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.user_id = auth.uid()
    )
  );

-- ================================================
-- MECHANIC TASKS
-- ================================================
CREATE TABLE public.mechanic_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  mechanic_id uuid REFERENCES public.mechanics(id) ON DELETE SET NULL,
  title text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  estimated_minutes integer,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mechanic_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage mechanic tasks"
  ON public.mechanic_tasks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own order tasks"
  ON public.mechanic_tasks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.service_orders so
      WHERE so.id = service_order_id AND so.user_id = auth.uid()
    )
  );

-- ================================================
-- STORAGE BUCKET for service order photos
-- ================================================
INSERT INTO storage.buckets (id, name, public) VALUES ('service-order-photos', 'service-order-photos', true)
ON CONFLICT (id) DO NOTHING;

-- ================================================
-- REALTIME
-- ================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_orders;
ALTER PUBLICATION supabase_realtime ADD TABLE public.mechanic_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_order_status_history;

-- ================================================
-- TRIGGER: auto-update updated_at on service_orders
-- ================================================
CREATE TRIGGER update_service_orders_updated_at
  BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
