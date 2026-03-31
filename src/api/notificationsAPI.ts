/**
 * Notifications API Layer
 * Handles fetching, creating and updating notifications.
 */

import { supabase } from "@/integrations/supabase/client";

export type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export const fetchNotifications = async (userId: string) => {
  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as Notification[]) || [];
};

export const markNotificationRead = async (notificationId: string) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("id", notificationId);
  if (error) throw error;
};

export const markAllNotificationsRead = async (userId: string) => {
  const { error } = await supabase
    .from("notifications")
    .update({ is_read: true })
    .eq("user_id", userId)
    .eq("is_read", false);
  if (error) throw error;
};

export const createNotifications = async (
  notifications: Array<{ user_id: string; title: string; message: string }>
) => {
  const { error } = await supabase
    .from("notifications")
    .insert(notifications);
  if (error) throw error;
};

export const subscribeToNotifications = (
  userId: string,
  onInsert: (notification: Notification) => void
) => {
  const channel = supabase
    .channel("user-notifications")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `user_id=eq.${userId}`,
      },
      (payload) => onInsert(payload.new as Notification)
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
};
