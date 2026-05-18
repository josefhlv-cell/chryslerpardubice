/**
 * Native initialization for iOS/Android (Capacitor).
 * Safe no-op on web — guarded by Capacitor.isNativePlatform().
 */
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export async function initNative() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    const { App } = await import("@capacitor/app");

    // Status bar — dark navy theme
    try {
      await StatusBar.setStyle({ style: Style.Dark });
      if (Capacitor.getPlatform() === "android") {
        await StatusBar.setBackgroundColor({ color: "#0d1117" });
      }
    } catch (e) {
      console.warn("[native] StatusBar setup failed", e);
    }

    // Hide splash once app is ready
    setTimeout(() => {
      SplashScreen.hide().catch(() => {});
    }, 800);

    // Android back button → router-friendly behavior
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch (e) {
    console.warn("[native] init failed", e);
  }

  // Push notifications (don't block on errors)
  initPushNotifications().catch((e) =>
    console.warn("[native] push init failed", e)
  );
}

async function initPushNotifications() {
  if (!Capacitor.isNativePlatform()) return;

  const { PushNotifications } = await import("@capacitor/push-notifications");
  const { Device } = await import("@capacitor/device");

  // Request permission (Android 13+ requires runtime permission)
  const perm = await PushNotifications.requestPermissions();
  if (perm.receive !== "granted") {
    console.info("[push] permission not granted");
    return;
  }

  await PushNotifications.register();

  PushNotifications.addListener("registration", async (token) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const info = await Device.getInfo();
      const id = await Device.getId();
      await supabase.from("device_tokens").upsert(
        {
          user_id: user.id,
          token: token.value,
          platform: Capacitor.getPlatform(),
          device_id: id.identifier,
          model: info.model,
          os_version: info.osVersion,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "token" }
      );
    } catch (e) {
      console.warn("[push] token store failed", e);
    }
  });

  PushNotifications.addListener("registrationError", (err) => {
    console.warn("[push] registration error", err);
  });

  PushNotifications.addListener(
    "pushNotificationActionPerformed",
    (action) => {
      const link = (action.notification.data?.link as string) || undefined;
      if (link) {
        try {
          window.location.assign(link);
        } catch {}
      }
    }
  );
}
