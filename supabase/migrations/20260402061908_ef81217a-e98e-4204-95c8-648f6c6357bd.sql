
-- Create private backups bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('backups', 'backups', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: only admins can manage backups
CREATE POLICY "Admins can manage backups"
  ON storage.objects FOR ALL
  TO authenticated
  USING (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'backups' AND public.has_role(auth.uid(), 'admin'));
