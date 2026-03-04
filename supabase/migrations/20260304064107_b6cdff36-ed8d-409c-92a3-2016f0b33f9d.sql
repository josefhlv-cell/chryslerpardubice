
CREATE POLICY "Admins can delete parts catalog"
  ON public.parts_catalog FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));
