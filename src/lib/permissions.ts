/**
 * Permission Layer
 * Centralized permission checks for role-based access control.
 * 
 * Usage:
 *   import { isAdmin, canAccessOrder } from "@/lib/permissions";
 */

import { supabase } from "@/integrations/supabase/client";

export interface PermissionUser {
  id: string;
  isAdmin?: boolean;
}

/** Check if user has admin role (cached from AuthContext) */
export function isAdmin(user: PermissionUser | null): boolean {
  return !!user?.isAdmin;
}

/** Check if user has mechanic role via employees+mechanics tables */
export async function isMechanic(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from("employees")
    .select("id, active")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (!data) return false;

  const { data: mechanic } = await supabase
    .from("mechanics")
    .select("id")
    .eq("employee_id", data.id)
    .eq("active", true)
    .maybeSingle();
  return !!mechanic;
}

/** Check if user can access a specific service order */
export async function canAccessOrder(
  userId: string,
  orderId: string,
  userIsAdmin: boolean
): Promise<boolean> {
  if (userIsAdmin) return true;

  const { data } = await supabase
    .from("service_orders")
    .select("user_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!data) return false;
  if (data.user_id === userId) return true;

  // Check mechanic assignment
  const mechanicAccess = await isMechanic(userId);
  if (mechanicAccess) {
    const { data: assigned } = await supabase
      .from("service_orders")
      .select("id")
      .eq("id", orderId)
      .not("mechanic_id", "is", null)
      .maybeSingle();
    return !!assigned;
  }

  return false;
}

/** Check if user can manage vehicles (own or admin) */
export function canManageVehicle(userId: string, vehicleOwnerId: string, userIsAdmin: boolean): boolean {
  return userIsAdmin || userId === vehicleOwnerId;
}

/** Require admin role — throws if not admin */
export function requireAdmin(user: PermissionUser | null): void {
  if (!isAdmin(user)) {
    throw new Error("Nedostatečná oprávnění — vyžadována role administrátora.");
  }
}
