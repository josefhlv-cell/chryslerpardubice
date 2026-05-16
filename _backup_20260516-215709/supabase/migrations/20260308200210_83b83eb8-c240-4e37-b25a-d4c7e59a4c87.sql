
CREATE TABLE public.epc_generation_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  model text NOT NULL,
  engine text,
  year integer,
  category text NOT NULL,
  subcategory text,
  status text NOT NULL DEFAULT 'pending',
  batch_size integer DEFAULT 50,
  parts_generated integer DEFAULT 0,
  error_message text,
  retry_count integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

ALTER TABLE public.epc_generation_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read queue" ON public.epc_generation_queue FOR SELECT USING (true);
CREATE POLICY "Anyone can insert queue" ON public.epc_generation_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update queue" ON public.epc_generation_queue FOR UPDATE USING (true);
CREATE INDEX idx_epc_queue_status ON public.epc_generation_queue(status);
CREATE INDEX idx_epc_queue_vehicle ON public.epc_generation_queue(brand, model, category);
