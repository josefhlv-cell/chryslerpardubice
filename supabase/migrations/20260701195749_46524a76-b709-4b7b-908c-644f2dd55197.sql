
CREATE OR REPLACE FUNCTION public.notify_customer_order_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _label text;
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    _label := CASE NEW.status::text
      WHEN 'nova' THEN 'Nová'
      WHEN 'prijata' THEN 'Přijata'
      WHEN 'zpracovava_se' THEN 'Zpracovává se'
      WHEN 'zaplacena' THEN 'Zaplacena'
      WHEN 'odeslana' THEN 'Odeslána'
      WHEN 'dorucena' THEN 'Doručena'
      WHEN 'vyrizena' THEN 'Vyřízena'
      WHEN 'zrusena' THEN 'Zrušena'
      ELSE NEW.status::text
    END;
    INSERT INTO public.notifications (user_id, title, message, link, event_type)
    VALUES (
      NEW.user_id,
      '🛒 Stav vaší objednávky: ' || _label,
      format('Objednávka %s (%s) — nový stav: %s%s',
        COALESCE(NEW.part_name, NEW.oem_number, '—'),
        COALESCE(NEW.oem_number,'—'),
        _label,
        CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> ''
             THEN E'\nPoznámka: ' || NEW.admin_note ELSE '' END),
      '/orders?id=' || NEW.id::text,
      'order_status'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_customer_order_status ON public.orders;
CREATE TRIGGER trg_notify_customer_order_status
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_order_status();

CREATE OR REPLACE FUNCTION public.notify_customer_booking_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (NEW.status IS DISTINCT FROM OLD.status)
     OR (NEW.confirmed_date IS DISTINCT FROM OLD.confirmed_date) THEN
    INSERT INTO public.notifications (user_id, title, message, link, event_type)
    VALUES (
      NEW.user_id,
      '🔧 Rezervace servisu: ' || COALESCE(NEW.status::text,'aktualizace'),
      format('%s %s — %s%s%s',
        COALESCE(NEW.vehicle_brand,''),
        COALESCE(NEW.vehicle_model,''),
        COALESCE(NEW.service_type,'servis'),
        CASE WHEN NEW.confirmed_date IS NOT NULL
             THEN E'\nPotvrzený termín: ' || to_char(NEW.confirmed_date,'DD.MM.YYYY') ELSE '' END,
        CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> ''
             THEN E'\nPoznámka: ' || NEW.admin_note ELSE '' END),
      '/my-service-orders?id=' || NEW.id::text,
      'service_booking_status'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_customer_booking_status ON public.service_bookings;
CREATE TRIGGER trg_notify_customer_booking_status
AFTER UPDATE ON public.service_bookings
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_booking_status();
