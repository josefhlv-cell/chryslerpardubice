
REVOKE SELECT ON public.vehicles FROM anon, authenticated;
GRANT SELECT (
  id, brand, model, year, price, mileage, fuel, power, engine,
  transmission, color, condition, description, images, is_active,
  created_at, updated_at, listing_url
) ON public.vehicles TO anon, authenticated;
GRANT SELECT ON public.vehicles TO service_role;

CREATE POLICY "Users can view own ai_conversations"
ON public.ai_conversations
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owner or admin can insert checkins"
ON public.service_checkins
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM public.service_orders so
    WHERE so.id = service_checkins.service_order_id
      AND so.user_id = auth.uid()
  )
);

REVOKE EXECUTE ON FUNCTION public.get_cron_job_status() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.manage_price_sync_cron(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_stuck_price_sync_runs() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) FROM anon, authenticated;
