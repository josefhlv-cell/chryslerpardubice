import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Capacitor } from "@capacitor/core";

/**
 * Naslouchá native push-tap (Capacitor) a otevře v aplikaci deep-link,
 * který posíláme v `data.link` z edge funkce send-push.
 * Také zpracuje případný cold-start payload uložený v query stringu.
 */
const PushDeepLink = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cleanup: (() => void) | undefined;

    const openLink = (raw: unknown) => {
      const link = typeof raw === "string" ? raw : "";
      if (!link) return;
      try {
        if (/^https?:\/\//i.test(link)) {
          const u = new URL(link);
          if (u.origin === window.location.origin) {
            navigate(u.pathname + u.search + u.hash);
          } else {
            window.location.href = link;
          }
        } else {
          navigate(link.startsWith("/") ? link : `/${link}`);
        }
      } catch {
        /* ignore */
      }
    };

    if (Capacitor.isNativePlatform()) {
      (async () => {
        try {
          const { PushNotifications } = await import("@capacitor/push-notifications");
          const l1 = await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
            const data: any = action?.notification?.data || {};
            openLink(data.link || data.url);
          });
          const l2 = await PushNotifications.addListener("pushNotificationReceived", (notif) => {
            // foreground push – nedělej auto-navigate, uživatel klikne
            void notif;
          });
          cleanup = () => { l1.remove(); l2.remove(); };
        } catch {
          /* plugin missing – ok */
        }
      })();
    }

    return () => { cleanup?.(); };
  }, [navigate]);

  return null;
};

export default PushDeepLink;
