/**
 * useObdPermissions — vrací mapu OBD oprávnění pro aktuálního uživatele.
 * Administrátoři mají všechna oprávnění vždy zapnutá.
 */

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ObdPermissions = {
  live_data: boolean;
  dtc_read: boolean;
  dtc_clear: boolean;
  can_bus: boolean;
  uds: boolean;
  coding: boolean;
  terminal: boolean;
  logging: boolean;
  reverse_engineering: boolean;
  discovery: boolean;
  ai_diagnostics: boolean;
  dev_mode: boolean;
  flash: boolean;
};

export const DEFAULT_OBD_PERMISSIONS: ObdPermissions = {
  live_data: true,
  dtc_read: true,
  dtc_clear: false,
  can_bus: false,
  uds: false,
  coding: false,
  terminal: false,
  logging: true,
  reverse_engineering: false,
  discovery: false,
  ai_diagnostics: true,
  dev_mode: false,
  flash: false,
};

export const FULL_OBD_PERMISSIONS: ObdPermissions = {
  live_data: true,
  dtc_read: true,
  dtc_clear: true,
  can_bus: true,
  uds: true,
  coding: true,
  terminal: true,
  logging: true,
  reverse_engineering: true,
  discovery: true,
  ai_diagnostics: true,
  dev_mode: true,
  flash: true,
};

export function useObdPermissions(): { permissions: ObdPermissions; isAdmin: boolean; loading: boolean } {
  const [permissions, setPermissions] = useState<ObdPermissions>(DEFAULT_OBD_PERMISSIONS);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) {
        if (!cancelled) { setLoading(false); }
        return;
      }

      const [{ data: adminCheck }, { data: perm }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: uid, _role: "admin" as any }),
        supabase.from("obd_permissions").select("*").eq("user_id", uid).maybeSingle(),
      ]);

      if (cancelled) return;
      const admin = !!adminCheck;
      setIsAdmin(admin);

      if (admin) {
        setPermissions(FULL_OBD_PERMISSIONS);
      } else if (perm) {
        setPermissions({
          live_data: perm.live_data ?? true,
          dtc_read: perm.dtc_read ?? true,
          dtc_clear: perm.dtc_clear ?? false,
          can_bus: perm.can_bus ?? false,
          uds: perm.uds ?? false,
          coding: perm.coding ?? false,
          terminal: perm.terminal ?? false,
          logging: perm.logging ?? true,
          reverse_engineering: perm.reverse_engineering ?? false,
          discovery: perm.discovery ?? false,
          ai_diagnostics: perm.ai_diagnostics ?? true,
          dev_mode: perm.dev_mode ?? false,
          flash: perm.flash ?? false,
        });
      }
      setLoading(false);
    };

    load();
    return () => { cancelled = true; };
  }, []);

  return { permissions, isAdmin, loading };
}
