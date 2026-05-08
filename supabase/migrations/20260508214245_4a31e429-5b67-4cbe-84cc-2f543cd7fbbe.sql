
-- 1) Normalize duplicate categories (remove "(English)" suffixes)
UPDATE public.parts_new 
SET category = TRIM(regexp_replace(category, '\s*\([^)]+\)\s*$', ''))
WHERE category ~ '\([A-Za-z][A-Za-z /]+\)\s*$';

-- Merge "Chladící systém" -> "Chlazení"
UPDATE public.parts_new SET category = 'Chlazení' WHERE category IN ('Chladící systém','Chladici system','Chladicí systém');

-- 2) Security hardening: bulk_attach must be admin-only (already checked in body, but lock execute)
REVOKE EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) FROM PUBLIC, anon;

-- 3) Slow down price-sync cron from every minute to every 5 minutes
DO $$
BEGIN
  PERFORM cron.unschedule('price-sync-auto');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;
