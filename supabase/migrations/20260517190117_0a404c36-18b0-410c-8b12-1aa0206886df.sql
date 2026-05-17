CREATE TABLE IF NOT EXISTS public.admin_review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  ref_table text,
  ref_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reason text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

ALTER TABLE public.admin_review_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage review queue"
ON public.admin_review_queue
FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_admin_review_queue_topic_status ON public.admin_review_queue (topic, status);