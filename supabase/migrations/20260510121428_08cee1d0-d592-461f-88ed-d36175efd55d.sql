CREATE TABLE IF NOT EXISTS public.jm_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nextis_order_id text,
  status text NOT NULL DEFAULT 'pending',
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total_price numeric,
  user_note text,
  request_payload jsonb,
  response_payload jsonb,
  error_message text,
  attempts integer NOT NULL DEFAULT 0,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jm_orders_order_id ON public.jm_orders(order_id);
CREATE INDEX IF NOT EXISTS idx_jm_orders_status ON public.jm_orders(status);
CREATE INDEX IF NOT EXISTS idx_jm_orders_user_id ON public.jm_orders(user_id);

ALTER TABLE public.jm_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage jm_orders"
  ON public.jm_orders FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users view own jm_orders"
  ON public.jm_orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_jm_orders_updated_at
  BEFORE UPDATE ON public.jm_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();