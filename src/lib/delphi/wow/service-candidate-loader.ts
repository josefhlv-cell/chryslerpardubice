import type { WowServiceDefinitionCandidate } from "./service-definitions";

interface CandidatePayload { summary: Record<string, unknown>; items: WowServiceDefinitionCandidate[] }
let cache: Promise<CandidatePayload> | null = null;
export function loadWowServiceCandidates(): Promise<CandidatePayload> {
  cache ??= fetch("/delphi/wow/service-definition-candidates.json", { cache: "force-cache" })
    .then(async (r) => { if (!r.ok) throw new Error(`WOW candidates HTTP ${r.status}`); return r.json(); });
  return cache;
}
export async function searchWowServiceCandidates(query: string, limit = 200) {
  const payload = await loadWowServiceCandidates();
  const q = query.trim().toLocaleLowerCase("cs-CZ");
  if (!q) return payload.items.slice(0, limit);
  return payload.items.filter((x) => [x.label,x.requestCandidate,x.sourceFile,...(x.context ?? [])]
    .some((v) => v?.toLocaleLowerCase("cs-CZ").includes(q))).slice(0, limit);
}
