/**
 * Application Error Classes
 * Centralized error types for the entire application.
 */

// ---- Error Codes ----

export const ErrorCodes = {
  // Validation
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INVALID_UUID: "INVALID_UUID",
  REQUIRED_FIELD: "REQUIRED_FIELD",
  INVALID_STATUS: "INVALID_STATUS",
  INVALID_RANGE: "INVALID_RANGE",

  // Auth
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",

  // Data
  NOT_FOUND: "NOT_FOUND",
  DUPLICATE: "DUPLICATE",
  DB_ERROR: "DB_ERROR",

  // External
  AI_UNAVAILABLE: "AI_UNAVAILABLE",
  RATE_LIMITED: "RATE_LIMITED",
  PAYMENT_REQUIRED: "PAYMENT_REQUIRED",
  NETWORK_ERROR: "NETWORK_ERROR",

  // Generic
  UNKNOWN_ERROR: "UNKNOWN_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// ---- Error Classes ----

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly context?: Record<string, unknown>;

  constructor(
    message: string,
    code: ErrorCode = ErrorCodes.UNKNOWN_ERROR,
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
    super(message, ErrorCodes.VALIDATION_ERROR, 400, context);
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      `${resource} nenalezen${id ? ` (${id})` : ""}`,
      ErrorCodes.NOT_FOUND,
      404,
      { resource, id }
    );
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = "Nedostatečná oprávnění") {
    super(message, ErrorCodes.UNAUTHORIZED, 403);
    this.name = "AuthorizationError";
    Object.setPrototypeOf(this, AuthorizationError.prototype);
  }
}

// ---- Helpers ----

/** Wrap an async operation with structured error handling */
export async function withErrorHandling<T>(
  module: string,
  action: string,
  operation: () => Promise<T>,
  context?: Record<string, unknown>
): Promise<T> {
  const { logger } = await import("@/lib/logger");
  try {
    const result = await operation();
    logger.debug(module, action, { status: "success", ...context });
    return result;
  } catch (err) {
    logger.error(module, action, err, context);
    // Capture for monitoring
    import("@/lib/monitoring").then(({ captureError }) => {
      captureError(err, { module, action, ...context });
    }).catch(() => {});
    if (err instanceof AppError) throw err;
    const message = err instanceof Error ? err.message : "Neočekávaná chyba";
    throw new AppError(message, ErrorCodes.DB_ERROR, 500, { module, action, ...context });
  }
}
