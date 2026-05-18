
REVOKE ALL ON FUNCTION public.notify_admins_event(text,text,text,text,text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_admins_new_order() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_admins_new_booking() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_admins_new_fault() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_admins_buyback() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_admins_import() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_notify_admins_new_user() FROM PUBLIC, anon, authenticated;
