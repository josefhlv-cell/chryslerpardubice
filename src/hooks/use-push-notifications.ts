/**
 * Push notifikace přes Capacitor + fallback na web Notification API.
 * Ukládá token do public.user_push_tokens.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Platform = "ios" | "android" | "web";

type PushStatus =
  | "unknown"
  | "granted"
  | "denied"
  | "unsupported";

function detectPlatform(): Platform {
  const cap = (window as any).Capacitor;

  if (cap?.getPlatform) {
    const p = cap.getPlatform();
    if (p === "ios" || p === "android") return p;
  }

  return "web";
}

export function usePushNotifications() {
  const [status, setStatus] = useState<PushStatus>("unknown");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const listenersReadyRef = useRef(false);

  const saveToken = useCallback(async (tok: string, platform: Platform) => {
    const { data, error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error("[PUSH] auth getUser error", userError);
      throw userError;
    }

    const uid = data.user?.id;

    if (!uid) {
      console.warn("[PUSH] user missing, token not saved");
      return;
    }

    const { error: upsertError } = await supabase
      .from("user_push_tokens" as any)
      .upsert(
        {
          user_id: uid,
          token: tok,
          platform,
          enabled: true,
          last_seen_at: new Date().toISOString(),
        } as any,
        { onConflict: "user_id,token" },
      );

    if (upsertError) {
      console.error("[PUSH] token save error", upsertError);
      throw upsertError;
    }

    console.log("[PUSH] token saved", { platform });
  }, []);

  const request = useCallback(async () => {
    setError(null);

    const platform = detectPlatform();

    console.log("[PUSH] request start", { platform });

    if (platform === "web") {
      if (!("Notification" in window)) {
        setStatus("unsupported");
        setError("Tento prohlížeč nepodporuje notifikace.");
        return;
      }

      const perm = await Notification.requestPermission();
      setStatus(perm === "granted" ? "granted" : "denied");

      if (perm !== "granted") {
        setError("Oznámení nebyla povolena.");
      }

      return;
    }

    try {
      const mod = await import("@capacitor/push-notifications").catch((e) => {
        console.error("[PUSH] import module error", e);
        return null;
      });

      if (!mod) {
        setError("Push modul není v tomto buildu dostupný.");
        setStatus("unsupported");
        return;
      }

      const { PushNotifications } = mod as any;

      if (!PushNotifications) {
        setError("PushNotifications API není dostupné.");
        setStatus("unsupported");
        return;
      }

      /**
       * DŮLEŽITÉ:
       * Listenery musí být registrované PŘED PushNotifications.register().
       * Na iOS může registrace proběhnout rychle a token by jinak mohl utéct.
       */
      if (!listenersReadyRef.current) {
        await PushNotifications.addListener("registration", async (t: any) => {
          try {
            const value = String(t?.value || "");

            console.log("[PUSH] registration token received", {
              platform,
              hasToken: !!value,
              length: value.length,
            });

            if (!value) {
              setError("APNs token je prázdný.");
              return;
            }

            setToken(value);
            await saveToken(value, platform);
            setStatus("granted");
            setError(null);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.error("[PUSH] registration save error", e);
            setError(message);
          }
        });

        await PushNotifications.addListener("registrationError", (e: any) => {
          const message = String(e?.error || e?.message || e || "Neznámá chyba APNs registrace.");
          console.error("[PUSH] registrationError", e);
          setError(message);
          setStatus("unsupported");
        });

        await PushNotifications.addListener("pushNotificationReceived", (notification: any) => {
          console.log("[PUSH] received", notification);
        });

        await PushNotifications.addListener("pushNotificationActionPerformed", (action: any) => {
          console.log("[PUSH] action performed", action);
        });

        listenersReadyRef.current = true;
      }

      const currentPerm = await PushNotifications.checkPermissions();
      console.log("[PUSH] current permissions", currentPerm);

      let receive = currentPerm?.receive;

      if (receive !== "granted") {
        const requestedPerm = await PushNotifications.requestPermissions();
        console.log("[PUSH] requested permissions", requestedPerm);
        receive = requestedPerm?.receive;
      }

      if (receive !== "granted") {
        setStatus("denied");
        setError("Oznámení nebyla povolena v iOS.");
        return;
      }

      setStatus("granted");

      console.log("[PUSH] calling register()");
      await PushNotifications.register();
      console.log("[PUSH] register() called");
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error("[PUSH] request failed", e);
      setError(message);
      setStatus("unsupported");
    }
  }, [saveToken]);

  useEffect(() => {
    const platform = detectPlatform();

    if (platform === "web" && "Notification" in window) {
      const permission = Notification.permission;

      if (permission === "granted") {
        setStatus("granted");
      } else if (permission === "denied") {
        setStatus("denied");
      } else {
        setStatus("unknown");
      }
    }
  }, []);

  return {
    status,
    token,
    error,
    request,
  };
}