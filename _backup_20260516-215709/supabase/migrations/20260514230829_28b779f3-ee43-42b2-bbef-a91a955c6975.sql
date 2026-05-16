REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.trg_dispatch_jm_order() FROM authenticated, anon;