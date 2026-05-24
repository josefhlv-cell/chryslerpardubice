
ALTER TABLE public.kitoem_parts
  ADD COLUMN IF NOT EXISTS price_with_vat numeric,
  ADD COLUMN IF NOT EXISTS price_without_vat numeric,
  ADD COLUMN IF NOT EXISTS price_found boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS price_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS price_variant_used text;

CREATE INDEX IF NOT EXISTS idx_kitoem_parts_price_checked ON public.kitoem_parts (price_checked_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_kitoem_parts_price_found ON public.kitoem_parts (price_found);
