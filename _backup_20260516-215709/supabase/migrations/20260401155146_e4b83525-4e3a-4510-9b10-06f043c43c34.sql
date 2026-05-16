
CREATE TABLE public.ai_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  intent_type text,
  risk_level text,
  vehicle_brand text,
  vehicle_model text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage ai_conversations"
  ON public.ai_conversations FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role can insert ai_conversations"
  ON public.ai_conversations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);
