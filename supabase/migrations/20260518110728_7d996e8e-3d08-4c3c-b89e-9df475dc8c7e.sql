
-- 1. Schema additions for notifications
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedupe_key text,
  ADD COLUMN IF NOT EXISTS link text,
  ADD COLUMN IF NOT EXISTS event_type text;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_dedupe_uidx
  ON public.notifications(user_id, dedupe_key)
  WHERE dedupe_key IS NOT NULL;

-- 2. Helper: fan-out to all admins, ignore duplicates
CREATE OR REPLACE FUNCTION public.notify_admins_event(
  _event_type text,
  _title text,
  _message text,
  _dedupe_key text,
  _link text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, title, message, dedupe_key, link, event_type)
  SELECT ur.user_id, _title, _message, _dedupe_key, _link, _event_type
  FROM public.user_roles ur
  WHERE ur.role = 'admin'
  ON CONFLICT (user_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING;
END;
$$;

-- 3. Trigger: new parts order
CREATE OR REPLACE FUNCTION public.trg_notify_admins_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _name text;
BEGIN
  SELECT COALESCE(NULLIF(full_name,''), email, 'Neznámý zákazník')
    INTO _name FROM public.profiles WHERE user_id = NEW.user_id;
  PERFORM public.notify_admins_event(
    'order_new',
    '🛒 Nová objednávka dílu',
    format('%s objednal/a %s × %s (%s) · %s',
      COALESCE(_name,'Zákazník'),
      COALESCE(NEW.quantity,1),
      COALESCE(NEW.part_name, NEW.oem_number, '—'),
      COALESCE(NEW.oem_number,'—'),
      to_char(NEW.created_at, 'DD.MM.YYYY HH24:MI')),
    'order:' || NEW.id::text,
    '/admin?tab=orders&id=' || NEW.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_new_order ON public.orders;
CREATE TRIGGER notify_admins_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_order();

-- 4. Trigger: new service booking
CREATE OR REPLACE FUNCTION public.trg_notify_admins_new_booking()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _name text;
BEGIN
  SELECT COALESCE(NULLIF(full_name,''), email, 'Neznámý zákazník')
    INTO _name FROM public.profiles WHERE user_id = NEW.user_id;
  PERFORM public.notify_admins_event(
    'service_booking_new',
    '🔧 Nová rezervace servisu',
    format('%s · %s %s · %s · preferováno %s · %s',
      COALESCE(_name,'Zákazník'),
      COALESCE(NEW.vehicle_brand,''),
      COALESCE(NEW.vehicle_model,''),
      COALESCE(NEW.service_type,'—'),
      COALESCE(NEW.preferred_date::text,'—'),
      to_char(NEW.created_at, 'DD.MM.YYYY HH24:MI')),
    'booking:' || NEW.id::text,
    '/admin?tab=service-bookings&id=' || NEW.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_new_booking ON public.service_bookings;
CREATE TRIGGER notify_admins_new_booking
  AFTER INSERT ON public.service_bookings
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_booking();

-- 5. Trigger: new fault report (OBD/manual)
CREATE OR REPLACE FUNCTION public.trg_notify_admins_new_fault()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _name text;
BEGIN
  SELECT COALESCE(NULLIF(full_name,''), email, 'Neznámý zákazník')
    INTO _name FROM public.profiles WHERE user_id = NEW.user_id;
  PERFORM public.notify_admins_event(
    'fault_report_new',
    '🛠️ Nové hlášení závady',
    format('%s · %s %s · %s · %s',
      COALESCE(_name,'Zákazník'),
      COALESCE(NEW.vehicle_brand,''),
      COALESCE(NEW.vehicle_model,''),
      LEFT(COALESCE(NEW.description,''),120),
      to_char(NEW.created_at, 'DD.MM.YYYY HH24:MI')),
    'fault:' || NEW.id::text,
    '/admin?tab=fault-reports&id=' || NEW.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_new_fault ON public.fault_reports;
DROP TRIGGER IF EXISTS notify_admins_fault_report ON public.fault_reports;
CREATE TRIGGER notify_admins_new_fault
  AFTER INSERT ON public.fault_reports
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_fault();

-- 6. Trigger: vehicle buyback request
CREATE OR REPLACE FUNCTION public.trg_notify_admins_buyback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_admins_event(
    'vehicle_buyback_new',
    '🚗 Nová poptávka — výkup vozu',
    format('%s · %s %s (%s) · kontakt: %s · %s',
      COALESCE(NEW.name,'Zájemce'),
      COALESCE(NEW.brand,''),
      COALESCE(NEW.model,''),
      COALESCE(NEW.year::text,'—'),
      COALESCE(NEW.phone, NEW.email, '—'),
      to_char(NEW.created_at, 'DD.MM.YYYY HH24:MI')),
    'buyback:' || NEW.id::text,
    '/admin?tab=vehicle-requests&id=' || NEW.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_buyback ON public.vehicle_buyback_requests;
CREATE TRIGGER notify_admins_buyback
  AFTER INSERT ON public.vehicle_buyback_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_buyback();

-- 7. Trigger: vehicle import request
CREATE OR REPLACE FUNCTION public.trg_notify_admins_import()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_admins_event(
    'vehicle_import_new',
    '🚗 Nová poptávka — dovoz vozu',
    format('%s · %s %s · kontakt: %s · %s',
      COALESCE(NEW.name,'Zájemce'),
      COALESCE(NEW.brand,''),
      COALESCE(NEW.model,''),
      COALESCE(NEW.phone, NEW.email, '—'),
      to_char(NEW.created_at, 'DD.MM.YYYY HH24:MI')),
    'import:' || NEW.id::text,
    '/admin?tab=vehicle-requests&id=' || NEW.id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_import ON public.vehicle_import_requests;
CREATE TRIGGER notify_admins_import
  AFTER INSERT ON public.vehicle_import_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_import();

-- 8. Trigger: new user registration (profile insert)
CREATE OR REPLACE FUNCTION public.trg_notify_admins_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.notify_admins_event(
    'user_new',
    '👤 Nová registrace uživatele',
    format('%s · %s · %s · %s',
      COALESCE(NULLIF(NEW.full_name,''),'(bez jména)'),
      COALESCE(NEW.email,'—'),
      COALESCE(NEW.account_type,'private'),
      to_char(NEW.created_at,'DD.MM.YYYY HH24:MI')),
    'user:' || NEW.user_id::text,
    '/admin?tab=users&id=' || NEW.user_id::text
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS notify_admins_new_user ON public.profiles;
CREATE TRIGGER notify_admins_new_user
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_user();

-- 9. Drop old vehicle-request trigger function reference if attached to tables (was earlier app code)
DROP TRIGGER IF EXISTS notify_admins_vehicle_request_buyback ON public.vehicle_buyback_requests;
DROP TRIGGER IF EXISTS notify_admins_vehicle_request_import ON public.vehicle_import_requests;
