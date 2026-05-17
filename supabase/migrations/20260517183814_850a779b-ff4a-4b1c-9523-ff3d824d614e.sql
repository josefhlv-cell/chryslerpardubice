-- Grant SELECT on parts_new to anon/authenticated so the parts_new_public view
-- (security_invoker) can return rows. RLS policy "Anyone can view public catalog fields"
-- already controls what they can see; this only unblocks the table-level grant check
-- that PostgREST enforces before evaluating RLS.
GRANT SELECT ON public.parts_new TO anon, authenticated;