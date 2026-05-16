CREATE TABLE public.service_procedures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL DEFAULT 'Chrysler',
  model text NOT NULL,
  category text NOT NULL,
  title text NOT NULL,
  content text,
  source_url text,
  source text DEFAULT 'workshop-manuals',
  procedure_type text DEFAULT 'repair',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_procedures ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage service procedures" ON public.service_procedures
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view service procedures" ON public.service_procedures
  FOR SELECT TO public USING (true);