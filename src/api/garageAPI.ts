/**
 * Garage API Layer
 * Handles user vehicles and active service orders for the garage view.
 * Includes input validation, structured logging, and error handling.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  withErrorHandling,
  requireUUID,
  requireString,
  optionalPositiveNumber,
  ValidationError,
  logger,
} from "./errors";

const MODULE = "Garage";

export const fetchUserVehicles = async (userId: string) => {
  requireUUID(userId, "userId");
  return withErrorHandling(MODULE, "fetchUserVehicles", async () => {
    const { data, error } = await supabase
      .from("user_vehicles")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: true });
    if (error) throw error;
    return data || [];
  }, { userId });
};

export const fetchActiveServiceOrder = async (userId: string) => {
  requireUUID(userId, "userId");
  return withErrorHandling(MODULE, "fetchActiveServiceOrder", async () => {
    const { data, error } = await supabase
      .from("service_orders")
      .select("*")
      .eq("user_id", userId)
      .neq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1);
    if (error) throw error;
    return data?.[0] || null;
  }, { userId });
};

export const deleteUserVehicle = async (vehicleId: string) => {
  requireUUID(vehicleId, "vehicleId");
  logger.info(MODULE, "deleteUserVehicle", { vehicleId });

  return withErrorHandling(MODULE, "deleteUserVehicle", async () => {
    const { error } = await supabase
      .from("user_vehicles")
      .delete()
      .eq("id", vehicleId);
    if (error) throw error;
  }, { vehicleId });
};

export const updateVehicleMileage = async (vehicleId: string, mileage: number) => {
  requireUUID(vehicleId, "vehicleId");
  if (typeof mileage !== "number" || mileage < 0 || mileage > 9_999_999) {
    throw new ValidationError("Stav km musí být kladné číslo do 9 999 999.", { mileage });
  }

  logger.info(MODULE, "updateVehicleMileage", { vehicleId, mileage });

  return withErrorHandling(MODULE, "updateVehicleMileage", async () => {
    const { error } = await supabase
      .from("user_vehicles")
      .update({ current_mileage: mileage })
      .eq("id", vehicleId);
    if (error) throw error;
  }, { vehicleId });
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
  requireUUID(vehicle.user_id, "user_id");
  requireString(vehicle.brand, "brand");
  requireString(vehicle.model, "model");

  if (vehicle.year !== undefined) {
    if (typeof vehicle.year !== "number" || vehicle.year < 1900 || vehicle.year > new Date().getFullYear() + 2) {
      throw new ValidationError("Rok výroby musí být platný.", { year: vehicle.year });
    }
  }
  if (vehicle.current_mileage !== undefined) {
    optionalPositiveNumber(vehicle.current_mileage, "current_mileage");
  }

  logger.info(MODULE, "addUserVehicle", {
    userId: vehicle.user_id,
    brand: vehicle.brand,
    model: vehicle.model,
  });

  return withErrorHandling(MODULE, "addUserVehicle", async () => {
    const { data, error } = await supabase
      .from("user_vehicles")
      .insert(vehicle)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, { userId: vehicle.user_id });
};

export const addMileageRecord = async (record: {
  vehicle_id: string;
  user_id: string;
  mileage: number;
  source?: string;
}) => {
  requireUUID(record.vehicle_id, "vehicle_id");
  requireUUID(record.user_id, "user_id");
  if (typeof record.mileage !== "number" || record.mileage < 0) {
    throw new ValidationError("Stav km musí být kladné číslo.", { mileage: record.mileage });
  }

  return withErrorHandling(MODULE, "addMileageRecord", async () => {
    const { error } = await supabase
      .from("mileage_history")
      .insert(record);
    if (error) throw error;
  }, { vehicleId: record.vehicle_id });
};
