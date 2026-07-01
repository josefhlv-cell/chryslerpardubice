
-- Allow customers to cancel their own orders while still in early state.
CREATE POLICY "Users can cancel own pending orders"
ON public.orders
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND status::text = ANY (ARRAY['nova','prijata','zpracovava_se'])
)
WITH CHECK (
  auth.uid() = user_id
  AND status::text = 'zrusena'
);
