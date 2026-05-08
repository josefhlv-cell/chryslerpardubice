
-- Drop overly-permissive duplicate policy on parts_new (keep admin-only + the public-fields one)
DROP POLICY IF EXISTS "Only admins can select parts_new" ON public.parts_new;
DROP POLICY IF EXISTS "No anonymous access to parts_new" ON public.parts_new;

-- Cleanup old logs (>30d)
DELETE FROM public.catalog_event_log WHERE created_at < now() - interval '30 days';
DELETE FROM public.price_sync_runs WHERE created_at < now() - interval '30 days' AND status IN ('success','failed');
DELETE FROM public.jm_tree_sync_runs WHERE started_at < now() - interval '30 days' AND status IN ('success','failed');
