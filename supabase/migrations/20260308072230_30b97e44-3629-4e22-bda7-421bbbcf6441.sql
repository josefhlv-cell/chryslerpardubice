
-- Function to notify all admins about new vehicle requests
CREATE OR REPLACE FUNCTION public.notify_admins_vehicle_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _admin_id uuid;
  _title text;
  _message text;
BEGIN
  IF TG_TABLE_NAME = 'vehicle_buyback_requests' THEN
    _title := 'Nový požadavek na výkup vozu';
    _message := format('Značka: %s, Model: %s, Rok: %s, Stav: %s, Kontakt: %s (%s)',
      NEW.brand, NEW.model, NEW.year, NEW.condition, COALESCE(NEW.name, '—'), COALESCE(NEW.email, NEW.phone, '—'));
  ELSIF TG_TABLE_NAME = 'vehicle_import_requests' THEN
    _title := 'Nový požadavek na individuální dovoz';
    _message := format('Značka: %s, Model: %s, Kontakt: %s (%s)',
      NEW.brand, NEW.model, COALESCE(NEW.name, '—'), COALESCE(NEW.email, NEW.phone, '—'));
  END IF;

  FOR _admin_id IN
    SELECT user_id FROM public.user_roles WHERE role = 'admin'
  LOOP
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (_admin_id, _title, _message);
  END LOOP;

  RETURN NEW;
END;
$$;

-- Triggers
CREATE TRIGGER trg_notify_buyback
  AFTER INSERT ON public.vehicle_buyback_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_vehicle_request();

CREATE TRIGGER trg_notify_import
  AFTER INSERT ON public.vehicle_import_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_vehicle_request();
