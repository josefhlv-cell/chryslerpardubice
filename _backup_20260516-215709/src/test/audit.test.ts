/**
 * System Audit Tests
 * Validates critical flows: orders, catalog, error handling, permissions, retry.
 */
import { describe, it, expect, vi } from "vitest";

// ---- Permissions ----
import { isAdmin, canManageVehicle, requireAdmin } from "@/lib/permissions";

describe("Permissions", () => {
  it("isAdmin returns false for null user", () => {
    expect(isAdmin(null)).toBe(false);
  });
  it("isAdmin returns false for non-admin", () => {
    expect(isAdmin({ id: "u1", isAdmin: false })).toBe(false);
  });
  it("isAdmin returns true for admin", () => {
    expect(isAdmin({ id: "u1", isAdmin: true })).toBe(true);
  });
  it("canManageVehicle allows owner", () => {
    expect(canManageVehicle("u1", "u1", false)).toBe(true);
  });
  it("canManageVehicle denies non-owner non-admin", () => {
    expect(canManageVehicle("u1", "u2", false)).toBe(false);
  });
  it("canManageVehicle allows admin for any vehicle", () => {
    expect(canManageVehicle("u1", "u2", true)).toBe(true);
  });
  it("requireAdmin throws for non-admin", () => {
    expect(() => requireAdmin({ id: "u1", isAdmin: false })).toThrow();
  });
  it("requireAdmin does not throw for admin", () => {
    expect(() => requireAdmin({ id: "u1", isAdmin: true })).not.toThrow();
  });
});

// ---- Error classes ----
import { AppError, ValidationError, NotFoundError, AuthorizationError, ErrorCodes } from "@/lib/errors";

describe("Error Classes", () => {
  it("AppError has correct properties", () => {
    const err = new AppError("test", ErrorCodes.DB_ERROR, 500, { foo: 1 });
    expect(err.message).toBe("test");
    expect(err.code).toBe("DB_ERROR");
    expect(err.statusCode).toBe(500);
    expect(err.context?.foo).toBe(1);
    expect(err instanceof Error).toBe(true);
  });
  it("ValidationError is 400", () => {
    const err = new ValidationError("bad input");
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe("VALIDATION_ERROR");
  });
  it("NotFoundError is 404", () => {
    const err = new NotFoundError("Vehicle", "123");
    expect(err.statusCode).toBe(404);
    expect(err.message).toContain("123");
  });
  it("AuthorizationError is 403", () => {
    const err = new AuthorizationError();
    expect(err.statusCode).toBe(403);
  });
});

// ---- Validation helpers ----
import { requireString, requireUUID, optionalPositiveNumber } from "@/api/errors";

describe("Validation Helpers", () => {
  it("requireString throws on empty", () => {
    expect(() => requireString("", "name")).toThrow();
  });
  it("requireString returns trimmed value", () => {
    expect(requireString("  hello  ", "name")).toBe("hello");
  });
  it("requireUUID throws on invalid", () => {
    expect(() => requireUUID("not-a-uuid", "id")).toThrow();
  });
  it("requireUUID accepts valid UUID", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(requireUUID(uuid, "id")).toBe(uuid);
  });
  it("optionalPositiveNumber returns null for null", () => {
    expect(optionalPositiveNumber(null, "price")).toBeNull();
  });
  it("optionalPositiveNumber throws on negative", () => {
    expect(() => optionalPositiveNumber(-1, "price")).toThrow();
  });
  it("optionalPositiveNumber returns number", () => {
    expect(optionalPositiveNumber(42, "price")).toBe(42);
  });
});

// ---- Logger fail-safe ----
import { logger, metrics } from "@/lib/logger";

describe("Logger & Metrics", () => {
  it("logger.info does not throw", () => {
    expect(() => logger.info("Test", "TEST_EVENT", { key: "val" })).not.toThrow();
  });
  it("logger.error does not throw", () => {
    expect(() => logger.error("Test", "TEST_ERR", new Error("boom"))).not.toThrow();
  });
  it("logger.event does not throw", () => {
    expect(() => logger.event("Test", "SOME_EVENT", { data: 1 })).not.toThrow();
  });
  it("metrics.increment and get work", () => {
    metrics.reset();
    metrics.increment("test_counter", 3);
    expect(metrics.get("test_counter")).toBe(3);
  });
  it("metrics.snapshot returns data", () => {
    metrics.reset();
    metrics.increment("snap_test");
    const snap = metrics.snapshot();
    expect(snap.snap_test).toBeDefined();
    expect(snap.snap_test.count).toBe(1);
  });
  it("metrics.checkAlerts does not throw", () => {
    expect(() => metrics.checkAlerts()).not.toThrow();
  });
});

// ---- Monitoring ----
import { captureError, trackEvent, trackCatalogSearch, trackFallback } from "@/lib/monitoring";

