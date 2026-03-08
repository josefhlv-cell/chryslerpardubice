ALTER TABLE public.orders ADD COLUMN catalog_source text DEFAULT NULL;
COMMENT ON COLUMN public.orders.catalog_source IS 'Source of the part (mopar, autokelly, csv, etc.) - visible only to admins';