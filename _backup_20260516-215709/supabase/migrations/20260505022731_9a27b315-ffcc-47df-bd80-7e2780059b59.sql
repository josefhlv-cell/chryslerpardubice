-- Harden SECURITY DEFINER functions: revoke EXECUTE from anon/public, keep only what is needed.
-- has_role: required by RLS policies for authenticated users.
-- bulk_attach_part_to_vehicles: called by admins from client.
-- Everything else: only invoked via service role (edge functions) or as trigger.

REVOKE EXECUTE ON FUNCTION public.can_place_order(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_api_cache() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manage_price_sync_cron(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_fault_report() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_admins_vehicle_request() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.notify_customer_fault_status() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.orders_calculate_price() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stuck_price_sync_runs() FROM PUBLIC, anon, authenticated;

-- Keep these callable:
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) TO authenticated;