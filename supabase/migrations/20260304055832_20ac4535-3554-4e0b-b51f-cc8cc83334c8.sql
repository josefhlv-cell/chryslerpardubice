
-- =============================================
-- CHRYSLER CZ - COMPLETE DATABASE ARCHITECTURE
-- =============================================

-- 1. ROLE ENUM & USER ROLES TABLE
CREATE TYPE public.app_role AS ENUM ('admin', 'customer');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'customer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
  ON public.user_roles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 2. PROFILES TABLE
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  loyalty_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all profiles"
  ON public.profiles FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- 3. NEW PARTS ORDERS
CREATE TYPE public.order_status AS ENUM ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled');

CREATE TABLE public.new_part_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT,
  year INTEGER,
  engine TEXT,
  part_name TEXT NOT NULL,
  oem_number TEXT,
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price NUMERIC(10,2),
  discount_amount NUMERIC(10,2) DEFAULT 0,
  total_price NUMERIC(10,2),
  status order_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.new_part_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own orders"
  ON public.new_part_orders FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create orders"
  ON public.new_part_orders FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all orders"
  ON public.new_part_orders FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update orders"
  ON public.new_part_orders FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 4. USED PARTS REQUESTS
CREATE TYPE public.request_status AS ENUM ('pending', 'quoted', 'accepted', 'rejected', 'fulfilled');

CREATE TABLE public.used_part_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  model TEXT,
  year TEXT,
  part_name TEXT NOT NULL,
  note TEXT,
  admin_price NUMERIC(10,2),
  admin_available BOOLEAN,
  admin_note TEXT,
  status request_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.used_part_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own requests"
  ON public.used_part_requests FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create requests"
  ON public.used_part_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own quoted requests"
  ON public.used_part_requests FOR UPDATE
  USING (auth.uid() = user_id AND status = 'quoted');

CREATE POLICY "Admins can view all requests"
  ON public.used_part_requests FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update requests"
  ON public.used_part_requests FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 5. SERVICE BOOKINGS
CREATE TYPE public.booking_status AS ENUM ('pending', 'confirmed', 'in_progress', 'completed', 'cancelled');

CREATE TABLE public.service_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  vehicle_brand TEXT,
  vehicle_model TEXT,
  service_type TEXT NOT NULL,
  preferred_date DATE NOT NULL,
  confirmed_date DATE,
  note TEXT,
  wants_replacement_vehicle BOOLEAN NOT NULL DEFAULT false,
  replacement_vehicle_confirmed BOOLEAN DEFAULT false,
  estimated_price NUMERIC(10,2),
  discount_amount NUMERIC(10,2) DEFAULT 0,
  final_price NUMERIC(10,2),
  admin_note TEXT,
  status booking_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.service_bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bookings"
  ON public.service_bookings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create bookings"
  ON public.service_bookings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own pending bookings"
  ON public.service_bookings FOR UPDATE
  USING (auth.uid() = user_id AND status IN ('pending', 'confirmed'));

CREATE POLICY "Admins can view all bookings"
  ON public.service_bookings FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update bookings"
  ON public.service_bookings FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 6. VEHICLES FOR SALE
CREATE TABLE public.vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year INTEGER NOT NULL,
  price NUMERIC(10,2) NOT NULL,
  mileage INTEGER,
  fuel TEXT,
  power TEXT,
  engine TEXT,
  transmission TEXT,
  color TEXT,
  vin TEXT,
  condition TEXT,
  description TEXT,
  images TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active vehicles"
  ON public.vehicles FOR SELECT
  USING (is_active = true);

CREATE POLICY "Admins can manage vehicles"
  ON public.vehicles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- 7. VEHICLE INQUIRIES
CREATE TABLE public.vehicle_inquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  phone TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.vehicle_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own inquiries"
  ON public.vehicle_inquiries FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can create inquiries"
  ON public.vehicle_inquiries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Admins can view all inquiries"
  ON public.vehicle_inquiries FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update inquiries"
  ON public.vehicle_inquiries FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin'));

-- 8. TIMESTAMP TRIGGER
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_new_part_orders_updated_at BEFORE UPDATE ON public.new_part_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_used_part_requests_updated_at BEFORE UPDATE ON public.used_part_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_service_bookings_updated_at BEFORE UPDATE ON public.service_bookings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_vehicles_updated_at BEFORE UPDATE ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 9. AUTO-CREATE PROFILE + CUSTOMER ROLE ON SIGNUP
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, email, full_name, loyalty_active)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    true
  );
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'customer');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
