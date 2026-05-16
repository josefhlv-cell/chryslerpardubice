
-- User vehicles table
CREATE TABLE public.user_vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vin text,
  brand text NOT NULL,
  model text NOT NULL,
  year integer,
  engine text,
  license_plate text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own vehicles" ON public.user_vehicles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vehicles" ON public.user_vehicles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vehicles" ON public.user_vehicles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own vehicles" ON public.user_vehicles FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all vehicles" ON public.user_vehicles FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

-- Service history table
CREATE TABLE public.service_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid REFERENCES public.user_vehicles(id) ON DELETE CASCADE NOT NULL,
  user_id uuid NOT NULL,
  service_type text NOT NULL,
  description text,
  parts_used text,
  price numeric,
  mileage integer,
  service_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own service history" ON public.service_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage service history" ON public.service_history FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Admins can manage notifications" ON public.notifications FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Add service_history_enabled to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS service_history_enabled boolean NOT NULL DEFAULT false;
