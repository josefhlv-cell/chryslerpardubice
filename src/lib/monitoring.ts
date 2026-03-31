/**
 * Monitoring & Error Tracking
 * Centralized error capture and event tracking.
 * Ready for Sentry / LogRocket integration.
 * 
 * Usage:
 *   import { captureError, trackEvent } from "@/lib/monitoring";
 *   captureError(error, { module: "ServiceOrders", action: "create" });
 */

import { logger } from "@/lib/logger";

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
 * Currently logs structured error; ready for Sentry integration.
 * 
 * To enable Sentry:
 *   import * as Sentry from "@sentry/react";
 *   Sentry.captureException(error, { extra: context });
 */
export function captureError(error: unknown, context?: ErrorContext): void {
  const module = context?.module ?? "App";
  const action = context?.action ?? "unknown";

  logger.error(module, action, error, context);

  // Sentry integration point:
  // if (typeof window !== "undefined" && window.__SENTRY__) {
  //   Sentry.captureException(error, { extra: context });
  // }
}

/**
 * Track a business event for analytics/monitoring.
 * Currently logs; ready for LogRocket / analytics integration.
 * 
 * To enable LogRocket:
 *   import LogRocket from "logrocket";
 *   LogRocket.track(eventName, data);
 */
export function trackEvent(eventName: string, data?: EventData): void {
  logger.info("Monitor", eventName, data);

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
