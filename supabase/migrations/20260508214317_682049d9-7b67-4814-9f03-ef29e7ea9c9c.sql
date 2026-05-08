
REVOKE EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) TO service_role;
