
-- 1) Odstranění duplicitních triggerů (dvojité pushy/emaily/notifikace)
DROP TRIGGER IF EXISTS notifications_send_push ON public.notifications;
-- ponecháváme trg_notifications_send_push

DROP TRIGGER IF EXISTS notify_admins_new_order ON public.orders;
DROP TRIGGER IF EXISTS email_admins_new_order ON public.orders;
-- ponecháváme trg_orders_notify_admins a trg_orders_email_admins

DROP TRIGGER IF EXISTS notify_admins_new_booking ON public.service_bookings;
DROP TRIGGER IF EXISTS email_admins_new_service_booking ON public.service_bookings;

DROP TRIGGER IF EXISTS notify_admins_new_fault ON public.fault_reports;
DROP TRIGGER IF EXISTS email_admins_new_fault ON public.fault_reports;
DROP TRIGGER IF EXISTS trg_notify_admins_fault_report ON public.fault_reports;
-- ponecháváme trg_fault_reports_notify_admins (dedupe) + trg_notify_customer_fault_status

DROP TRIGGER IF EXISTS email_admins_new_tow ON public.tow_requests;
-- ponecháváme trg_tow_requests_notify_admins (posílá adminům deduplikovaně)
-- a přidáváme email níže

DROP TRIGGER IF EXISTS notify_admins_new_user ON public.profiles;
DROP TRIGGER IF EXISTS notify_admins_buyback ON public.vehicle_buyback_requests;
DROP TRIGGER IF EXISTS trg_notify_buyback ON public.vehicle_buyback_requests;
DROP TRIGGER IF EXISTS notify_admins_import ON public.vehicle_import_requests;
DROP TRIGGER IF EXISTS trg_notify_import ON public.vehicle_import_requests;

-- 2) Znovupřidání JEDNOHO dedupe triggeru pro buyback / import (funkce už existují)
CREATE TRIGGER trg_buyback_notify_admins
  AFTER INSERT ON public.vehicle_buyback_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_buyback();

CREATE TRIGGER trg_import_notify_admins
  AFTER INSERT ON public.vehicle_import_requests
  FOR EACH ROW EXECUTE FUNCTION public.trg_notify_admins_import();

-- 3) Email admin na obchod@chrysler.cz pro nové zákaznické zprávy v live chatu
CREATE OR REPLACE FUNCTION public.trg_email_admins_new_support_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _customer_id uuid;
  _customer_name text;
  _customer_email text;
BEGIN
  -- pouze zprávy od zákazníka
  IF NEW.is_from_admin THEN RETURN NEW; END IF;

  SELECT user_id INTO _customer_id
    FROM public.support_conversations WHERE id = NEW.conversation_id;

  SELECT COALESCE(NULLIF(full_name,''), email, 'Zákazník'), email
    INTO _customer_name, _customer_email
    FROM public.profiles WHERE user_id = _customer_id;

  PERFORM net.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := jsonb_build_object(
      'type','support_message',
      'record', jsonb_build_object(
        'conversation_id', NEW.conversation_id,
        'message', NEW.message,
        'customer_name', _customer_name,
        'customer_email', _customer_email,
        'created_at', NEW.created_at,
        'link', concat('/admin?tab=support-chat&conv=', NEW.conversation_id::text)
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END;
$function$;

DROP TRIGGER IF EXISTS trg_support_msg_email_admins ON public.support_messages;
CREATE TRIGGER trg_support_msg_email_admins
  AFTER INSERT ON public.support_messages
  FOR EACH ROW EXECUTE FUNCTION public.trg_email_admins_new_support_message();
