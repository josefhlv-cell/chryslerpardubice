
-- 1. VEHICLES: hide VIN from anon/authenticated via column-level grants
REVOKE SELECT ON public.vehicles FROM anon, authenticated;

GRANT SELECT (
  id, brand, model, year, price, mileage, fuel, power, engine,
  transmission, color, condition, description, images, is_active,
  created_at, updated_at, listing_url
) ON public.vehicles TO anon, authenticated;

GRANT ALL ON public.vehicles TO service_role;

-- 2. REALTIME: drop sensitive/internal tables from publication
ALTER PUBLICATION supabase_realtime DROP TABLE public.employees;
ALTER PUBLICATION supabase_realtime DROP TABLE public.price_sync_runs;
ALTER PUBLICATION supabase_realtime DROP TABLE public.work_reports;

-- 3. SECURITY DEFINER functions: revoke EXECUTE from anon/authenticated
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.can_place_order(uuid) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.trg_send_push_on_notification() FROM anon, authenticated, PUBLIC;
