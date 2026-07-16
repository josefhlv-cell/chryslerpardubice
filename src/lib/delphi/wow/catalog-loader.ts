import protocolAsset from "./protocol-overview.asset.json";
import type { WowHelpRecord, WowProtocolCatalog, WowProtocolRecord } from "./types";

let protocolPromise: Promise<WowProtocolCatalog> | null = null;
let helpPromise: Promise<{ records: WowHelpRecord[] }> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`WOW catalog load failed: ${response.status} ${url}`);
  return response.json() as Promise<T>;
}

export function loadWowProtocolCatalog(): Promise<WowProtocolCatalog> {
  protocolPromise ??= fetchJson<WowProtocolCatalog>(protocolAsset.url);
  return protocolPromise;
}

export function loadWowHelpIndex(): Promise<{ records: WowHelpRecord[] }> {
  helpPromise ??= fetchJson<{ records: WowHelpRecord[] }>("/delphi/wow/help-index.json");
  return helpPromise;
}

export async function findWowProtocols(query: {
  system?: string;
  protocol?: string;
  startYear?: number;
  endYear?: number;
  limit?: number;
}): Promise<WowProtocolRecord[]> {
  const catalog = await loadWowProtocolCatalog();
  const system = query.system?.trim().toLowerCase();
  const protocol = query.protocol?.replace(/\s+/g, "").toLowerCase();
  const limit = query.limit ?? 500;
  const out: WowProtocolRecord[] = [];
  for (const row of catalog.records) {
    const rowStart = Number(row.startYear) || 0;
    const rowEnd = Number(row.endYear) || 9999;
    if (query.startYear && rowEnd < query.startYear) continue;
    if (query.endYear && rowStart > query.endYear) continue;
    if (system && !`${row.systemName} ${row.systemVariant}`.toLowerCase().includes(system)) continue;
    if (protocol) {
      const haystack = [row.obdProtocol, row.diagnosisProtocol, row.eobdProtocol, row.measurementProtocol, row.ecuObd].join("").toLowerCase();
      if (!haystack.includes(protocol)) continue;
    }
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
