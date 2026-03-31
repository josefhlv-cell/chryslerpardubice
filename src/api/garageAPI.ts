/**
 * Garage API Layer
 * Handles user vehicles and active service orders for the garage view.
 */

import { supabase } from "@/integrations/supabase/client";

export const fetchUserVehicles = async (userId: string) => {
  const { data, error } = await supabase
    .from("user_vehicles")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
};

export const fetchActiveServiceOrder = async (userId: string) => {
  const { data, error } = await supabase
    .from("service_orders")
    .select("*")
    .eq("user_id", userId)
    .neq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
};

export const deleteUserVehicle = async (vehicleId: string) => {
  const { error } = await supabase
    .from("user_vehicles")
    .delete()
    .eq("id", vehicleId);
  if (error) throw error;
};

export const updateVehicleMileage = async (vehicleId: string, mileage: number) => {
  const { error } = await supabase
    .from("user_vehicles")
    .update({ current_mileage: mileage })
    .eq("id", vehicleId);
  if (error) throw error;
};

export const addUserVehicle = async (vehicle: {
  user_id: string;
  brand: string;
  model: string;
  year?: number;
  engine?: string;
  vin?: string;
  license_plate?: string;
  current_mileage?: number;
}) => {
  const { data, error } = await supabase
    .from("user_vehicles")
    .insert(vehicle)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const addMileageRecord = async (record: {
  vehicle_id: string;
  user_id: string;
  mileage: number;
  source?: string;
}) => {
  const { error } = await supabase
    .from("mileage_history")
    .insert(record);
  if (error) throw error;
};
