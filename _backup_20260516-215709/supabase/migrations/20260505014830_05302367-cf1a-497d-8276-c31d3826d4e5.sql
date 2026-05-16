ALTER TABLE public.parts_new
  ADD COLUMN IF NOT EXISTS last_enrich_status text,
  ADD COLUMN IF NOT EXISTS enrich_attempts integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_parts_new_enrich_status
  ON public.parts_new (last_enrich_status, enrich_attempts, last_enrich_attempt_at)
  WHERE image_urls IS NULL OR array_length(image_urls,1) IS NULL;