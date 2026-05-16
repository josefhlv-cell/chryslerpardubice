/**
 * Monitoring & Error Tracking
 * Centralized error capture and event tracking.
 * Ready for Sentry / LogRocket integration.
 * 
 * Usage:
 *   import { captureError, trackEvent } from "@/lib/monitoring";
 *   captureError(error, { module: "ServiceOrders", action: "create" });
 */

import { logger, metrics } from "@/lib/logger";

interface ErrorContext {
  module?: string;
  action?: string;
  userId?: string;
  [key: string]: unknown;
}

interface EventData {
  [key: string]: unknown;
}

/**
 * Capture and report an error.
 * Increments error counter and logs structured error.
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  const module = context?.module ?? "App";
  const action = context?.action ?? "unknown";

  logger.error(module, action, error, context);
  metrics.increment("error");
  metrics.checkAlerts();

  // Sentry integration point:
  // if (typeof window !== "undefined" && window.__SENTRY__) {
  //   Sentry.captureException(error, { extra: context });
  // }
}

/**
 * Track a business event for analytics/monitoring.
 * Increments named counter and logs.
 */
export function trackEvent(eventName: string, data?: EventData): void {
  logger.event("Monitor", eventName, data);
  metrics.increment(eventName.toLowerCase());

  // LogRocket integration point:
  // if (typeof window !== "undefined" && window.__LOGROCKET__) {
  //   LogRocket.track(eventName, data);
  // }
}

/**
 * Identify current user for monitoring tools.
 */
export function identifyUser(userId: string, traits?: Record<string, string>): void {
  logger.debug("Monitor", "identifyUser", { userId, ...traits });

  // Sentry.setUser({ id: userId, ...traits });
  // LogRocket.identify(userId, traits);
}

/**
 * Track a catalog search and whether results were found.
 */
export function trackCatalogSearch(query: string, resultCount: number, source: string): void {
  if (resultCount === 0) {
    metrics.increment("catalog_empty_result");
    logger.event("Catalog", "CATALOG_EMPTY_RESULT", { query, source }, "warn");
  }
  metrics.increment("catalog_search");
  metrics.checkAlerts();
}

/**
 * Track a fallback being used (e.g. price history fallback).
 */
export function trackFallback(module: string, reason: string, data?: EventData): void {
  metrics.increment("fallback_used");
  logger.event(module, "FALLBACK_USED", { reason, ...data }, "warn");
  metrics.checkAlerts();
}