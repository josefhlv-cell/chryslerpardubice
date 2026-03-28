import { supabase } from "@/integrations/supabase/client";

// ---- Vehicles ----
export const fetchVehicles = async (filters?: { brand?: string; search?: string }) => {
  let query = supabase.from("vehicles").select("id, brand, model, year, price, mileage, fuel, transmission, engine, power, color, condition, description, images, listing_url, is_active, created_at, updated_at").eq("is_active", true).order("created_at", { ascending: false });
  if (filters?.brand && filters.brand !== "all") {
    query = query.eq("brand", filters.brand);
  }
  if (filters?.search) {
    query = query.or(`brand.ilike.%${filters.search}%,model.ilike.%${filters.search}%`);
  }
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

export const fetchVehicleById = async (id: string) => {
  const { data, error } = await supabase.from("vehicles").select("id, brand, model, year, price, mileage, fuel, transmission, engine, power, color, condition, description, images, listing_url, is_active, created_at, updated_at").eq("id", id).single();
  if (error) throw error;
  return data;
};

// ---- Vehicle Inquiries ----
export const createVehicleInquiry = async (inquiry: {
  vehicle_id: string;
  user_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
}) => {
  const { data, error } = await supabase.from("vehicle_inquiries").insert(inquiry).select().single();
  if (error) throw error;
  return data;
};

// ---- New Part Orders ----
export const createNewPartOrder = async (order: {
  user_id: string;
  brand: string;
  model?: string;
  year?: number;
  engine?: string;
  part_name: string;
  oem_number?: string;
  unit_price?: number;
  discount_amount?: number;
  total_price?: number;
}) => {
  const { data, error } = await supabase.from("new_part_orders").insert(order).select().single();
  if (error) throw error;
  return data;
};

export const fetchMyOrders = async (userId: string) => {
  const { data, error } = await supabase
    .from("new_part_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
};

// ---- Used Part Requests ----
export const createUsedPartRequest = async (request: {
  user_id: string;
  brand: string;
  model?: string;
  year?: string;
  part_name: string;
  note?: string;
}) => {
  const { data, error } = await supabase.from("used_part_requests").insert(request).select().single();
  if (error) throw error;
  return data;
};

export const fetchMyUsedPartRequests = async (userId: string) => {
  const { data, error } = await supabase
    .from("used_part_requests")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
};

// ---- Service Bookings ----
export const createServiceBooking = async (booking: {
  user_id: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  service_type: string;
  preferred_date: string;
  note?: string;
  wants_replacement_vehicle: boolean;
}) => {
  const { data, error } = await supabase.from("service_bookings").insert(booking).select().single();
  if (error) throw error;
  return data;
};

export const fetchMyBookings = async (userId: string) => {
  const { data, error } = await supabase
    .from("service_bookings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
};

// ---- Profile ----
export const fetchProfile = async (userId: string) => {
  const { data, error } = await supabase.from("profiles").select("*").eq("user_id", userId).single();
  if (error) throw error;
  return data;
};
