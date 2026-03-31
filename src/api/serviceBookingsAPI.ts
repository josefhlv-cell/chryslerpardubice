/**
 * Service Bookings API Layer
 * Handles service booking creation and admin notification.
 */

import { supabase } from "@/integrations/supabase/client";

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
  const { data, error } = await supabase
    .from("service_bookings")
    .insert(booking)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const notifyAdminServiceBooking = async (record: {
  title: string;
  message: string;
}) => {
  // Fire-and-forget notification
  supabase.functions
    .invoke("notify-admin", {
      body: { type: "service_booking", record },
    })
    .catch(() => {});
};

export const fetchMyBookings = async (userId: string) => {
  const { data, error } = await supabase
    .from("service_bookings")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};
