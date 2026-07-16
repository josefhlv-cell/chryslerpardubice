import type { WowHelpRecord, WowProtocolCatalog, WowProtocolRecord } from "./types";

let protocolPromise: Promise<WowProtocolCatalog> | null = null;
let helpPromise: Promise<{ records: WowHelpRecord[] }> | null = null;

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`WOW catalog load failed: ${response.status} ${url}`);
  return response.json() as Promise<T>;
}

export function loadWowProtocolCatalog(): Promise<WowProtocolCatalog> {
  protocolPromise ??= fetchJson<WowProtocolCatalog>("/delphi/wow/protocol-overview.json");
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
}): Promise<WowProtocolRecord[]> {
  const catalog = await loadWowProtocolCatalog();
  const system = query.system?.trim().toLowerCase();
  const protocol = query.protocol?.replace(/\s+/g, "").toLowerCase();
  return catalog.records.filter((row) => {
    const rowStart = Number(row.startYear) || 0;
    const rowEnd = Number(row.endYear) || 9999;
    if (query.startYear && rowEnd < query.startYear) return false;
    if (query.endYear && rowStart > query.endYear) return false;
    if (system && !`${row.systemName} ${row.systemVariant}`.toLowerCase().includes(system)) return false;
    if (protocol) {
      const haystack = [row.obdProtocol,row.diagnosisProtocol,row.eobdProtocol,row.measurementProtocol,row.ecuObd].join("").toLowerCase();
      if (!haystack.includes(protocol)) return false;
    }
    return true;
  });
}
