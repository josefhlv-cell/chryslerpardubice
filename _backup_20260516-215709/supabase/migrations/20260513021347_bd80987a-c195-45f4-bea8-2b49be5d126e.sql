
CREATE OR REPLACE FUNCTION public.dedupe_catalog_compat()
RETURNS TABLE(removed integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  WITH d AS (
    DELETE FROM public.catalog_vehicle_compatibility a
    USING public.catalog_vehicle_compatibility b
    WHERE a.ctid < b.ctid
      AND a.part_id = b.part_id
      AND a.nextis_vehicle_id IS NOT DISTINCT FROM b.nextis_vehicle_id
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM d;
  removed := _n; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION public.dedupe_catalog_compat() FROM PUBLIC, anon, authenticated;
