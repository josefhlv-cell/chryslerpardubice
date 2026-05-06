/**
 * Pure helpers for normalizing VIN-decode responses from `vin-decode-ai`.
 *
 * The edge function returns `{ success, basic, enriched }`, but historically
 * some callers wrapped it in `{ data: ... }`. We accept both shapes.
 */

export interface VinDecoded {
  brand: string;
  model: string;
  engine?: string;
}

export interface ParsedVinResult {
  ok: boolean;
  brand: string;
  model: string;
  engine?: string;
  /** Czech, user-facing reason when `ok === false`. */
  error?: string;
}

const titleCase = (s: string): string =>
  s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

/** Brands kept fully uppercase regardless of NHTSA casing. */
const ALL_CAPS_BRANDS = new Set(["RAM", "GMC", "BMW"]);

export function normalizeBrand(raw: string | null | undefined): string {
  const v = String(raw ?? "").trim();
  if (!v) return "";
  if (ALL_CAPS_BRANDS.has(v.toUpperCase())) return v.toUpperCase();
  return titleCase(v);
}

export function normalizeModel(raw: string | null | undefined): string {
  return titleCase(String(raw ?? "").trim());
}

/**
 * Best-effort engine label.
 * Priority: enriched.engine_label → basic.engine_label →
 *           "<displacement> [CRD]" derived from basic fields.
 */
export function deriveEngineLabel(
  basic: any,
  enriched: any,
): string | undefined {
  const explicit =
    enriched?.engine_label ||
    enriched?.engine ||
    basic?.engine_label ||
    basic?.engine;
  if (explicit && String(explicit).trim()) return String(explicit).trim();

  const parts: string[] = [];
  if (basic?.engine_displacement) parts.push(String(basic.engine_displacement));
  if (basic?.fuel_type && /diesel/i.test(String(basic.fuel_type))) {
    parts.push("CRD");
  }
  return parts.length ? parts.join(" ") : undefined;
}

/**
 * Parse the response body of `vin-decode-ai` into a normalized result.
 * Never throws — failures are returned as `{ ok: false, error }`.
 */
export function parseVinPayload(data: unknown): ParsedVinResult {
  const root: any = data ?? {};
  const payload: any = root.data ?? root;

  if (payload && payload.success === false) {
    return {
      ok: false,
      brand: "",
      model: "",
      error:
        typeof payload.error === "string" && payload.error.trim()
          ? payload.error
          : "VIN se nepodařilo dekódovat.",
    };
  }

  const basic = payload?.basic ?? payload ?? {};
  const enriched = payload?.enriched ?? {};

  const brand = normalizeBrand(basic?.brand ?? basic?.make);
  const model = normalizeModel(basic?.model);
  const engine = deriveEngineLabel(basic, enriched);

  if (!brand || !model) {
    return {
      ok: false,
      brand,
      model,
      engine,
      error: "VIN se nepodařilo dekódovat na značku/model.",
    };
  }

  return { ok: true, brand, model, engine };
}
