
-- Fix parts_new: only admins read directly, customers use the view
DROP POLICY IF EXISTS "Authenticated can read parts" ON public.parts_new;

-- Fix api_cache + epc_generation_queue: admin-only SELECT
DROP POLICY IF EXISTS "Authenticated can read cache" ON public.api_cache;
CREATE POLICY "Admins can read cache" ON public.api_cache
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Authenticated can read queue" ON public.epc_generation_queue;
CREATE POLICY "Admins can read queue" ON public.epc_generation_queue
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
