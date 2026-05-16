
-- Create fault_reports table
CREATE TABLE public.fault_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_id uuid REFERENCES public.user_vehicles(id) ON DELETE SET NULL,
  vin text,
  vehicle_brand text,
  vehicle_model text,
  vehicle_year integer,
  vehicle_engine text,
  mileage integer,
  description text NOT NULL,
  photos text[] DEFAULT '{}',
  ai_analysis text,
  ai_risk_level text DEFAULT 'unknown',
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.fault_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own fault reports" ON public.fault_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can create fault reports" ON public.fault_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Admins can view all fault reports" ON public.fault_reports FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update fault reports" ON public.fault_reports FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Create storage bucket for fault photos
INSERT INTO storage.buckets (id, name, public) VALUES ('fault-photos', 'fault-photos', true) ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Auth users can upload fault photos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'fault-photos');
CREATE POLICY "Anyone can view fault photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'fault-photos');

-- Trigger for updated_at
CREATE TRIGGER update_fault_reports_updated_at BEFORE UPDATE ON public.fault_reports FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
