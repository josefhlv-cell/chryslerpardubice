
CREATE TABLE public.tow_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  vehicle_info text NOT NULL,
  problem_type text NOT NULL,
  phone text NOT NULL,
  passengers int NOT NULL DEFAULT 1,
  latitude double precision,
  longitude double precision,
  accuracy double precision,
  location_text text,
  status text NOT NULL DEFAULT 'new',
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.tow_requests TO authenticated;
GRANT ALL ON public.tow_requests TO service_role;

ALTER TABLE public.tow_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users insert own tow requests" ON public.tow_requests
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users view own tow requests" ON public.tow_requests
  FOR SELECT TO authenticated USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Admins manage tow requests" ON public.tow_requests
  FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.trg_notify_admins_tow_request()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  _loc text;
BEGIN
  _loc := CASE
    WHEN NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL
    THEN 'GPS ' || NEW.latitude::text || ', ' || NEW.longitude::text
    ELSE COALESCE(NEW.location_text,'poloha neznámá')
  END;
  PERFORM public.notify_admins_event(
    'tow_request',
    '🚨 Žádost o odtah',
    NEW.vehicle_info || ' — ' || NEW.problem_type || ' (' || NEW.passengers || ' os.) • tel: ' || NEW.phone || ' • ' || _loc,
    'tow:' || NEW.id::text,
    '/admin?tab=tow&id=' || NEW.id::text
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tow_requests_notify_admins
AFTER INSERT ON public.tow_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_tow_request();

-- Extend timeline view to include tow requests
CREATE OR REPLACE VIEW public.user_activity_timeline AS
SELECT * FROM (
  SELECT 'register'::text AS kind, profiles.user_id, profiles.id::text AS ref_id, profiles.created_at AS occurred_at,
    'Registrace'::text AS title, COALESCE(profiles.account_type,'private') AS description, NULL::text AS badge, NULL::text AS link
  FROM profiles
  UNION ALL
  SELECT 'vehicle', user_vehicles.user_id, user_vehicles.id::text, user_vehicles.created_at,
    'Přidáno vozidlo', COALESCE(user_vehicles.brand,'')||' '||COALESCE(user_vehicles.model,'')||' '||COALESCE(user_vehicles.year::text,''),
    user_vehicles.license_plate, NULL FROM user_vehicles
  UNION ALL
  SELECT 'order', orders.user_id, orders.id::text, orders.created_at, 'Objednávka',
    COALESCE(orders.part_name, orders.oem_number,'—')||' × '||COALESCE(orders.quantity::text,'1'),
    orders.status::text, '/admin?tab=orders&id='||orders.id::text FROM orders
  UNION ALL
  SELECT 'service', service_orders.user_id, service_orders.id::text, service_orders.created_at,
    'Servisní zakázka', COALESCE(service_orders.description,'—'), service_orders.status::text,
    '/admin?tab=service-orders&id='||service_orders.id::text FROM service_orders
  UNION ALL
  SELECT 'booking', service_bookings.user_id, service_bookings.id::text, service_bookings.created_at,
    'Rezervace servisu', COALESCE(service_bookings.service_type,'—'), service_bookings.status::text, NULL FROM service_bookings
  UNION ALL
  SELECT 'fault', fault_reports.user_id, fault_reports.id::text, fault_reports.created_at,
    'Hlášení závady', COALESCE(fault_reports.description,'—'), fault_reports.status, NULL FROM fault_reports
  UNION ALL
  SELECT 'tow', tow_requests.user_id, tow_requests.id::text, tow_requests.created_at,
    '🚨 Žádost o odtah',
    tow_requests.vehicle_info||' — '||tow_requests.problem_type||' ('||tow_requests.passengers||' os.) tel: '||tow_requests.phone,
    tow_requests.status,
    '/admin?tab=tow&id='||tow_requests.id::text
  FROM tow_requests
  UNION ALL
  SELECT 'notification', notifications.user_id, notifications.id::text, notifications.created_at,
    COALESCE(notifications.title,'Notifikace'), COALESCE(notifications.message,''), NULL, notifications.link
  FROM notifications
) t;

GRANT SELECT ON public.user_activity_timeline TO authenticated;
