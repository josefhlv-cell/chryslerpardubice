/**
 * Service Bookings API Layer
 * Handles service booking creation and admin notification.
 * Includes input validation, structured logging, and error handling.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  withErrorHandling,
  requireUUID,
  requireString,
  logger,
} from "./errors";

const MODULE = "ServiceBookings";

export interface ServiceBookingInput {
  user_id: string;
  service_type: string;
  vehicle_brand?: string | null;
  vehicle_model?: string | null;
  preferred_date: string;
  note?: string | null;
  wants_replacement_vehicle: boolean;
}

export const createServiceBooking = async (booking: ServiceBookingInput) => {
  requireUUID(booking.user_id, "user_id");
  requireString(booking.service_type, "service_type");
  requireString(booking.preferred_date, "preferred_date");

  logger.info(MODULE, "createServiceBooking", {
    userId: booking.user_id,
    serviceType: booking.service_type,
    date: booking.preferred_date,
  });

  return withErrorHandling(MODULE, "createServiceBooking", async () => {
    const { data, error } = await supabase
      .from("service_bookings")
      .insert(booking)
      .select()
      .single();
    if (error) throw error;
    return data;
  }, { userId: booking.user_id });
};

export const notifyAdminServiceBooking = async (record: {
  title: string;
  message: string;
}) => {
  // Fire-and-forget notification with retry
  import("@/lib/retry").then(({ withRetry, isTransientError }) => {
    withRetry(
      () => supabase.functions.invoke("notify-admin", {
        body: { type: "service_booking", record },
      }).then(({ error }) => { if (error) throw error; }),
      { maxAttempts: 3, module: MODULE, action: "notifyAdminServiceBooking", retryIf: isTransientError }
    ).catch((err) => {
      logger.warn(MODULE, "notifyAdminServiceBooking", "Notifikace admina selhala po retries", { error: String(err) });
    });
  });
};

export const fetchMyBookings = async (userId: string) => {
  requireUUID(userId, "userId");
  return withErrorHandling(MODULE, "fetchMyBookings", async () => {
    const { data, error } = await supabase
      .from("service_bookings")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return data || [];
  }, { userId });
};
