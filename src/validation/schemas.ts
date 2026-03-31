/**
 * Zod Validation Schemas
 * Centralized validation for all domain entities.
 * Used ONLY in the service/API layer — never in UI components.
 */

import { z } from "zod";

// ---- Shared ----

const uuidSchema = z.string().uuid("Musí být platné UUID");

const positiveInt = z.number().int().nonnegative("Musí být kladné celé číslo");

const mileageSchema = positiveInt.max(9_999_999, "Maximální hodnota je 9 999 999 km");

const yearSchema = z.number().int().min(1900).max(new Date().getFullYear() + 2, "Neplatný rok výroby");

// ---- Vehicles ----

export const addVehicleSchema = z.object({
  user_id: uuidSchema,
  brand: z.string().trim().min(1, "Značka je povinná").max(50),
  model: z.string().trim().min(1, "Model je povinný").max(100),
  year: yearSchema.optional(),
  engine: z.string().trim().max(100).optional(),
  vin: z.string().trim().max(17).optional(),
  license_plate: z.string().trim().max(20).optional(),
  current_mileage: mileageSchema.optional(),
});

export const updateMileageSchema = z.object({
  vehicleId: uuidSchema,
  mileage: mileageSchema,
});

export const mileageRecordSchema = z.object({
  vehicle_id: uuidSchema,
  user_id: uuidSchema,
  mileage: mileageSchema,
  source: z.string().trim().max(50).optional(),
});

// ---- Service Orders ----

export const SERVICE_ORDER_STATUSES = [
  "received", "diagnostics", "waiting_approval", "waiting_parts",
  "in_repair", "testing", "ready_pickup", "completed",
] as const;

export const serviceOrderStatusSchema = z.enum(SERVICE_ORDER_STATUSES);

export const createServiceOrderSchema = z.object({
  user_id: uuidSchema,
  vehicle_id: uuidSchema.nullable().optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  mileage: mileageSchema.nullable().optional(),
});

export const updateServiceOrderStatusSchema = z.object({
  orderId: uuidSchema,
  status: serviceOrderStatusSchema,
});

export const statusHistoryEntrySchema = z.object({
  service_order_id: uuidSchema,
  old_status: z.string().nullable(),
  new_status: z.string().min(1, "Nový stav je povinný"),
  changed_by: uuidSchema.nullable(),
  note: z.string().trim().max(500).nullable().optional(),
});

// ---- Service Reviews ----

export const createReviewSchema = z.object({
  service_order_id: uuidSchema,
  user_id: uuidSchema,
  rating: z.number().int().min(1, "Hodnocení min. 1").max(5, "Hodnocení max. 5"),
  comment: z.string().trim().max(1000).nullable(),
});

// ---- Service Bookings ----

export const createBookingSchema = z.object({
  user_id: uuidSchema,
  service_type: z.string().trim().min(1, "Typ servisu je povinný").max(200),
  vehicle_brand: z.string().trim().max(50).nullable().optional(),
  vehicle_model: z.string().trim().max(100).nullable().optional(),
  preferred_date: z.string().min(1, "Datum je povinné"),
  note: z.string().trim().max(1000).nullable().optional(),
  wants_replacement_vehicle: z.boolean(),
});

// ---- Notifications ----

export const createNotificationSchema = z.object({
  user_id: uuidSchema,
  title: z.string().trim().min(1, "Titulek je povinný").max(200),
  message: z.string().trim().min(1, "Zpráva je povinná").max(2000),
});

export const createNotificationsArraySchema = z.array(createNotificationSchema).min(1, "Pole nesmí být prázdné");

// ---- Admin Profiles ----

export const PROFILE_STATUSES = ["active", "pending", "blocked"] as const;

export const updateProfileStatusSchema = z.object({
  userId: uuidSchema,
  status: z.enum(PROFILE_STATUSES),
});

export const updateProfileDiscountSchema = z.object({
  userId: uuidSchema,
  discount_percent: z.number().min(0).max(100, "Sleva max. 100 %"),
});

const ALLOWED_PROFILE_FIELDS = [
  "full_name", "phone", "email", "company_name", "ico", "dic",
  "notifications_enabled", "service_history_enabled", "loyalty_active",
] as const;

export const updateProfileFieldSchema = z.object({
  userId: uuidSchema,
  field: z.enum(ALLOWED_PROFILE_FIELDS),
  value: z.any(),
});

// ---- Employees ----

export const createEmployeeSchema = z.object({
  name: z.string().trim().min(1, "Jméno je povinné").max(200),
  email: z.string().email("Neplatný email").nullable().optional(),
  role: z.string().trim().min(1, "Role je povinná").max(50),
});

// ---- AI Mechanic ----

export const aiMechanicInputSchema = z.object({
  message: z.string().trim().min(1, "Zpráva je povinná").max(2000),
  vehicleId: uuidSchema.optional(),
});

// Re-export types
export type AddVehicleInput = z.infer<typeof addVehicleSchema>;
export type CreateServiceOrderInput = z.infer<typeof createServiceOrderSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type CreateEmployeeInput = z.infer<typeof createEmployeeSchema>;
