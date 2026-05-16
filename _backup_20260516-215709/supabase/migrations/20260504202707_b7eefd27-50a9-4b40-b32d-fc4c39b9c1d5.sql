
-- 1) Extend order_status_v2 enum with full workflow values
ALTER TYPE public.order_status_v2 ADD VALUE IF NOT EXISTS 'prijata';
ALTER TYPE public.order_status_v2 ADD VALUE IF NOT EXISTS 'zaplacena';
ALTER TYPE public.order_status_v2 ADD VALUE IF NOT EXISTS 'odeslana';
ALTER TYPE public.order_status_v2 ADD VALUE IF NOT EXISTS 'dorucena';

-- 2) Trigger: notify admins on new fault report
CREATE OR REPLACE FUNCTION public.notify_admins_fault_report()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _admin_id uuid;
  _title text;
  _message text;
BEGIN
  _title := '🛠️ Nové hlášení závady';
  _message := format('%s %s — %s',
    COALESCE(NEW.vehicle_brand, '—'),
    COALESCE(NEW.vehicle_model, ''),
    LEFT(COALESCE(NEW.description, ''), 120));

  FOR _admin_id IN SELECT user_id FROM public.user_roles WHERE role = 'admin' LOOP
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (_admin_id, _title, _message);
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_admins_fault_report ON public.fault_reports;
CREATE TRIGGER trg_notify_admins_fault_report
AFTER INSERT ON public.fault_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_admins_fault_report();

-- 3) Trigger: notify customer when fault report status changes
CREATE OR REPLACE FUNCTION public.notify_customer_fault_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.notifications (user_id, title, message)
    VALUES (
      NEW.user_id,
      '🔔 Stav vašeho hlášení se změnil',
      format('Hlášení závady má nyní stav: %s%s',
        NEW.status,
        CASE WHEN NEW.admin_note IS NOT NULL AND NEW.admin_note <> ''
             THEN E'\nPoznámka: ' || NEW.admin_note ELSE '' END)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_customer_fault_status ON public.fault_reports;
CREATE TRIGGER trg_notify_customer_fault_status
AFTER UPDATE ON public.fault_reports
FOR EACH ROW EXECUTE FUNCTION public.notify_customer_fault_status();

-- 4) Maintenance functions: cache cleanup + stuck sync watchdog
CREATE OR REPLACE FUNCTION public.cleanup_expired_api_cache()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  WITH d AS (
    DELETE FROM public.api_cache
    WHERE created_at + (ttl_seconds * interval '1 second') < now()
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM d;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_stuck_price_sync_runs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _n integer;
BEGIN
  WITH u AS (
    UPDATE public.price_sync_runs
    SET status='failed',
        last_error = COALESCE(last_error,'') || ' | watchdog: stuck >10min',
        finished_at = now()
    WHERE status='running'
      AND updated_at < now() - interval '10 minutes'
    RETURNING 1
  )
  SELECT count(*) INTO _n FROM u;
  RETURN _n;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cleanup_expired_api_cache() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.release_stuck_price_sync_runs() FROM anon, public;
