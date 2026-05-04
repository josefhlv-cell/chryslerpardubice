
-- 1) Enable RLS on backup tables (admin-only)
ALTER TABLE public._backup_catalog_categories_20260430_v3 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_catalog_part_categories_20260430_v3 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage backup cats v3"
  ON public._backup_catalog_categories_20260430_v3
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage backup part cats v3"
  ON public._backup_catalog_part_categories_20260430_v3
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 2) Make remaining view security_invoker
ALTER VIEW public.catalog_engine_variants SET (security_invoker = on);

-- 3) Revoke EXECUTE from anon/public on SECURITY DEFINER functions
REVOKE EXECUTE ON FUNCTION public.manage_price_sync_cron(text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_status() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_place_order(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;

-- Keep authenticated execution where it's used by RLS / app code
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_place_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_cron_job_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.manage_price_sync_cron(text) TO authenticated;
