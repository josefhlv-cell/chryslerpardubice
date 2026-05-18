-- Private bucket for J+M graphical catalog schemas
INSERT INTO storage.buckets (id, name, public)
VALUES ('jm-schemas', 'jm-schemas', false)
ON CONFLICT (id) DO NOTHING;

-- Admin-only RLS on storage.objects for this bucket
CREATE POLICY "Admins read jm-schemas"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'jm-schemas' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write jm-schemas"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'jm-schemas' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins update jm-schemas"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'jm-schemas' AND public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins delete jm-schemas"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'jm-schemas' AND public.has_role(auth.uid(), 'admin'::app_role));

-- Cache table mapping (yq_code, section_id) -> storage path
CREATE TABLE IF NOT EXISTS public.jm_schema_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yq_code text NOT NULL,
  section_id text NOT NULL,
  section_name text,
  image_url_source text,
  storage_path text NOT NULL,
  content_type text,
  byte_size integer,
  positions jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  UNIQUE (yq_code, section_id)
);

ALTER TABLE public.jm_schema_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins read jm_schema_cache"
ON public.jm_schema_cache FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins write jm_schema_cache"
ON public.jm_schema_cache FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_jm_schema_cache_yq ON public.jm_schema_cache(yq_code);