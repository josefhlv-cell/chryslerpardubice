ALTER VIEW public.parts_new_public SET (security_invoker = false);

GRANT SELECT ON public.parts_new_public TO anon, authenticated;