
-- A) Fix handle_new_user to capture phone
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, phone, account_type, status, company_name, ico, dic, loyalty_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NULLIF(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'account_type', 'private'),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'account_type', 'private') = 'business' THEN 'pending'
      ELSE 'active'
    END,
    NEW.raw_user_meta_data->>'company_name',
    NEW.raw_user_meta_data->>'ico',
    NEW.raw_user_meta_data->>'dic',
    true
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$function$;

-- B) Harden SECURITY DEFINER functions: revoke from public/anon
REVOKE EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_attach_part_to_vehicles(uuid, text, text, text, integer, integer, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_or_create_nextis_vehicle(text, text, text, integer, integer, text) TO authenticated;

-- F) Drop _backup_* tables (we have ZIP backup)
DROP TABLE IF EXISTS public._backup_catalog_categories_20260430_v3;
DROP TABLE IF EXISTS public._backup_catalog_part_categories_20260430_v3;
DROP TABLE IF EXISTS public._backup_parts_new_20260504;

-- New: add 'inquiry' value to order_type for "Na dotaz" flow
ALTER TYPE public.order_type ADD VALUE IF NOT EXISTS 'inquiry';
