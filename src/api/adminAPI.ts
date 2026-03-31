/**
 * Admin API Layer
 * Handles admin-specific data operations: profiles, employees, vehicles, reviews.
 * Includes input validation, structured logging, and error handling.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  withErrorHandling,
  requireUUID,
  requireString,
  ValidationError,
  logger,
} from "./errors";

const MODULE = "Admin";

// ---- Profiles ----

export const fetchAllProfiles = async () => {
  return withErrorHandling(MODULE, "fetchAllProfiles", async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, email, company_name, account_type, status, discount_percent, phone, ico, dic")
      .order("full_name");
    if (error) throw error;
    return data || [];
  });
};

export const updateProfileStatus = async (userId: string, status: string) => {
  requireUUID(userId, "userId");
  const validStatuses = ["active", "pending", "blocked"];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Neplatný stav profilu: "${status}".`, { status, validStatuses });
  }
  logger.info(MODULE, "updateProfileStatus", { userId, status });

  return withErrorHandling(MODULE, "updateProfileStatus", async () => {
    const { error } = await supabase
      .from("profiles")
      .update({ status })
      .eq("user_id", userId);
    if (error) throw error;
  }, { userId });
};

export const updateProfileDiscount = async (userId: string, discount_percent: number) => {
  requireUUID(userId, "userId");
  if (typeof discount_percent !== "number" || discount_percent < 0 || discount_percent > 100) {
    throw new ValidationError("Sleva musí být číslo 0–100.", { discount_percent });
  }
  logger.info(MODULE, "updateProfileDiscount", { userId, discount_percent });

  return withErrorHandling(MODULE, "updateProfileDiscount", async () => {
    const { error } = await supabase
      .from("profiles")
      .update({ discount_percent })
      .eq("user_id", userId);
    if (error) throw error;
  }, { userId });
};

export const updateProfileField = async (
  userId: string,
  field: string,
  value: any
) => {
  requireUUID(userId, "userId");
  requireString(field, "field");
  const allowedFields = ["full_name", "phone", "email", "company_name", "ico", "dic", "notifications_enabled", "service_history_enabled", "loyalty_active"];
  if (!allowedFields.includes(field)) {
    throw new ValidationError(`Pole "${field}" nelze upravit přes toto API.`, { field, allowedFields });
  }

  return withErrorHandling(MODULE, "updateProfileField", async () => {
    const { error } = await supabase
      .from("profiles")
      .update({ [field]: value })
      .eq("user_id", userId);
    if (error) throw error;
  }, { userId, field });
};

// ---- Employees ----

export const fetchEmployees = async () => {
  return withErrorHandling(MODULE, "fetchEmployees", async () => {
    const { data, error } = await supabase
      .from("employees")
      .select("*")
      .order("created_at");
    if (error) throw error;
    return data || [];
  });
};

export const createEmployee = async (employee: {
  name: string;
  email?: string | null;
  role: string;
}) => {
  requireString(employee.name, "name");
  requireString(employee.role, "role");
  logger.info(MODULE, "createEmployee", { name: employee.name, role: employee.role });

  return withErrorHandling(MODULE, "createEmployee", async () => {
    const { data, error } = await supabase
      .from("employees")
      .insert(employee)
      .select()
      .single();
    if (error) throw error;
    return data;
  });
};

export const updateEmployee = async (
  id: string,
  updates: Partial<{ name: string; email: string | null; role: string; active: boolean }>
) => {
  requireUUID(id, "id");
  logger.info(MODULE, "updateEmployee", { id, fields: Object.keys(updates) });

  return withErrorHandling(MODULE, "updateEmployee", async () => {
    const { error } = await supabase
      .from("employees")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
  }, { id });
};

// ---- Reviews ----

export const fetchAllReviews = async () => {
  return withErrorHandling(MODULE, "fetchAllReviews", async () => {
    const { data, error } = await supabase
      .from("service_reviews" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as any[]) || [];
  });
};

// ---- Vehicles (for sale) ----

export const fetchBuybackRequests = async () => {
  return withErrorHandling(MODULE, "fetchBuybackRequests", async () => {
    const { data, error } = await supabase
      .from("vehicle_buyback_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  });
};

export const updateBuybackRequest = async (id: string, updates: Record<string, any>) => {
  requireUUID(id, "id");
  logger.info(MODULE, "updateBuybackRequest", { id });

  return withErrorHandling(MODULE, "updateBuybackRequest", async () => {
    const { error } = await supabase
      .from("vehicle_buyback_requests")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
  }, { id });
};

export const fetchImportRequests = async () => {
  return withErrorHandling(MODULE, "fetchImportRequests", async () => {
    const { data, error } = await supabase
      .from("vehicle_import_requests")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  });
};

export const updateImportRequest = async (id: string, updates: Record<string, any>) => {
  requireUUID(id, "id");
  logger.info(MODULE, "updateImportRequest", { id });

  return withErrorHandling(MODULE, "updateImportRequest", async () => {
    const { error } = await supabase
      .from("vehicle_import_requests")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
  }, { id });
};

// ---- Mechanics ----

export const fetchMechanics = async () => {
  return withErrorHandling(MODULE, "fetchMechanics", async () => {
    const { data, error } = await supabase
      .from("mechanics")
      .select("*")
      .eq("active", true);
    if (error) throw error;
    return data || [];
  });
};

// ---- Service Scheduler ----

export const fetchServiceLifts = async () => {
  return withErrorHandling(MODULE, "fetchServiceLifts", async () => {
    const { data, error } = await supabase
      .from("service_lifts")
      .select("*");
    if (error) throw error;
    return data || [];
  });
};

export const assignMechanicToOrder = async (orderId: string, mechanicId: string) => {
  requireUUID(orderId, "orderId");
  requireUUID(mechanicId, "mechanicId");
  logger.info(MODULE, "assignMechanicToOrder", { orderId, mechanicId });

  return withErrorHandling(MODULE, "assignMechanicToOrder", async () => {
    const { error } = await supabase
      .from("service_orders")
      .update({ mechanic_id: mechanicId } as any)
      .eq("id", orderId);
    if (error) throw error;
  }, { orderId, mechanicId });
};

export const assignLiftToOrder = async (orderId: string, liftId: string) => {
  requireUUID(orderId, "orderId");
  requireUUID(liftId, "liftId");
  logger.info(MODULE, "assignLiftToOrder", { orderId, liftId });

  return withErrorHandling(MODULE, "assignLiftToOrder", async () => {
    await supabase
      .from("service_lifts")
      .update({ status: "occupied" } as any)
      .eq("id", liftId);
    const { error } = await supabase
      .from("service_orders")
      .update({ lift_id: liftId } as any)
      .eq("id", orderId);
    if (error) throw error;
  }, { orderId, liftId });
};

// ---- Fault Reports ----

export const fetchFaultReports = async () => {
  return withErrorHandling(MODULE, "fetchFaultReports", async () => {
    const { data, error } = await supabase
      .from("fault_reports")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  });
};

export const updateFaultReport = async (id: string, updates: Record<string, any>) => {
  requireUUID(id, "id");
  logger.info(MODULE, "updateFaultReport", { id });

  return withErrorHandling(MODULE, "updateFaultReport", async () => {
    const { error } = await supabase
      .from("fault_reports")
      .update(updates)
      .eq("id", id);
    if (error) throw error;
  }, { id });
};

// ---- All vehicles (for admin) ----

export const fetchAllUserVehicles = async () => {
  return withErrorHandling(MODULE, "fetchAllUserVehicles", async () => {
    const { data, error } = await supabase
      .from("user_vehicles")
      .select("id, brand, model, year, license_plate, user_id");
    if (error) throw error;
    return data || [];
  });
};

// ---- Feature Flags ----

export const fetchFeatureFlags = async () => {
  return withErrorHandling(MODULE, "fetchFeatureFlags", async () => {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("*")
      .order("feature_key");
    if (error) throw error;
    return data || [];
  });
};

export const updateFeatureFlag = async (id: string, enabled: boolean) => {
  requireUUID(id, "id");
  logger.info(MODULE, "updateFeatureFlag", { id, enabled });

  return withErrorHandling(MODULE, "updateFeatureFlag", async () => {
    const { error } = await supabase
      .from("feature_flags")
      .update({ enabled })
      .eq("id", id);
    if (error) throw error;
  }, { id });
};
