/**
 * Centralized Logger
 * Provides structured, module-scoped logging throughout the application.
 * 
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("ModuleName", "action", { key: "value" });
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

export const logger = {
  info(module: string, action: string, data?: Record<string, unknown>) {
    console.log(formatPrefix({ module, action }), data ?? "");
  },

  warn(module: string, action: string, message?: string, data?: Record<string, unknown>) {
    console.warn(formatPrefix({ module, action, message }), data ?? "");
  },

  error(module: string, action: string, error: unknown, data?: Record<string, unknown>) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(formatPrefix({ module, action, message: errMsg }), data ?? "");
  },

  debug(module: string, action: string, data?: Record<string, unknown>) {
    if (import.meta.env.DEV) {
      console.debug(formatPrefix({ module, action }), data ?? "");
    }
  },
};

export default logger;
