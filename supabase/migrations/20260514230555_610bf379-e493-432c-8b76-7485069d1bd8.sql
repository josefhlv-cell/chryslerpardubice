-- ============================================
-- FÁZE 1: parts_new — skrýt admin pole
-- ============================================
DROP POLICY IF EXISTS "Anyone can view public catalog fields" ON public.parts_new;

-- Pouze admini mají přímý SELECT na parts_new (vidí marže atd.)
CREATE POLICY "Only admins can view parts_new directly"
ON public.parts_new
FOR SELECT
TO authenticated, anon
USING (has_role(auth.uid(), 'admin'::app_role));

-- View parts_new_public musí být čitelný pro všechny (bez admin polí)
GRANT SELECT ON public.parts_new_public TO anon, authenticated;

-- ============================================
-- vehicle_inquiries — zúžit čtení
-- ============================================
DROP POLICY IF EXISTS "Users can view own inquiries" ON public.vehicle_inquiries;

CREATE POLICY "Users can view only own inquiries"
ON public.vehicle_inquiries
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- ============================================
-- Storage: fault-photos — zrušit broad read
-- ============================================
DROP POLICY IF EXISTS "Authenticated users can read fault photos" ON storage.objects;
-- ponecháváme: "Users can read own fault photos" + "Admins can read all storage photos"

-- ============================================
-- Realtime — blokovat anonymní odběr
-- ============================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can subscribe" ON realtime.messages;
CREATE POLICY "Authenticated users can subscribe"
ON realtime.messages
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Authenticated users can send" ON realtime.messages;
CREATE POLICY "Authenticated users can send"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (true);

-- ============================================
-- FÁZE 2: REVOKE EXECUTE FROM anon
-- ============================================
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.can_place_order(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_cron_job_status() FROM anon;
REVOKE EXECUTE ON FUNCTION public.manage_price_sync_cron(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stuck_price_sync_runs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_api_cache() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.dedupe_catalog_compat() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) FROM anon;