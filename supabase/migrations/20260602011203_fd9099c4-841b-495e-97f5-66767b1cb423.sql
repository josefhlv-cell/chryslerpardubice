-- 1) Attach admin notification triggers
DROP TRIGGER IF EXISTS trg_orders_notify_admins ON public.orders;
CREATE TRIGGER trg_orders_notify_admins AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_order();

DROP TRIGGER IF EXISTS trg_orders_email_admins ON public.orders;
CREATE TRIGGER trg_orders_email_admins AFTER INSERT ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_email_admins_new_order();

DROP TRIGGER IF EXISTS trg_orders_dispatch_jm ON public.orders;
CREATE TRIGGER trg_orders_dispatch_jm AFTER UPDATE OF status ON public.orders FOR EACH ROW EXECUTE FUNCTION public.trg_dispatch_jm_order();

DROP TRIGGER IF EXISTS trg_profiles_notify_admins ON public.profiles;
CREATE TRIGGER trg_profiles_notify_admins AFTER INSERT ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_user();

DROP TRIGGER IF EXISTS trg_service_bookings_notify_admins ON public.service_bookings;
CREATE TRIGGER trg_service_bookings_notify_admins AFTER INSERT ON public.service_bookings FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_booking();

DROP TRIGGER IF EXISTS trg_fault_reports_notify_admins ON public.fault_reports;
CREATE TRIGGER trg_fault_reports_notify_admins AFTER INSERT ON public.fault_reports FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_new_fault();

DROP TRIGGER IF EXISTS trg_notifications_send_push ON public.notifications;
CREATE TRIGGER trg_notifications_send_push AFTER INSERT ON public.notifications FOR EACH ROW EXECUTE FUNCTION public.trg_send_push_on_notification();

-- 2) OEM enrichment from jm_part_v2
WITH jm_match AS (
  SELECT DISTINCT ON (public.normalize_oem(oem_number))
    public.normalize_oem(oem_number) AS norm_oem, image_url, name, raw
  FROM public.jm_part_v2
  WHERE image_url IS NOT NULL AND image_url <> ''
)
UPDATE public.kitoem_parts k
SET image_urls = ARRAY[jm.image_url]::text[], updated_at = now()
FROM jm_match jm
WHERE public.normalize_oem(k.oem_number) = jm.norm_oem
  AND (k.image_urls IS NULL OR array_length(k.image_urls,1) IS NULL);

WITH jm_match AS (
  SELECT DISTINCT ON (public.normalize_oem(oem_number))
    public.normalize_oem(oem_number) AS norm_oem, name
  FROM public.jm_part_v2
  WHERE name IS NOT NULL AND name <> ''
)
UPDATE public.kitoem_parts k
SET description = jm.name, updated_at = now()
FROM jm_match jm
WHERE public.normalize_oem(k.oem_number) = jm.norm_oem
  AND (k.description IS NULL OR k.description = '');

WITH jm_match AS (
  SELECT DISTINCT ON (public.normalize_oem(oem_number))
    public.normalize_oem(oem_number) AS norm_oem, raw
  FROM public.jm_part_v2
  WHERE raw->'technical_params' IS NOT NULL
)
UPDATE public.kitoem_parts k
SET technical_params = jm.raw->'technical_params', updated_at = now()
FROM jm_match jm
WHERE public.normalize_oem(k.oem_number) = jm.norm_oem
  AND (k.technical_params IS NULL OR k.technical_params = '{}'::jsonb);

-- 3) User activity timeline view (cast status to text to satisfy UNION typing)
CREATE OR REPLACE VIEW public.user_activity_timeline
WITH (security_invoker=on) AS
  SELECT 'register'::text AS kind, user_id, id::text AS ref_id, created_at AS occurred_at,
    'Registrace'::text AS title, coalesce(account_type,'private')::text AS description,
    NULL::text AS badge, NULL::text AS link
  FROM public.profiles
  UNION ALL
  SELECT 'vehicle'::text, user_id, id::text, created_at,
    'Přidáno vozidlo'::text, (coalesce(brand,'') || ' ' || coalesce(model,'') || ' ' || coalesce(year::text,''))::text,
    license_plate::text, NULL::text
  FROM public.user_vehicles
  UNION ALL
  SELECT 'order'::text, user_id, id::text, created_at,
    'Objednávka'::text, (coalesce(part_name, oem_number, '—') || ' × ' || coalesce(quantity::text,'1'))::text,
    status::text, ('/admin?tab=orders&id=' || id::text)::text
  FROM public.orders
  UNION ALL
  SELECT 'service'::text, user_id, id::text, created_at,
    'Servisní zakázka'::text, coalesce(description,'—')::text,
    status::text, ('/admin?tab=service-orders&id=' || id::text)::text
  FROM public.service_orders
  UNION ALL
  SELECT 'booking'::text, user_id, id::text, created_at,
    'Rezervace servisu'::text, coalesce(service_type,'—')::text,
    status::text, NULL::text
  FROM public.service_bookings
  UNION ALL
  SELECT 'fault'::text, user_id, id::text, created_at,
    'Hlášení závady'::text, coalesce(description,'—')::text,
    status::text, NULL::text
  FROM public.fault_reports
  UNION ALL
  SELECT 'notification'::text, user_id, id::text, created_at,
    coalesce(title,'Notifikace')::text, coalesce(message,'')::text,
    NULL::text, link::text
  FROM public.notifications;

GRANT SELECT ON public.user_activity_timeline TO authenticated, service_role;