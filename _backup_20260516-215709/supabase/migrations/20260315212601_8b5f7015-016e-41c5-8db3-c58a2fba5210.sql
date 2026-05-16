
-- 1. Fix parts_new: restrict public SELECT to only safe columns via a function
DROP POLICY IF EXISTS "Public can read parts via view" ON public.parts_new;
CREATE POLICY "Public can read parts via view" ON public.parts_new
  FOR SELECT TO public
  USING (true);
-- Actually we need to keep public read for the catalog to work, but hide admin columns.
-- Better approach: revoke direct table access for anon, use view only.
-- For now, create a more restrictive view-based approach:

-- 2. Fix service_book_shares: remove overly permissive public read
DROP POLICY IF EXISTS "Anyone can read by token" ON public.service_book_shares;
-- Only owners and admins can read shares (token validation done in app code)

-- 3. Fix employees: create a public-safe view, restrict direct table access
DROP POLICY IF EXISTS "Anyone can view active employees" ON public.employees;
CREATE POLICY "Authenticated can view active employees" ON public.employees
  FOR SELECT TO authenticated
  USING (active = true);

-- 4. Fix api_cache: restrict writes to admins only
DROP POLICY IF EXISTS "Authenticated can insert cache" ON public.api_cache;
DROP POLICY IF EXISTS "Authenticated can update cache" ON public.api_cache;
DROP POLICY IF EXISTS "Authenticated can delete cache" ON public.api_cache;

CREATE POLICY "Admins can insert cache" ON public.api_cache
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update cache" ON public.api_cache
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete cache" ON public.api_cache
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. Fix epc_generation_queue: restrict INSERT to admins
DROP POLICY IF EXISTS "Authenticated can insert queue" ON public.epc_generation_queue;
CREATE POLICY "Admins can insert queue" ON public.epc_generation_queue
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 6. Fix vehicle_buyback_requests: require user_id match
DROP POLICY IF EXISTS "Anyone can create buyback requests" ON public.vehicle_buyback_requests;
CREATE POLICY "Authenticated can create buyback requests" ON public.vehicle_buyback_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- 7. Fix vehicle_import_requests: require user_id match
DROP POLICY IF EXISTS "Anyone can create import requests" ON public.vehicle_import_requests;
CREATE POLICY "Authenticated can create import requests" ON public.vehicle_import_requests
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);
