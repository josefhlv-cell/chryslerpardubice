/**
 * Povolení polohy – Capacitor Geolocation + web fallback.
 * Ukládá stav do profiles.location_permission.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type LocState = "unknown" | "granted" | "denied" | "asked" | "unsupported";

export function useLocationPermission() {
  const [status, setStatus] = useState<LocState>("unknown");
  const [error, setError] = useState<string | null>(null);

  const persist = useCallback(async (next: LocState) => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    await supabase
      .from("profiles")
      .update({
        location_permission: next,
        location_asked_at: new Date().toISOString(),
      } as any)
      .eq("user_id", uid);
  }, []);

  const request = useCallback(async () => {
    setError(null);
    try {
      const cap = (window as any).Capacitor;
      if (cap?.isNativePlatform?.()) {
        // @ts-ignore optional native module — installed at native build time
        const mod = await import(/* @vite-ignore */ "@capacitor/geolocation").catch(() => null);
        if (!mod) {
          setStatus("unsupported");
          return;
        }
        const { Geolocation } = mod as any;
        const perm = await Geolocation.requestPermissions();
        const next: LocState = perm.location === "granted" ? "granted" : "denied";
        setStatus(next);
        await persist(next);
        return;
      }

      if (!("geolocation" in navigator)) {
        setStatus("unsupported");
        return;
      }
      await new Promise<void>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          async () => {
            setStatus("granted");
            await persist("granted");
            resolve();
          },
          async () => {
            setStatus("denied");
            await persist("denied");
            resolve();
          },
          { timeout: 8000 },
        );
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [persist]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: p } = await supabase
        .from("profiles")
        .select("location_permission")
        .eq("user_id", uid)
        .maybeSingle();
      const v = (p as any)?.location_permission as LocState | undefined;
      if (v) setStatus(v);
    })();
  }, []);

  return { status, error, request };
}