describe("Monitoring", () => {
  it("captureError does not throw", () => {
    expect(() => captureError(new Error("test"), { module: "Test" })).not.toThrow();
  });
  it("trackEvent does not throw", () => {
    expect(() => trackEvent("TEST_EVENT", { foo: "bar" })).not.toThrow();
  });
  it("trackCatalogSearch increments metrics", () => {
    metrics.reset();
    trackCatalogSearch("test-oem", 0, "mopar");
    expect(metrics.get("catalog_empty_result")).toBe(1);
    expect(metrics.get("catalog_search")).toBe(1);
  });
  it("trackFallback increments metrics", () => {
    metrics.reset();
    trackFallback("PriceSync", "no data");
    expect(metrics.get("fallback_used")).toBe(1);
  });
});

// ---- Retry ----
import { withRetry, isTransientError } from "@/lib/retry";

describe("Retry", () => {
  it("withRetry returns on first success", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("withRetry retries on failure then succeeds", async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error("fail1"))
      .mockResolvedValue("ok");
    const result = await withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("withRetry throws after max attempts", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("always fails"));
    await expect(withRetry(fn, { maxAttempts: 2, baseDelayMs: 10 })).rejects.toThrow("always fails");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("withRetry respects retryIf", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("permanent"));
    await expect(
      withRetry(fn, { maxAttempts: 3, baseDelayMs: 10, retryIf: () => false })
    ).rejects.toThrow("permanent");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("isTransientError detects 500", () => {
    expect(isTransientError({ status: 500 })).toBe(true);
  });
  it("isTransientError detects 429", () => {
    expect(isTransientError({ status: 429 })).toBe(true);
  });
  it("isTransientError rejects 400", () => {
    expect(isTransientError({ status: 400 })).toBe(false);
  });
  it("isTransientError detects fetch TypeError", () => {
    expect(isTransientError(new TypeError("fetch failed"))).toBe(true);
  });
});

// ---- Service calculation ----
import { calculateServiceDue, type VehicleWithService, type ServiceInterval } from "@/api/serviceAPI";

describe("Service Due Calculation", () => {
  const vehicle: VehicleWithService = {
    id: "v1", brand: "Chrysler", model: "300C", year: 2020,
    engine: "3.6L", vin: null, current_mileage: 50000, km_start: 30000,
  };

  it("returns due when km exceeded", () => {
    const plan: ServiceInterval = {
      id: "p1", vehicle_id: "v1", service_name: "Olej",
      interval_km: 15000, interval_months: null,
      last_service_date: null, last_service_km: 30000,
      is_active: true, recommended_part_oem: null,
    };
    const result = calculateServiceDue(vehicle, plan);
    expect(result).not.toBeNull();
    expect(result!.urgency).toBe("due");
    expect(result!.kmRemaining).toBeLessThanOrEqual(0);
  });

  it("returns ok when plenty of km left", () => {
    const plan: ServiceInterval = {
      id: "p2", vehicle_id: "v1", service_name: "Brzdová kapalina",
      interval_km: 60000, interval_months: null,
      last_service_date: null, last_service_km: 45000,
      is_active: true, recommended_part_oem: null,
    };
    const result = calculateServiceDue(vehicle, plan);
    expect(result).not.toBeNull();
    expect(result!.urgency).toBe("ok");
  });

  it("returns null when current_km < km_start", () => {
    const lowVehicle = { ...vehicle, current_mileage: 20000 };
    const plan: ServiceInterval = {
      id: "p3", vehicle_id: "v1", service_name: "Test",
      interval_km: 10000, interval_months: null,
      last_service_date: null, last_service_km: null,
      is_active: true, recommended_part_oem: null,
    };
    expect(calculateServiceDue(lowVehicle, plan)).toBeNull();
  });
});

// ---- Parts helpers ----
import { normalizeOem, mapToPartResult, isPartBlocked, sortByPriority } from "@/api/partsAPI";

describe("Parts Helpers", () => {
  it("normalizeOem strips spaces and dashes", () => {
    expect(normalizeOem("68 012-345")).toBe("68012345");
  });

  it("mapToPartResult maps DB row correctly", () => {
    const row = {
      id: "1", name: "Filter", oem_number: "SAG-123", internal_code: null,
      price_without_vat: 100, price_with_vat: 121,
      category: "Filtry", family: null, segment: null, packaging: null,
      description: null, manufacturer: "Mann", availability: "available",
      compatible_vehicles: null, catalog_source: "sag",
    };
    const result = mapToPartResult(row, "sag");
    expect(result.oem_number).toBe("123"); // SAG- prefix stripped
    expect(result.catalog_source).toBe("sag");
    expect(result.price_with_vat).toBe(121);
  });

  it("isPartBlocked blocks disabled sources", () => {
    const part = {
      id: "1", name: "Test", oem_number: "X", internal_code: null,
      price_without_vat: 0, price_with_vat: 0, category: null, family: null,
      segment: null, packaging: null, description: null, manufacturer: null,
      catalog_source: "disabled_source", availability: "unknown",
      compatible_vehicles: null, superseded_by: null, supersedes: null,
    };
    expect(isPartBlocked(part)).toBe(true);
  });

  it("sortByPriority sorts mopar before sag", () => {
    const parts = [
      { catalog_source: "sag" } as any,
      { catalog_source: "mopar" } as any,
    ];
    const sorted = sortByPriority(parts);
    expect(sorted[0].catalog_source).toBe("mopar");
  });
});
