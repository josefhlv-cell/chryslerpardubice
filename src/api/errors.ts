/**
 * Application Error Classes & Logger
 * Centralized error handling and structured logging for all API modules.
 */

export class AppError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: string = "UNKNOWN_ERROR",
    statusCode: number = 500,
    context?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", 400, context);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource} nenalezen${id ? ` (${id})` : ""}`,
      "NOT_FOUND",
      404,
      { resource, id }
    );
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Nedostatečná oprávnění") {
    super(message, "UNAUTHORIZED", 403);
    this.name = "AuthorizationError";
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

// ---- Logger ----

type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
  level: LogLevel;
  module: string;
  action: string;
  message?: string;
  data?: Record<string, unknown>;
  error?: unknown;
  timestamp: string;
}

function formatLog(entry: LogEntry): string {
  const prefix = `[${entry.module}] ${entry.action}`;
  const msg = entry.message ? ` — ${entry.message}` : "";
  return `${prefix}${msg}`;
}

export const logger = {
  info(module: string, action: string, data?: Record<string, unknown>) {
    const entry: LogEntry = { level: "info", module, action, data, timestamp: new Date().toISOString() };
    console.log(formatLog(entry), data ?? "");
  },

  warn(module: string, action: string, message?: string, data?: Record<string, unknown>) {
    const entry: LogEntry = { level: "warn", module, action, message, data, timestamp: new Date().toISOString() };
    console.warn(formatLog(entry), data ?? "");
  },

  error(module: string, action: string, error: unknown, data?: Record<string, unknown>) {
    const entry: LogEntry = { level: "error", module, action, error, data, timestamp: new Date().toISOString() };
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(formatLog({ ...entry, message: errMsg }), data ?? "");
  },

  debug(module: string, action: string, data?: Record<string, unknown>) {
    if (import.meta.env.DEV) {
      const entry: LogEntry = { level: "debug", module, action, data, timestamp: new Date().toISOString() };
      console.debug(formatLog(entry), data ?? "");
    }
  },
};

// ---- Helpers ----

/** Wrap a Supabase operation with error handling */
export async function withErrorHandling<T>(
  module: string,
  action: string,
  operation: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  try {
    const result = await operation();
    logger.debug(module, action, { status: "success", ...context });
    return result;
  } catch (err) {
    logger.error(module, action, err, context);
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "Neočekávaná chyba";
    throw new AppError(message, "DB_ERROR", 500, { module, action, ...context });
  }
}

/** Validate required string field */
export function requireString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`Pole "${fieldName}" je povinné a musí být neprázdný text.`, { field: fieldName });
  }
  return value.trim();
}

/** Validate required UUID */
export function requireUUID(value: unknown, fieldName: string): string {
  const str = requireString(value, fieldName);
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(str)) {
    throw new ValidationError(`Pole "${fieldName}" musí být platné UUID.`, { field: fieldName, value: str });
  }
  return str;
}

/** Validate optional positive number */
export function optionalPositiveNumber(value: unknown, fieldName: string): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "string" ? parseFloat(value) : Number(value);
  if (isNaN(num) || num < 0) {
    throw new ValidationError(`Pole "${fieldName}" musí být kladné číslo.`, { field: fieldName, value });
  }
  return num;
}
