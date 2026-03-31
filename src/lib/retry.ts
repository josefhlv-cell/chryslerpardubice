/**
 * Retry / Resilience Utility
 * Provides exponential backoff retry for external calls (AI, notifications, APIs).
 * 
 * Usage:
 *   import { withRetry } from "@/lib/retry";
 *   const result = await withRetry(() => fetchFromExternalAPI(), { maxAttempts: 3 });
 */

import { logger } from "@/lib/logger";

export interface RetryOptions {
  /** Max number of attempts (default: 3) */
  maxAttempts?: number;
  /** Base delay in ms before first retry (default: 500) */
  baseDelayMs?: number;
  /** Max delay cap in ms (default: 10000) */
  maxDelayMs?: number;
  /** Module name for logging */
  module?: string;
  /** Action name for logging */
  action?: string;
  /** Only retry if this returns true for the error (default: retry all) */
  retryIf?: (error: unknown) => boolean;
}

const DEFAULT_OPTIONS: Required<Omit<RetryOptions, "retryIf">> = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 10_000,
  module: "Retry",
  action: "operation",
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an async operation with exponential backoff retry.
 * Throws the last error if all attempts fail.
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options?: RetryOptions
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      // Check if we should retry this error
      if (opts.retryIf && !opts.retryIf(error)) {
        throw error;
      }

      if (attempt < opts.maxAttempts) {
        const delay = Math.min(
          opts.baseDelayMs * Math.pow(2, attempt - 1),
          opts.maxDelayMs
        );
        logger.warn(opts.module, opts.action, `Attempt ${attempt}/${opts.maxAttempts} failed, retrying in ${delay}ms`, {
          attempt,
          maxAttempts: opts.maxAttempts,
          delay,
        });
        await sleep(delay);
      }
    }
  }

  logger.error(opts.module, opts.action, lastError, {
    finalFailure: true,
    attempts: opts.maxAttempts,
  });
  throw lastError;
}

/** Check if an error is a transient/retryable error (network, 5xx, timeout) */
export function isTransientError(error: unknown): boolean {
  if (error instanceof TypeError && error.message.includes("fetch")) return true;
  if (error && typeof error === "object") {
    const e = error as Record<string, unknown>;
    const status = e.status ?? e.statusCode;
    if (typeof status === "number" && (status >= 500 || status === 429)) return true;
    const code = e.code;
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") return true;
  }
  return false;
}
