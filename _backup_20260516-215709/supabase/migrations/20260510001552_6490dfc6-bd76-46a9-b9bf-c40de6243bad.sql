
-- Staging area for scraped parts (preview before sync)
CREATE TABLE public.scrape_preview_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL CHECK (source IN ('7zap','mopar','sag','ak','jm','csv','other')),
  brand text,
  model text,
  year integer,
  engine text,
  status text NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','applying','applied','discarded','failed')),
  raw_payload jsonb NOT NULL DEFAULT '[]'::jsonb,
  parts_count integer NOT NULL DEFAULT 0,
  applied_count integer NOT NULL DEFAULT 0,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);

CREATE INDEX idx_scrape_preview_status ON public.scrape_preview_jobs(status, created_at DESC);

ALTER TABLE public.scrape_preview_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage scrape preview"
ON public.scrape_preview_jobs FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Unified auto-pipeline queue
CREATE TABLE public.auto_pipeline_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_type text NOT NULL CHECK (job_type IN ('categorize','fetch_price','match_compat')),
  part_id uuid,
  oem_number text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','failed')),
  attempts integer NOT NULL DEFAULT 0,
  error_message text,
  payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX idx_auto_pipeline_pending ON public.auto_pipeline_queue(status, job_type, created_at) WHERE status = 'pending';
CREATE INDEX idx_auto_pipeline_oem ON public.auto_pipeline_queue(oem_number);

ALTER TABLE public.auto_pipeline_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage auto pipeline"
ON public.auto_pipeline_queue FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Trigger: enqueue auto-pipeline jobs after parts_new insert
CREATE OR REPLACE FUNCTION public.trg_parts_new_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.category IS NULL OR NEW.category = '' THEN
    INSERT INTO public.auto_pipeline_queue(job_type, part_id, oem_number)
    VALUES ('categorize', NEW.id, NEW.oem_number);
  END IF;

  IF (NEW.price_with_vat IS NULL OR NEW.price_with_vat <= 0)
     AND COALESCE(NEW.catalog_source, '') NOT IN ('jm','sag','ak') THEN
    INSERT INTO public.auto_pipeline_queue(job_type, part_id, oem_number)
    VALUES ('fetch_price', NEW.id, NEW.oem_number);
  END IF;

  INSERT INTO public.auto_pipeline_queue(job_type, part_id, oem_number)
  VALUES ('match_compat', NEW.id, NEW.oem_number);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS parts_new_after_insert ON public.parts_new;
CREATE TRIGGER parts_new_after_insert
AFTER INSERT ON public.parts_new
FOR EACH ROW
EXECUTE FUNCTION public.trg_parts_new_after_insert();
