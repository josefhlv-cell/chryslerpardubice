
-- Add photos column to service_history
ALTER TABLE public.service_history ADD COLUMN IF NOT EXISTS photos text[] DEFAULT '{}';

-- Create storage bucket for service history photos
INSERT INTO storage.buckets (id, name, public) VALUES ('service-photos', 'service-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS for storage: admins can upload/delete, authenticated can view
CREATE POLICY "Admins can upload service photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'service-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete service photos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'service-photos' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Anyone can view service photos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'service-photos');
