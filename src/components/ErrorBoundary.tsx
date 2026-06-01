import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

// Stale chunk after a new deploy: dynamic import fails with ChunkLoadError or
// "Failed to fetch dynamically imported module". Auto-reload once to grab the
// new manifest; persist a flag so we don't loop if the error is real.
function isChunkLoadError(err: unknown): boolean {
  if (!err) return false;
  const msg = (err as Error)?.message || String(err);
  const name = (err as Error)?.name || "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  );
}

function tryRecoverFromChunkError(err: unknown): boolean {
  if (!isChunkLoadError(err)) return false;
  try {
    const key = "__chunk_reload_at";
    const last = Number(sessionStorage.getItem(key) || "0");
    const now = Date.now();
    // Only auto-reload once per 30s window to avoid infinite loops
    if (now - last > 30_000) {
      sessionStorage.setItem(key, String(now));
      // Drop SW caches if any survived
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))).catch(() => {});
      }
      window.location.reload();
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

// Install global listeners ASAP (module side-effect on first import).
if (typeof window !== "undefined") {
  window.addEventListener("error", (e) => {
    if (tryRecoverFromChunkError(e.error || e.message)) e.preventDefault();
  });
  window.addEventListener("unhandledrejection", (e) => {
    if (tryRecoverFromChunkError(e.reason)) e.preventDefault();
  });
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    tryRecoverFromChunkError(error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      const isChunk = isChunkLoadError(this.state.error);

      return (
        <div className="flex flex-col items-center justify-center min-h-[50vh] p-6 text-center gap-4">
          <AlertTriangle className="w-12 h-12 text-destructive" />
          <h2 className="text-lg font-display font-semibold">
            {isChunk ? "Načítám novou verzi…" : "Něco se pokazilo"}
          </h2>
          <p className="text-sm text-muted-foreground max-w-md">
            {isChunk
              ? "Byla nasazena nová verze aplikace. Stránka se za okamžik obnoví."
              : "Došlo k neočekávané chybě. Zkuste obnovit stránku."}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Zkusit znovu
            </Button>
            <Button onClick={() => window.location.reload()}>
              Obnovit stránku
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
