
-- Add current_mileage to user_vehicles
ALTER TABLE public.user_vehicles ADD COLUMN IF NOT EXISTS current_mileage integer DEFAULT NULL;

-- Mileage history table
CREATE TABLE public.mileage_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.user_vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  mileage integer NOT NULL,
  source text NOT NULL DEFAULT 'user',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.mileage_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own mileage history" ON public.mileage_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own mileage history" ON public.mileage_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage mileage history" ON public.mileage_history FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Service plans table
CREATE TABLE public.service_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.user_vehicles(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  service_name text NOT NULL,
  interval_km integer,
  interval_months integer,
  last_service_km integer,
  last_service_date date,
  recommended_part_oem text,
  is_custom boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own service plans" ON public.service_plans FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own service plans" ON public.service_plans FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can manage service plans" ON public.service_plans FOR ALL USING (has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can update own service plans" ON public.service_plans FOR UPDATE USING (auth.uid() = user_id);
