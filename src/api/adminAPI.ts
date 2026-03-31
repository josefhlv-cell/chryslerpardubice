/**
 * Admin API Layer
 * Handles admin-specific data operations: profiles, employees, vehicles, reviews.
 */

import { supabase } from "@/integrations/supabase/client";

// ---- Profiles ----

export const fetchAllProfiles = async () => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, user_id, full_name, email, company_name, account_type, status, discount_percent, phone, ico, dic")
    .order("full_name");
  if (error) throw error;
  return data || [];
};

export const updateProfileStatus = async (userId: string, status: string) => {
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("user_id", userId);
  if (error) throw error;
};

export const updateProfileDiscount = async (userId: string, discount_percent: number) => {
  const { error } = await supabase
    .from("profiles")
    .update({ discount_percent })
    .eq("user_id", userId);
  if (error) throw error;
};

export const updateProfileField = async (
  userId: string,
  field: string,
  value: any
) => {
  const { error } = await supabase
    .from("profiles")
    .update({ [field]: value })
    .eq("user_id", userId);
  if (error) throw error;
};

// ---- Employees ----

export const fetchEmployees = async () => {
  const { data, error } = await supabase
    .from("employees")
    .select("*")
    .order("created_at");
  if (error) throw error;
  return data || [];
};

export const createEmployee = async (employee: {
  name: string;
  email?: string | null;
  role: string;
}) => {
  const { data, error } = await supabase
    .from("employees")
    .insert(employee)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const updateEmployee = async (
  id: string,
  updates: Partial<{ name: string; email: string | null; role: string; active: boolean }>
) => {
  const { error } = await supabase
    .from("employees")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
};

// ---- Reviews ----

export const fetchAllReviews = async () => {
  const { data, error } = await supabase
    .from("service_reviews" as any)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as any[]) || [];
};

// ---- Vehicles (for sale) ----

export const fetchBuybackRequests = async () => {
  const { data, error } = await supabase
    .from("vehicle_buyback_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updateBuybackRequest = async (id: string, updates: Record<string, any>) => {
  const { error } = await supabase
    .from("vehicle_buyback_requests")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
};

export const fetchImportRequests = async () => {
  const { data, error } = await supabase
    .from("vehicle_import_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updateImportRequest = async (id: string, updates: Record<string, any>) => {
  const { error } = await supabase
    .from("vehicle_import_requests")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
};

// ---- Mechanics ----

export const fetchMechanics = async () => {
  const { data, error } = await supabase
    .from("mechanics")
    .select("*")
    .eq("active", true);
  if (error) throw error;
  return data || [];
};

// ---- Service Scheduler ----

export const fetchServiceLifts = async () => {
  const { data, error } = await supabase
    .from("service_lifts")
    .select("*");
  if (error) throw error;
  return data || [];
};

export const assignMechanicToOrder = async (orderId: string, mechanicId: string) => {
  const { error } = await supabase
    .from("service_orders")
    .update({ mechanic_id: mechanicId } as any)
    .eq("id", orderId);
  if (error) throw error;
};

export const assignLiftToOrder = async (orderId: string, liftId: string) => {
  await supabase
    .from("service_lifts")
    .update({ status: "occupied" } as any)
    .eq("id", liftId);
  const { error } = await supabase
    .from("service_orders")
    .update({ lift_id: liftId } as any)
    .eq("id", orderId);
  if (error) throw error;
};

// ---- Fault Reports ----

export const fetchFaultReports = async () => {
  const { data, error } = await supabase
    .from("fault_reports")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updateFaultReport = async (id: string, updates: Record<string, any>) => {
  const { error } = await supabase
    .from("fault_reports")
    .update(updates)
    .eq("id", id);
  if (error) throw error;
};

// ---- All vehicles (for admin) ----

export const fetchAllUserVehicles = async () => {
  const { data, error } = await supabase
    .from("user_vehicles")
    .select("id, brand, model, year, license_plate, user_id");
  if (error) throw error;
  return data || [];
};

// ---- Feature Flags ----

export const fetchFeatureFlags = async () => {
  const { data, error } = await supabase
    .from("feature_flags")
    .select("*")
    .order("feature_key");
  if (error) throw error;
  return data || [];
};

export const updateFeatureFlag = async (id: string, enabled: boolean) => {
  const { error } = await supabase
    .from("feature_flags")
    .update({ enabled })
    .eq("id", id);
  if (error) throw error;
};
