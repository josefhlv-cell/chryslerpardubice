/**
 * Service API Layer
 * Handles service interval calculations based on km_start logic.
 * effective_km = current_km - km_start
 * Service is due when: effective_km - effective_last_service_km >= interval
 */

import { supabase } from "@/integrations/supabase/client";

// ---- Types ----

export interface VehicleWithService {
  id: string;
  brand: string;
  model: string;
  year: number | null;
  engine: string | null;
  vin: string | null;
  current_mileage: number | null;
  /** First recorded km when vehicle was added */
  km_start: number;
}

export interface ServiceInterval {
  id: string;
  vehicle_id: string;
  service_name: string;
  interval_km: number | null;
  interval_months: number | null;
  last_service_date: string | null;
  last_service_km: number | null;
  is_active: boolean;
  recommended_part_oem: string | null;
}

export interface ServiceHistoryEntry {
  id: string;
  vehicle_id: string;
  service_type: string;
  service_date: string;
  mileage: number | null;
  description: string | null;
  price: number | null;
  parts_used: string | null;
}

export type ServiceUrgency = "due" | "soon" | "ok";

export interface ServiceDueItem {
  plan: ServiceInterval;
  urgency: ServiceUrgency;
  /** Effective km since km_start */
  effectiveKm: number;
  /** Effective km at last service */
  effectiveLastServiceKm: number;
  /** km at which service is next due (absolute) */
  dueAtKm: number | null;
  /** km remaining until service */
  kmRemaining: number | null;
  /** Days remaining (time-based interval) */
  daysRemaining: number | null;
  /** Percentage of interval completed */
  progressPercent: number;
}

export interface VehicleServiceReport {
  vehicle: VehicleWithService;
  items: ServiceDueItem[];
  history: ServiceHistoryEntry[];
}

// ---- Core calculation ----

/**
 * Calculate service due status using km_start-based logic.
 * effective_km = current_km - km_start
 * effective_last = last_service_km ? last_service_km - km_start : 0
 * due when: effective_km - effective_last >= interval
 */
export function calculateServiceDue(
  vehicle: VehicleWithService,
  plan: ServiceInterval
): ServiceDueItem | null {
  const currentKm = vehicle.current_mileage ?? vehicle.km_start;

  // Don't show any service items if current_km < km_start
  if (currentKm < vehicle.km_start) return null;

  const effectiveKm = currentKm - vehicle.km_start;
  const effectiveLastServiceKm = plan.last_service_km
    ? Math.max(0, plan.last_service_km - vehicle.km_start)
    : 0;

  let kmRemaining: number | null = null;
  let dueAtKm: number | null = null;
  let daysRemaining: number | null = null;
  let urgency: ServiceUrgency = "ok";
  let progressPercent = 0;

  // km-based check
  if (plan.interval_km) {
    const kmSinceLast = effectiveKm - effectiveLastServiceKm;
    kmRemaining = plan.interval_km - kmSinceLast;
    dueAtKm = (plan.last_service_km ?? vehicle.km_start) + plan.interval_km;
    progressPercent = Math.min(100, Math.round((kmSinceLast / plan.interval_km) * 100));

    if (kmRemaining <= 0) {
      urgency = "due";
    } else if (kmRemaining <= plan.interval_km * 0.15) {
      urgency = "soon";
    }
  }

  // time-based check
  if (plan.interval_months && plan.last_service_date) {
    const lastDate = new Date(plan.last_service_date);
    const nextDate = new Date(lastDate);
    nextDate.setMonth(nextDate.getMonth() + plan.interval_months);
    const now = new Date();
    daysRemaining = Math.ceil((nextDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    if (daysRemaining <= 0) {
      urgency = "due";
    } else if (daysRemaining <= 30 && urgency !== "due") {
      urgency = "soon";
    }

    // Update progress if time-based is more urgent
    if (plan.interval_months) {
      const totalDays = plan.interval_months * 30;
      const elapsed = totalDays - (daysRemaining ?? 0);
      const timeProgress = Math.min(100, Math.round((elapsed / totalDays) * 100));
      if (timeProgress > progressPercent) progressPercent = timeProgress;
    }
  }

  // No history → treat as upcoming
  if (!plan.last_service_date && !plan.last_service_km) {
    urgency = plan.interval_km && effectiveKm >= (plan.interval_km * 0.7) ? "soon" : "ok";
    progressPercent = plan.interval_km ? Math.min(100, Math.round((effectiveKm / plan.interval_km) * 100)) : 0;
    kmRemaining = plan.interval_km ? plan.interval_km - effectiveKm : null;
    dueAtKm = plan.interval_km ? vehicle.km_start + plan.interval_km : null;
  }

  return {
    plan,
    urgency,
    effectiveKm,
    effectiveLastServiceKm,
    dueAtKm,
    kmRemaining,
    daysRemaining,
    progressPercent,
  };
}

// ---- Data fetching ----

/**
 * Get full service report for a vehicle including due items and history.
 */
export async function getVehicleServiceReport(
  userId: string,
  vehicleId: string
): Promise<VehicleServiceReport | null> {
  const [vehicleRes, plansRes, historyRes] = await Promise.all([
    supabase.from("user_vehicles").select("*").eq("id", vehicleId).eq("user_id", userId).single(),
    supabase.from("service_plans").select("*").eq("vehicle_id", vehicleId).eq("user_id", userId).eq("is_active", true).order("interval_km"),
    supabase.from("service_history").select("*").eq("vehicle_id", vehicleId).eq("user_id", userId).order("service_date", { ascending: false }).limit(20),
  ]);

  if (!vehicleRes.data) return null;

  const raw = vehicleRes.data as any;
  // km_start: use the earliest mileage record, or first recorded mileage, or 0
  const vehicle: VehicleWithService = {
    id: raw.id,
    brand: raw.brand,
    model: raw.model,
    year: raw.year,
    engine: raw.engine,
    vin: raw.vin,
    current_mileage: raw.current_mileage,
    km_start: 0, // will be resolved below
  };

  // Resolve km_start from earliest mileage_history record
  const { data: earliest } = await supabase
    .from("mileage_history")
    .select("mileage")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: true })
    .limit(1);

  vehicle.km_start = earliest?.[0]?.mileage ?? raw.current_mileage ?? 0;

  const plans = (plansRes.data || []) as ServiceInterval[];
  const history = (historyRes.data || []) as ServiceHistoryEntry[];

  // Calculate due items
  const items = plans
    .map((plan) => calculateServiceDue(vehicle, plan))
    .sort((a, b) => {
      const order = { due: 0, soon: 1, ok: 2 };
      return order[a.urgency] - order[b.urgency];
    });

  return { vehicle, items, history };
}

/**
 * Get service reports for ALL vehicles of a user.
 */
export async function getAllVehicleReports(userId: string): Promise<VehicleServiceReport[]> {
  const { data: vehicles } = await supabase
    .from("user_vehicles")
    .select("id")
    .eq("user_id", userId);

  if (!vehicles?.length) return [];

  const reports = await Promise.all(
    vehicles.map((v: any) => getVehicleServiceReport(userId, v.id))
  );

  return reports.filter(Boolean) as VehicleServiceReport[];
}
