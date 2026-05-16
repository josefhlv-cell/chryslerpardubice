
-- Catalog event log
CREATE TABLE IF NOT EXISTS public.catalog_event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL, -- 'jm-proxy' | 'catalogV2API' | 'oem-crossref' | ...
  level text NOT NULL DEFAULT 'info', -- 'debug'|'info'|'warn'|'error'
  event text NOT NULL, -- short code, e.g. 'empty_results', 'jm_token_fail'
  message text,
  oem_number text,
  vehicle_id uuid,
  category text,
  duration_ms integer,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_cel_created ON public.catalog_event_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cel_source_level ON public.catalog_event_log(source, level, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cel_event ON public.catalog_event_log(event, created_at DESC);

ALTER TABLE public.catalog_event_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view event log"
  ON public.catalog_event_log FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage event log"
  ON public.catalog_event_log FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Crossref seed queue
CREATE TABLE IF NOT EXISTS public.crossref_seed_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oem_number text NOT NULL UNIQUE,
  part_name text,
  status text NOT NULL DEFAULT 'pending', -- pending|running|done|failed|skipped
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  alternatives_added integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_csq_status ON public.crossref_seed_queue(status, created_at);

ALTER TABLE public.crossref_seed_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage seed queue"
  ON public.crossref_seed_queue FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
