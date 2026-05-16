
-- Table for vehicle buyback requests
CREATE TABLE public.vehicle_buyback_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  brand text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  condition text NOT NULL,
  mileage integer NOT NULL,
  vin text,
  note text,
  name text,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_buyback_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create buyback requests" ON public.vehicle_buyback_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own buyback requests" ON public.vehicle_buyback_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all buyback requests" ON public.vehicle_buyback_requests FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update buyback requests" ON public.vehicle_buyback_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- Table for individual import requests
CREATE TABLE public.vehicle_import_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  brand text NOT NULL,
  model text NOT NULL,
  year_from integer,
  year_to integer,
  budget_from numeric,
  budget_to numeric,
  fuel text,
  transmission text,
  color text,
  extras text,
  note text,
  name text,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_import_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can create import requests" ON public.vehicle_import_requests FOR INSERT WITH CHECK (true);
CREATE POLICY "Users can view own import requests" ON public.vehicle_import_requests FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all import requests" ON public.vehicle_import_requests FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update import requests" ON public.vehicle_import_requests FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));
