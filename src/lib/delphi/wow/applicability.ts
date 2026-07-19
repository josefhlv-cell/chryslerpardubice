import type { WowContentRecord } from "./full-content";
import type { WowActiveVehicle } from "./vehicle-context";

/** Applicability decision for a single document against the active vehicle. */
export type ApplicabilityBucket = "compatible" | "unverified" | "excluded";

export interface ApplicabilityResult {
  bucket: ApplicabilityBucket;
  reasons: string[];
}

const STOP = new Set(["and", "the", "for", "with", "obd", "help", "content", "car", "auto"]);

function norm(s: string | null | undefined): string {
  return (s || "").toString().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, " ").trim();
}

function tokens(s: string | null | undefined): string[] {
  return norm(s).split(/\s+/).filter((t) => t.length >= 3 && !STOP.has(t));
}

function recordHaystack(rec: WowContentRecord): string {
  return norm(`${rec.title} ${rec.fileName} ${rec.excerpt} ${rec.tags.join(" ")}`);
}

function contains(haystack: string, needle: string): boolean {
  if (!needle) return false;
  return haystack.includes(needle);
}

/**
 * Deterministic per-record applicability decision.
 *
 * A document is "compatible" ONLY when at least one strong identifier of the
 * active vehicle (engine code, model name, generation) is literally present in
 * the document's title/filename/tags/excerpt AND no explicit disqualifier
 * (different model/year window/engine) is present.
 *
 * When the source index carries no vehicle metadata to verify against, the
 * document is placed under "unverified" — never falsely marked as compatible.
 */
export function classifyApplicability(rec: WowContentRecord, v: WowActiveVehicle): ApplicabilityResult {
  const hay = recordHaystack(rec);
  const reasons: string[] = [];

  const makeToks = tokens(v.make);
  const modelToks = tokens(v.model);
  const genToks = tokens(v.generation);
  const engCode = norm(v.engineCode);
  const engineToks = tokens(v.engineName);
  const transToks = tokens(v.transmission);
  const driveToks = tokens(v.drivetrain);

  // Nothing selected → everything unverified (never compatible).
  const anySelection = !!(v.make || v.model || v.generation || v.year || v.engineCode || v.engineName || v.transmission || v.drivetrain);
  if (!anySelection) return { bucket: "unverified", reasons: ["Není zvoleno žádné vozidlo"] };

  // --- Positive evidence ---
  let strongHit = false;

  if (engCode && engCode.length >= 2 && contains(hay, engCode)) {
    strongHit = true;
    reasons.push(`engine code “${engCode}”`);
  }
  if (!strongHit && modelToks.some((t) => contains(hay, t))) {
    strongHit = true;
    reasons.push(`model match`);
  }
  if (!strongHit && genToks.some((t) => contains(hay, t))) {
    strongHit = true;
    reasons.push(`generation match`);
  }
  // Engine name only as fallback confirmation, not standalone
  if (strongHit && engineToks.some((t) => contains(hay, t))) reasons.push("engine name match");
  if (strongHit && transToks.some((t) => contains(hay, t))) reasons.push("transmission match");
  if (strongHit && driveToks.some((t) => contains(hay, t))) reasons.push("drivetrain match");

  // --- Explicit disqualifiers ---
  // Year: if the document title mentions a 4-digit year outside [year-1, year+1] window and
  // no other year appears matching selection → exclude. Otherwise ignore.
  if (v.year && strongHit) {
    const yearsInDoc = Array.from(hay.matchAll(/\b(19\d{2}|20\d{2})\b/g)).map((m) => Number(m[1]));
    if (yearsInDoc.length && !yearsInDoc.some((y) => Math.abs(y - v.year!) <= 1)) {
      return { bucket: "excluded", reasons: [`document year ${yearsInDoc.join("/")} ≠ ${v.year}`] };
    }
  }

  if (strongHit) return { bucket: "compatible", reasons };

  // Make-only hit is not strong enough to confirm; treat as unverified.
  if (makeToks.some((t) => contains(hay, t))) {
    return { bucket: "unverified", reasons: ["only make matches"] };
  }

  return { bucket: "unverified", reasons: ["no vehicle-specific identifier found in document"] };
}

export interface PartitionedRecords {
  compatible: WowContentRecord[];
  unverified: WowContentRecord[];
  excluded: WowContentRecord[];
}

export function partitionByApplicability(records: WowContentRecord[], v: WowActiveVehicle): PartitionedRecords {
  const out: PartitionedRecords = { compatible: [], unverified: [], excluded: [] };
  for (const rec of records) {
    const res = classifyApplicability(rec, v);
    out[res.bucket].push(rec);
  }
  return out;
}
