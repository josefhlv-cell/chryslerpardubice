
-- Trigger: e-mail na obchod@chrysler.cz při nové servisní rezervaci
CREATE OR REPLACE FUNCTION public.trg_email_admins_new_service_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := jsonb_build_object('type','service_booking','record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS email_admins_new_service_booking ON public.service_bookings;
CREATE TRIGGER email_admins_new_service_booking
AFTER INSERT ON public.service_bookings
FOR EACH ROW EXECUTE FUNCTION public.trg_email_admins_new_service_booking();

-- Trigger: tow_requests
CREATE OR REPLACE FUNCTION public.trg_email_admins_new_tow()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := jsonb_build_object('type','tow_request','record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS email_admins_new_tow ON public.tow_requests;
CREATE TRIGGER email_admins_new_tow
AFTER INSERT ON public.tow_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_email_admins_new_tow();

-- Trigger: fault_reports
CREATE OR REPLACE FUNCTION public.trg_email_admins_new_fault()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := jsonb_build_object('type','fault_report','record', to_jsonb(NEW))
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS email_admins_new_fault ON public.fault_reports;
CREATE TRIGGER email_admins_new_fault
AFTER INSERT ON public.fault_reports
FOR EACH ROW EXECUTE FUNCTION public.trg_email_admins_new_fault();

-- Cron: každý všední den v 07:30 UTC (~08:30 CET / 09:30 CEST) pošle digest nevyřízených
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('admin-pending-digest-weekdays');
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

SELECT cron.schedule(
  'admin-pending-digest-weekdays',
  '30 7 * * 1-5',
  $cron$
  SELECT net.http_post(
    url:='https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/admin-pending-digest',
    headers:=jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body:='{}'::jsonb
  );
  $cron$
);
