/**
 * Single, guarded service-worker registration point.
 *
 * Web / PWA  -> service worker registers normally (offline + caching kept).
 * Capacitor  -> NEVER registers (WKWebView + custom capacitor:// scheme breaks
 *               service workers and can leave the app on an error screen).
 * Preview/dev -> never registers, and actively unregisters stale workers.
 */

function isNativeCapacitor(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean; platform?: string } }).Capacitor;
  if (cap) {
    if (typeof cap.isNativePlatform === "function") {
      try {
        if (cap.isNativePlatform()) return true;
      } catch {
        /* ignore */
      }
    }
    if (cap.platform && cap.platform !== "web") return true;
  }
  // Capacitor serves the app from a custom scheme / localhost origin
  const proto = window.location.protocol;
  if (proto === "capacitor:" || proto === "ionic:") return true;
  return /\b(capacitor|cordova)\b/i.test(navigator.userAgent || "");
}

function isBlockedContext(): boolean {
  if (typeof window === "undefined") return true;
  if (!import.meta.env.PROD) return true;
  if (isNativeCapacitor()) return true;

  let inIframe = false;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (inIframe) return true;

  const h = window.location.hostname;
  if (
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h === "lovableproject.com" ||
    h.endsWith(".lovableproject.com") ||
    h === "lovableproject-dev.com" ||
    h.endsWith(".lovableproject-dev.com") ||
    h === "beta.lovable.dev" ||
    h.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }

  return new URLSearchParams(window.location.search).get("sw") === "off";
}

async function unregisterAppServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => (r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "").includes("/sw.js"))
        .map((r) => r.unregister()),
    );
  } catch {
    /* ignore */
  }
}

export function setupServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    // Native Capacitor / preview / dev: make sure no stale worker controls the page.
    void unregisterAppServiceWorkers();
    return;
  }

  import("virtual:pwa-register")
    .then(({ registerSW }) => registerSW({ immediate: true }))
    .catch(() => {
      /* ignore */
    });
}
