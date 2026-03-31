/**
 * Service Orders API Layer
 * Handles service orders CRUD for both customer and admin views.
 */

import { supabase } from "@/integrations/supabase/client";

export const fetchUserServiceOrders = async (userId: string) => {
  const { data, error } = await supabase
    .from("service_orders")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const fetchUserReviews = async (userId: string) => {
  const { data, error } = await supabase
    .from("service_reviews" as any)
    .select("*")
    .eq("user_id", userId);
  if (error) throw error;
  return (data as any[]) || [];
};

export const createServiceReview = async (review: {
  service_order_id: string;
  user_id: string;
  rating: number;
  comment: string | null;
}) => {
  const { data, error } = await supabase
    .from("service_reviews" as any)
    .insert(review as any)
    .select()
    .single();
  if (error) throw error;
  return data;
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
  const { data, error } = await supabase
    .from("service_orders")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
};

export const updateServiceOrderStatus = async (orderId: string, status: string) => {
  const { error } = await supabase
    .from("service_orders")
    .update({ status } as any)
    .eq("id", orderId);
  if (error) throw error;
};

export const createServiceOrder = async (order: {
  user_id: string;
  vehicle_id?: string | null;
  description?: string | null;
  mileage?: number | null;
}) => {
  const { data, error } = await supabase
    .from("service_orders")
    .insert(order)
    .select()
    .single();
  if (error) throw error;
  return data;
};

export const addStatusHistory = async (entry: {
  service_order_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  note?: string | null;
}) => {
  const { error } = await supabase
    .from("service_order_status_history")
    .insert(entry);
  if (error) throw error;
};
