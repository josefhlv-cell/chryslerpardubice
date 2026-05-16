/**
 * Centralized Logger + Metrics
 * Provides structured, module-scoped logging and in-memory metrics tracking.
 * 
 * Usage:
 *   import { logger, metrics } from "@/lib/logger";
 *   logger.info("ModuleName", "ORDER_CREATED", { orderId: "..." });
 *   metrics.increment("orders_created");
 */

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  module: string;
  action: string;
  message?: string;
  data?: Record<string, unknown>;
  timestamp: string;
}

function formatPrefix(entry: Pick<LogEntry, "module" | "action" | "message">): string {
  const prefix = `[${entry.module}] ${entry.action}`;
  return entry.message ? `${prefix} — ${entry.message}` : prefix;
}

function safelog(fn: () => void): void {
  try {
    fn();
  } catch {
    // Fail-safe: logging must never crash the app
  }
}

export const logger = {
  info(module: string, action: string, data?: Record<string, unknown>) {
    safelog(() => console.log(formatPrefix({ module, action }), data ?? ""));
  },

  warn(module: string, action: string, message?: string, data?: Record<string, unknown>) {
    safelog(() => console.warn(formatPrefix({ module, action, message }), data ?? ""));
  },

  error(module: string, action: string, error: unknown, data?: Record<string, unknown>) {
    safelog(() => {
      const errMsg = error instanceof Error ? error.message : String(error);
      console.error(formatPrefix({ module, action, message: errMsg }), data ?? "");
    });
  },

  debug(module: string, action: string, data?: Record<string, unknown>) {
    safelog(() => {
      if (import.meta.env.DEV) {
        console.debug(formatPrefix({ module, action }), data ?? "");
      }
    });
  },

  /**
   * Structured security/business event log.
   * Emits a JSON-serializable entry for future integration with external systems.
   */
  event(
    module: string,
    event: string,
    data?: Record<string, unknown>,
    level: LogLevel = "info"
  ) {
    safelog(() => {
      const entry: LogEntry = {
        level,
        module,
        action: event,
        data,
        timestamp: new Date().toISOString(),
      };
      const fn = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
      fn(`[EVENT] ${event}`, JSON.stringify(entry));
    });
  },
};

// ── In-memory Metrics (client-side, per-session) ──

interface MetricEntry {
  count: number;
  last: number; // timestamp
}

const _metrics = new Map<string, MetricEntry>();
const _windows = new Map<string, number[]>(); // sliding window timestamps

export const metrics = {
  /** Increment a named counter */
  increment(key: string, amount = 1) {
    safelog(() => {
      const entry = _metrics.get(key) || { count: 0, last: 0 };
      entry.count += amount;
      entry.last = Date.now();
      _metrics.set(key, entry);

      // Sliding window for rate detection
      const window = _windows.get(key) || [];
      window.push(Date.now());
      // Keep last 5 minutes
      const cutoff = Date.now() - 5 * 60_000;
      _windows.set(key, window.filter((t) => t > cutoff));
    });
  },

  /** Get count for a metric */
  get(key: string): number {
    return _metrics.get(key)?.count ?? 0;
  },

  /** Get events per minute (last 5 min window) */
  ratePerMinute(key: string): number {
    const window = _windows.get(key);
    if (!window || window.length === 0) return 0;
    const cutoff = Date.now() - 60_000;
    return window.filter((t) => t > cutoff).length;
  },

  /** Get all metrics as snapshot */
  snapshot(): Record<string, { count: number; ratePerMin: number }> {
    const result: Record<string, { count: number; ratePerMin: number }> = {};
    for (const [key] of _metrics) {
      result[key] = { count: this.get(key), ratePerMin: this.ratePerMinute(key) };
    }
    return result;
  },

  /** Check alert conditions and log warnings */
  checkAlerts() {
    safelog(() => {
      const errorRate = this.ratePerMinute("error");
      if (errorRate > 5) {
        logger.event("Monitor", "SYSTEM_DEGRADED", {
          reason: "High error rate",
          errorsPerMinute: errorRate,
          metrics: this.snapshot(),
        }, "warn");
      }

      const fallbacks = this.ratePerMinute("fallback_used");
      if (fallbacks > 10) {
        logger.event("Monitor", "SYSTEM_DEGRADED", {
          reason: "Excessive fallback usage",
          fallbacksPerMinute: fallbacks,
        }, "warn");
      }

      const emptyResults = this.ratePerMinute("catalog_empty_result");
      if (emptyResults > 5) {
        logger.event("Monitor", "CATALOG_DEGRADED", {
          reason: "Repeated empty catalog results",
          emptyPerMinute: emptyResults,
        }, "warn");
      }
    });
  },

  /** Reset all metrics (for testing) */
  reset() {
    _metrics.clear();
    _windows.clear();
  },
};

export default logger;
