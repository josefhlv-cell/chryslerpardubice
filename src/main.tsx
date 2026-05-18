import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Unregister service workers in preview/iframe to prevent 401 manifest issues
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
  navigator.serviceWorker?.getRegistrations().then((registrations) => {
    registrations.forEach((r) => r.unregister());
  });
}

// Initialize native (iOS/Android) integrations — no-op on web
import("./lib/native").then((m) => m.initNative()).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
