/**
 * API Error Utilities
 * Re-exports from canonical locations for backward compatibility.
 */

export { AppError, ValidationError, NotFoundError, AuthorizationError, withErrorHandling, ErrorCodes } from "@/lib/errors";
export { logger } from "@/lib/logger";

// ---- Inline validation helpers (used by API modules) ----

import { ValidationError } from "@/lib/errors";

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
