CREATE TABLE IF NOT EXISTS public.price_sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text NOT NULL DEFAULT 'missing',
  status text NOT NULL DEFAULT 'running',
  total_target integer NOT NULL DEFAULT 0,
  processed integer NOT NULL DEFAULT 0,
  updated_count integer NOT NULL DEFAULT 0,
  error_count integer NOT NULL DEFAULT 0,
  last_error text,
  started_by uuid,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  notified boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_price_sync_runs_status ON public.price_sync_runs(status);
CREATE INDEX IF NOT EXISTS idx_price_sync_runs_started_at ON public.price_sync_runs(started_at DESC);

ALTER TABLE public.price_sync_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view price sync runs"
ON public.price_sync_runs FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert price sync runs"
ON public.price_sync_runs FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update price sync runs"
ON public.price_sync_runs FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER trg_price_sync_runs_updated_at
BEFORE UPDATE ON public.price_sync_runs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.price_sync_runs;