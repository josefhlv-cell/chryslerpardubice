/**
 * Push notifikace přes Capacitor + fallback na web Notification API.
 * Ukládá token do public.user_push_tokens.
 */
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Platform = "ios" | "android" | "web";

function detectPlatform(): Platform {
  const cap = (window as any).Capacitor;
  if (cap?.getPlatform) {
    const p = cap.getPlatform();
    if (p === "ios" || p === "android") return p;
  }
  return "web";
}

export function usePushNotifications() {
  const [status, setStatus] = useState<"unknown" | "granted" | "denied" | "unsupported">("unknown");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saveToken = useCallback(async (tok: string, platform: Platform) => {
    const { data } = await supabase.auth.getUser();
    const uid = data.user?.id;
    if (!uid) return;
    await supabase.from("user_push_tokens" as any).upsert(
      {
        user_id: uid,
        token: tok,
        platform,
        enabled: true,
        last_seen_at: new Date().toISOString(),
      } as any,
      { onConflict: "user_id,token" },
    );
  }, []);

  const request = useCallback(async () => {
    setError(null);
    const platform = detectPlatform();

    if (platform === "web") {
      if (!("Notification" in window)) {
        setStatus("unsupported");
        return;
      }
      const perm = await Notification.requestPermission();
      setStatus(perm === "granted" ? "granted" : "denied");
      return;
    }

    try {
      // @ts-ignore optional native module — installed at native build time
      const mod = await import(/* @vite-ignore */ "@capacitor/push-notifications").catch(() => null);
      if (!mod) {
        setError("Push modul není v tomto buildu dostupný.");
        setStatus("unsupported");
        return;
      }
      const { PushNotifications } = mod as any;
      const perm = await PushNotifications.requestPermissions();
      if (perm.receive !== "granted") {
        setStatus("denied");
        return;
      }
      setStatus("granted");
      await PushNotifications.register();
      PushNotifications.addListener("registration", async (t: any) => {
        setToken(t.value);
        await saveToken(t.value, platform);
      });
      PushNotifications.addListener("registrationError", (e: any) => {
        setError(String(e?.error || e));
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("unsupported");
    }
  }, [saveToken]);

  useEffect(() => {
    if (detectPlatform() === "web" && "Notification" in window) {
      setStatus(Notification.permission as any);
    }
  }, []);

  return { status, token, error, request };
}
