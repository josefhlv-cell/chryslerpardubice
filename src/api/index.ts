/**
 * API Module Barrel Export
 * 
 * All data access is centralized through these API modules.
 * Components should import from here or from individual modules.
 */

// Core / shared
export * from "./garageAPI";
export * from "./notificationsAPI";
export * from "./serviceBookingsAPI";
export * from "./serviceOrdersAPI";
export * from "./adminAPI";

// Domain-specific
export * from "./partsAPI";
export * from "./serviceAPI";

// Legacy (gradually migrate away)
export {
  fetchVehicles,
  fetchVehicleById,
  createVehicleInquiry,
  createNewPartOrder,
  fetchMyOrders,
  createUsedPartRequest,
  fetchMyUsedPartRequests,
  fetchProfile,
} from "@/lib/api";

export {
  createBuybackRequest,
  createImportRequest,
} from "@/lib/buyImportAPI";
