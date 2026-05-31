
-- Trigger: při INSERT do orders zavolat notify-admin edge funkci pro email adminům
CREATE OR REPLACE FUNCTION public.trg_email_admins_new_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/notify-admin',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'Authorization','Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bWVpbHV2cG1jaGlweXNzZG1zIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI1ODM5MDksImV4cCI6MjA4ODE1OTkwOX0.1jnb06nPP9H91B7UYZK593JyeoMNyQCysp3VKUmcPa4'
    ),
    body := jsonb_build_object(
      'type','order',
      'record', jsonb_build_object(
        'id', NEW.id,
        'part_name', NEW.part_name,
        'oem_number', NEW.oem_number,
        'order_type', NEW.order_type,
        'quantity', NEW.quantity,
        'unit_price', NEW.unit_price,
        'price_with_vat', NEW.price_with_vat,
        'catalog_source', NEW.catalog_source,
        'customer_note', NEW.customer_note,
        'link', concat('/admin?tab=orders&id=', NEW.id::text)
      )
    )
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_admins_new_order ON public.orders;
CREATE TRIGGER email_admins_new_order
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.trg_email_admins_new_order();
