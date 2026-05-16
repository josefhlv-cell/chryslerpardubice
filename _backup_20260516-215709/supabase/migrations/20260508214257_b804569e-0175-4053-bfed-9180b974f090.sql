
REVOKE EXECUTE ON FUNCTION public.manage_price_sync_cron(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stuck_price_sync_runs() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_api_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.manage_price_sync_cron(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_stuck_price_sync_runs() TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_api_cache() TO service_role;
