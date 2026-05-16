
-- 1. Add new columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'private',
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS company_name text,
  ADD COLUMN IF NOT EXISTS ico text,
  ADD COLUMN IF NOT EXISTS dic text,
  ADD COLUMN IF NOT EXISTS discount_percent numeric NOT NULL DEFAULT 0;

-- 2. Add constraint for account_type and status
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_account_type_check CHECK (account_type IN ('private', 'business')),
  ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'pending', 'rejected'));

-- 3. Update handle_new_user to support account_type
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, account_type, status, company_name, ico, dic, loyalty_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
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
$$;

-- 4. Create parts_new table
CREATE TABLE public.parts_new (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  oem_number text NOT NULL,
  internal_code text,
  name text NOT NULL,
  family text,
  category text,
  segment text,
  packaging text,
  price_without_vat numeric NOT NULL DEFAULT 0,
  price_with_vat numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'CZK',
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_parts_new_oem ON public.parts_new (oem_number);
CREATE INDEX idx_parts_new_internal_code ON public.parts_new (internal_code);
CREATE INDEX idx_parts_new_name ON public.parts_new USING gin (to_tsvector('simple', name));

ALTER TABLE public.parts_new ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view parts" ON public.parts_new
  FOR SELECT USING (true);

CREATE POLICY "Admins can manage parts" ON public.parts_new
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 5. Create orders table
CREATE TYPE public.order_type AS ENUM ('new', 'used');
CREATE TYPE public.order_status_v2 AS ENUM ('nova', 'zpracovava_se', 'vyrizena', 'zrusena');

CREATE TABLE public.orders (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  part_id uuid REFERENCES public.parts_new(id),
  part_name text,
  oem_number text,
  quantity integer NOT NULL DEFAULT 1,
  order_type public.order_type NOT NULL,
  status public.order_status_v2 NOT NULL DEFAULT 'nova',
  unit_price numeric,
  discount_percent numeric DEFAULT 0,
  discounted_price numeric,
  price_with_vat numeric,
  customer_note text,
  admin_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders" ON public.orders
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders" ON public.orders
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can create orders" ON public.orders
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can update orders" ON public.orders
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

-- 6. Create cars_for_sale table
CREATE TABLE public.cars_for_sale (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand text NOT NULL,
  model text NOT NULL,
  year integer NOT NULL,
  price numeric NOT NULL,
  mileage integer,
  fuel text,
  transmission text,
  description text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cars_for_sale ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active cars" ON public.cars_for_sale
  FOR SELECT USING (is_active = true);

CREATE POLICY "Admins can manage cars" ON public.cars_for_sale
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- 7. Updated_at triggers for new tables
CREATE TRIGGER update_parts_new_updated_at
  BEFORE UPDATE ON public.parts_new
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cars_for_sale_updated_at
  BEFORE UPDATE ON public.cars_for_sale
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Function to check if user can place orders (blocks pending business)
CREATE OR REPLACE FUNCTION public.can_place_order(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = _user_id
      AND status = 'active'
  )
$$;

-- 9. Function to calculate discounted price server-side
CREATE OR REPLACE FUNCTION public.calculate_discounted_price(
  _price_without_vat numeric,
  _discount_percent numeric,
  _vat_rate numeric DEFAULT 21
)
RETURNS TABLE(discounted_price numeric, price_with_vat numeric)
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    ROUND(_price_without_vat * (1 - _discount_percent / 100), 2) AS discounted_price,
    ROUND(_price_without_vat * (1 - _discount_percent / 100) * (1 + _vat_rate / 100), 2) AS price_with_vat
$$;

-- 10. Trigger to auto-calculate prices on order insert
CREATE OR REPLACE FUNCTION public.orders_calculate_price()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _discount numeric;
  _account_type text;
BEGIN
  -- Get user discount
  SELECT p.discount_percent, p.account_type INTO _discount, _account_type
  FROM public.profiles p WHERE p.user_id = NEW.user_id;

  -- Block pending business accounts
  IF NOT public.can_place_order(NEW.user_id) THEN
    RAISE EXCEPTION 'Váš účet zatím nebyl schválen. Objednávky nejsou povoleny.';
  END IF;

  -- Only apply discount for business accounts
  IF _account_type = 'business' AND _discount > 0 AND NEW.unit_price IS NOT NULL THEN
    NEW.discount_percent := _discount;
    NEW.discounted_price := ROUND(NEW.unit_price * (1 - _discount / 100), 2);
    NEW.price_with_vat := ROUND(NEW.discounted_price * 1.21, 2);
  ELSIF NEW.unit_price IS NOT NULL THEN
    NEW.discount_percent := 0;
    NEW.discounted_price := NEW.unit_price;
    NEW.price_with_vat := ROUND(NEW.unit_price * 1.21, 2);
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER orders_before_insert_calculate
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_calculate_price();
