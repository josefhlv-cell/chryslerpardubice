
REVOKE EXECUTE ON FUNCTION public.ensure_obd_permissions_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_obd_permissions_for_user(uuid) TO service_role;
