import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { setupServiceWorker } from "./lib/pwa/register-sw";

// Web production registers the PWA worker. Native Capacitor, preview and dev
// are guarded inside this single registration entry point.
setupServiceWorker();

// Initialize native (iOS/Android) integrations — no-op on web
import("./lib/native").then((m) => m.initNative()).catch(() => {});

createRoot(document.getElementById("root")!).render(<App />);
