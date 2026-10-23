import { addMonths, startOfDay, startOfWeek, addDays } from "date-fns";

export function requireSaved<T extends { id: string }>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  if (!result.data?.id) throw new Error("Zápis nebyl potvrzen. Zkuste to znovu.");
  return result.data;
}

export function savedItemIndexes(results: PromiseSettledResult<{ id: string }>[]): number[] {
  return results.flatMap((r, i) => r.status === "fulfilled" && r.value.id ? [i] : []);
}

export function inSchedulePeriod(value: string | null, date: Date, view: "day" | "week") {
  if (!value) return false;
  const start = view === "day" ? startOfDay(date) : startOfWeek(date, { weekStartsOn: 1 });
  const end = addDays(start, view === "day" ? 1 : 7);
  const time = new Date(value).getTime();
  return time >= start.getTime() && time < end.getTime();
}

type Maintenance = { interval_km: number | null; interval_months: number | null; last_service_km: number | null; last_service_date: string | null };
export function maintenanceStatus(plan: Maintenance, currentKm: number | null, now = new Date()) {
  const remainingKm = plan.interval_km && plan.last_service_km != null && currentKm != null && currentKm >= plan.last_service_km
    ? plan.interval_km - (currentKm - plan.last_service_km) : null;
  const lastDate = plan.last_service_date ? new Date(plan.last_service_date) : null;
  const dueDate = plan.interval_months && lastDate && Number.isFinite(lastDate.getTime()) ? addMonths(lastDate, plan.interval_months) : null;
  const overdue = (remainingKm != null && remainingKm <= 0) || (dueDate != null && dueDate <= now);
  const urgent = overdue || (remainingKm != null && remainingKm <= (plan.interval_km ?? 0) * .2) || (dueDate != null && dueDate <= addMonths(now, 1));
  const missing = (Boolean(plan.interval_km) && remainingKm == null) || (Boolean(plan.interval_months) && dueDate == null);
  const info = [remainingKm != null ? `Zbývá ${remainingKm.toLocaleString("cs")} km` : "", dueDate ? `Termín: ${dueDate.toLocaleDateString("cs-CZ")}` : "", missing ? "Neúplná historie údržby" : ""].filter(Boolean).join(" · ");
  return { label: `${overdue ? "Překročeno! · " : ""}${info || "Historie údržby není známá"}`, color: overdue ? "destructive" as const : urgent ? "secondary" as const : "outline" as const, urgent, missing };
}

export function epcSelectionReady(brand: string, model: string, year: string, engine: string) {
  return Boolean(brand && model && year && engine);
}

export function withPhotos(messages: { role: string; content: string }[], urls: string[]) {
  return messages.map((m, i) => i === messages.length - 1 && m.role === "user" && urls.length
    ? { ...m, content: [{ type: "text", text: m.content }, ...urls.map(url => ({ type: "image_url", image_url: { url } }))] }
    : m);
}