/**
 * Service Orders API Layer
 * Handles service orders CRUD for both customer and admin views.
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

const MODULE = "ServiceOrders";

// ---- Customer ----

export const fetchUserServiceOrders = async (userId: string) => {
  requireUUID(userId, "userId");
  return withErrorHandling(MODULE, "fetchUserServiceOrders", async () => {
    const { data, error } = await supabase
      .from("service_orders")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }, { userId });
};

export const fetchUserReviews = async (userId: string) => {
  requireUUID(userId, "userId");
  return withErrorHandling(MODULE, "fetchUserReviews", async () => {
    const { data, error } = await supabase
      .from("service_reviews" as any)
      .select("*")
      .eq("user_id", userId);
    if (error) throw error;
    return (data as any[]) || [];
  }, { userId });
};

export const createServiceReview = async (review: {
  service_order_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
}) => {
  requireUUID(review.service_order_id, "service_order_id");
  requireUUID(review.user_id, "user_id");
  if (typeof review.rating !== "number" || review.rating < 1 || review.rating > 5) {
    throw new ValidationError("Hodnocení musí být číslo od 1 do 5.", { rating: review.rating });
  }

  logger.info(MODULE, "createServiceReview", { orderId: review.service_order_id, rating: review.rating });

  return withErrorHandling(MODULE, "createServiceReview", async () => {
    const { data, error } = await supabase
      .from("service_reviews" as any)
      .insert(review as any)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, { orderId: review.service_order_id });
};

export const subscribeToServiceOrders = (
  userId: string,
  onUpdate: () => void
) => {
  const channel = supabase
    .channel("my-service-orders")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "service_orders",
        filter: `user_id=eq.${userId}`,
      },
      () => onUpdate()
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};

// ---- Admin-specific ----

export const fetchAllServiceOrders = async () => {
  return withErrorHandling(MODULE, "fetchAllServiceOrders", async () => {
    const { data, error } = await supabase
      .from("service_orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  });
};

export const updateServiceOrderStatus = async (orderId: string, status: string) => {
  requireUUID(orderId, "orderId");
  requireString(status, "status");

  const validStatuses = [
    "received", "diagnostics", "waiting_approval", "waiting_parts",
    "in_repair", "testing", "ready_pickup", "completed",
  ];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Neplatný stav zakázky: "${status}".`, { status, validStatuses });
  }

  logger.info(MODULE, "updateServiceOrderStatus", { orderId, status });

  return withErrorHandling(MODULE, "updateServiceOrderStatus", async () => {
    const { error } = await supabase
      .from("service_orders")
      .update({ status } as any)
      .eq("id", orderId);
    if (error) throw error;
  }, { orderId, status });
};

export const createServiceOrder = async (order: {
  user_id: string;
  vehicle_id?: string | null;
  description?: string | null;
  mileage?: number | null;
}) => {
  requireUUID(order.user_id, "user_id");
  if (order.vehicle_id) requireUUID(order.vehicle_id, "vehicle_id");
  if (order.mileage !== undefined && order.mileage !== null) {
    optionalPositiveNumber(order.mileage, "mileage");
  }

  logger.info(MODULE, "createServiceOrder", {
    userId: order.user_id,
    vehicleId: order.vehicle_id ?? "none",
  });

  return withErrorHandling(MODULE, "createServiceOrder", async () => {
    const { data, error } = await supabase
      .from("service_orders")
      .insert(order)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, { userId: order.user_id });
};

export const addStatusHistory = async (entry: {
  service_order_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  note?: string | null;
}) => {
  requireUUID(entry.service_order_id, "service_order_id");
  requireString(entry.new_status, "new_status");

  logger.info(MODULE, "addStatusHistory", {
    orderId: entry.service_order_id,
    from: entry.old_status,
    to: entry.new_status,
  });

  return withErrorHandling(MODULE, "addStatusHistory", async () => {
    const { error } = await supabase
      .from("service_order_status_history")
      .insert(entry);
    if (error) throw error;
  }, { orderId: entry.service_order_id });
};
