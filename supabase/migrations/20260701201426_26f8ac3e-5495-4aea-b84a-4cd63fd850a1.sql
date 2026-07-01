
-- Update tow trigger: notify BOTH admin and customer with correct deep-links
CREATE OR REPLACE FUNCTION public.trg_notify_admins_tow_request()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _loc text;
BEGIN
  _loc := CASE
    WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
    THEN 'GPS ' || NEW.latitude::text || ', ' || NEW.longitude::text
    ELSE COALESCE(NEW.location_text,'poloha neznámá')
  END;

  -- admin notification (deep link into admin panel with id)
  PERFORM public.notify_admins_event(
    'tow_request',
    '🚨 Žádost o odtah',
    NEW.vehicle_info || ' — ' || NEW.problem_type || ' (' || NEW.passengers || ' os.) • tel: ' || NEW.phone || ' • ' || _loc,
    'tow:' || NEW.id::text,
    '/admin?tab=tow&id=' || NEW.id::text
  );

  -- customer confirmation with deep link to their own tow-requests page
  INSERT INTO public.notifications (user_id, title, message, dedupe_key, link, event_type)
  VALUES (
    NEW.user_id,
    '🚨 Žádost o odtah odeslána',
    'Přijali jsme vaši žádost o odtah (' || NEW.vehicle_info || '). Kontaktujeme vás co nejdříve.',
    'tow-own:' || NEW.id::text,
    '/my-tow-requests?id=' || NEW.id::text,
    'tow_request_own'
  )
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;

  RETURN NEW;
END;
$$;

-- Customer notification on tow status change
CREATE OR REPLACE FUNCTION public.notify_customer_tow_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, title, message, link, event_type)
    VALUES (
      NEW.user_id,
      '🚨 Stav odtahu: ' || NEW.status,
      'Vaše žádost o odtah (' || NEW.vehicle_info || ') má nový stav: ' || NEW.status
      || CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> ''
              THEN E'\nPoznámka: ' || NEW.admin_note ELSE '' END,
      '/my-tow-requests?id=' || NEW.id::text,
      'tow_status'
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_tow_status ON public.tow_requests;
CREATE TRIGGER trg_notify_customer_tow_status
AFTER UPDATE ON public.tow_requests
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_tow_status();
