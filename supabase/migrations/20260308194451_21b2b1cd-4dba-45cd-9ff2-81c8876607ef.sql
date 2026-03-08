
CREATE TABLE public.api_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_type text NOT NULL,
  cache_key text NOT NULL,
  data jsonb NOT NULL,
  ttl_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(cache_type, cache_key)
);

ALTER TABLE public.api_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read cache" ON public.api_cache FOR SELECT USING (true);
CREATE POLICY "Anyone can insert cache" ON public.api_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update cache" ON public.api_cache FOR UPDATE USING (true);

CREATE INDEX idx_api_cache_lookup ON public.api_cache(cache_type, cache_key);
CREATE INDEX idx_api_cache_created ON public.api_cache(created_at);
