
-- Add new feature flags
INSERT INTO public.feature_flags (feature_key, description, enabled) VALUES
  ('push_notifications', 'Push notifikace o stavu zakázky', false),
  ('auto_part_recommendations', 'Automatické doporučení dílů dle nájezdu', false),
  ('vin_camera', 'VIN skenování kamerou', false),
  ('price_comparison', 'Srovnání cen originál vs. aftermarket', false),
  ('service_chat', 'Chat se servisem v rámci zakázky', false),
  ('service_book_sharing', 'Sdílení servisní knížky a převod vlastnictví', false)
ON CONFLICT DO NOTHING;

-- Add notifications_enabled to profiles (per-customer toggle, default false)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notifications_enabled boolean NOT NULL DEFAULT false;

-- Service order messages table for real-time chat
CREATE TABLE IF NOT EXISTS public.service_order_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  message text NOT NULL,
  is_from_service boolean NOT NULL DEFAULT false,
  photos text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_order_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage chat messages" ON public.service_order_messages
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own order messages" ON public.service_order_messages
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = service_order_messages.service_order_id AND so.user_id = auth.uid()));

CREATE POLICY "Users can insert messages to own orders" ON public.service_order_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.service_orders so WHERE so.id = service_order_messages.service_order_id AND so.user_id = auth.uid()));

CREATE POLICY "Mechanics can view assigned order messages" ON public.service_order_messages
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = service_order_messages.service_order_id
    AND so.mechanic_id IN (
      SELECT m.id FROM public.mechanics m
      JOIN public.employees e ON m.employee_id = e.id
      WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
    )
  ));

CREATE POLICY "Mechanics can insert messages to assigned orders" ON public.service_order_messages
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = service_order_messages.service_order_id
    AND so.mechanic_id IN (
      SELECT m.id FROM public.mechanics m
      JOIN public.employees e ON m.employee_id = e.id
      WHERE e.user_id = auth.uid() AND e.active = true AND m.active = true
    )
  ));

-- Enable realtime for chat messages
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_order_messages;

-- Service book share tokens table
CREATE TABLE IF NOT EXISTS public.service_book_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.user_vehicles(id) ON DELETE CASCADE,
  owner_id uuid NOT NULL,
  share_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  expires_at timestamptz,
  transfer_to_email text,
  transfer_status text NOT NULL DEFAULT 'none',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_book_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own shares" ON public.service_book_shares
  FOR ALL TO authenticated
  USING (auth.uid() = owner_id);

CREATE POLICY "Admins can manage all shares" ON public.service_book_shares
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can read by token" ON public.service_book_shares
  FOR SELECT TO public
  USING (true);
