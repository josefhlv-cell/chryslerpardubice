CREATE TABLE public._backup_parts_new_20260504 AS SELECT * FROM public.parts_new;
ALTER TABLE public._backup_parts_new_20260504 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage parts_new backup 20260504" ON public._backup_parts_new_20260504 FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));