
-- 1. Fix parts_new: remove public SELECT, force through view only
DROP POLICY IF EXISTS "Public can read parts via view" ON public.parts_new;
CREATE POLICY "Authenticated can read parts" ON public.parts_new
  FOR SELECT TO authenticated
  USING (true);

-- 2. Fix api_cache: restrict SELECT to authenticated only
DROP POLICY IF EXISTS "Anyone can read cache" ON public.api_cache;
CREATE POLICY "Authenticated can read cache" ON public.api_cache
  FOR SELECT TO authenticated
  USING (true);

-- 3. Fix employees: restrict to admins + self only (remove broad authenticated read)
DROP POLICY IF EXISTS "Authenticated can view active employees" ON public.employees;

-- 4. Fix epc_generation_queue: restrict SELECT to authenticated
DROP POLICY IF EXISTS "Anyone can read queue" ON public.epc_generation_queue;
CREATE POLICY "Authenticated can read queue" ON public.epc_generation_queue
  FOR SELECT TO authenticated
  USING (true);
