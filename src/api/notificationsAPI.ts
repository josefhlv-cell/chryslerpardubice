/**
 * Notifications API Layer
 * Handles fetching, creating and updating notifications.
 * Includes input validation, structured logging, and error handling.
 * Notifications are non-blocking — failures are logged but never crash the app.
 */

import { supabase } from "@/integrations/supabase/client";
import {
  withErrorHandling,
  requireUUID,
  requireString,
  ValidationError,
  logger,
} from "./errors";
import { withRetry, isTransientError } from "@/lib/retry";

const MODULE = "Notifications";

export type Notification = {
  id: string;
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
};

export const fetchNotifications = async (userId: string) => {
  requireUUID(userId, "userId");
  return withErrorHandling(MODULE, "fetchNotifications", async () => {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return (data as Notification[]) || [];
  }, { userId });
};

export const markNotificationRead = async (notificationId: string) => {
  requireUUID(notificationId, "notificationId");
  return withErrorHandling(MODULE, "markNotificationRead", async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", notificationId);
    if (error) throw error;
  }, { notificationId });
};

export const markAllNotificationsRead = async (userId: string) => {
  requireUUID(userId, "userId");
  logger.info(MODULE, "markAllNotificationsRead", { userId });

  return withErrorHandling(MODULE, "markAllNotificationsRead", async () => {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) throw error;
  }, { userId });
};

export const createNotifications = async (
  notifications: Array<{ user_id: string; title: string; message: string }>
) => {
  if (!Array.isArray(notifications) || notifications.length === 0) {
    throw new ValidationError("Notifikace musí být neprázdné pole.");
  }
  for (const n of notifications) {
    requireUUID(n.user_id, "user_id");
    requireString(n.title, "title");
    requireString(n.message, "message");
  }

  logger.info(MODULE, "createNotifications", { count: notifications.length });

  return withErrorHandling(MODULE, "createNotifications", async () => {
    const { error } = await supabase
      .from("notifications")
      .insert(notifications);
    if (error) throw error;
  });
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
