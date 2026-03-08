/**
 * EPC Cache Layer
 * Uses localStorage with TTL for VIN decode, OEM crossref, and EPC diagrams.
 * Falls back to DB/API on cache miss.
 */

const CACHE_PREFIX = 'epc_cache_';

// TTL in milliseconds
const TTL = {
  vin_decode: 7 * 24 * 60 * 60 * 1000,    // 7 days
  oem_crossref: 30 * 24 * 60 * 60 * 1000,  // 30 days
  diagram: Infinity,                         // permanent
} as const;

type CacheType = keyof typeof TTL;

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

function cacheKey(type: CacheType, id: string): string {
  return `${CACHE_PREFIX}${type}_${id}`;
}

export function cacheGet<T>(type: CacheType, id: string): T | null {
  try {
    const raw = localStorage.getItem(cacheKey(type, id));
    if (!raw) return null;

    const entry: CacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;

    if (entry.ttl !== -1 && age > entry.ttl) {
      localStorage.removeItem(cacheKey(type, id));
      return null;
    }

    return entry.data;
  } catch {
    return null;
  }
}

export function cacheSet<T>(type: CacheType, id: string, data: T): void {
  try {
    const ttl = TTL[type] === Infinity ? -1 : TTL[type];
    const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
    localStorage.setItem(cacheKey(type, id), JSON.stringify(entry));
  } catch (e) {
    // localStorage full — evict oldest entries of this type
    evictOldest(type, 5);
    try {
      const ttl = TTL[type] === Infinity ? -1 : TTL[type];
      const entry: CacheEntry<T> = { data, timestamp: Date.now(), ttl };
      localStorage.setItem(cacheKey(type, id), JSON.stringify(entry));
    } catch {
      // silently fail
    }
  }
}

function evictOldest(type: CacheType, count: number): void {
  const prefix = `${CACHE_PREFIX}${type}_`;
  const entries: { key: string; timestamp: number }[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(prefix)) {
      try {
        const raw = localStorage.getItem(key);
        if (raw) {
          const { timestamp } = JSON.parse(raw);
          entries.push({ key, timestamp });
        }
      } catch {
        entries.push({ key, timestamp: 0 });
      }
    }
  }

  entries.sort((a, b) => a.timestamp - b.timestamp);
  entries.slice(0, count).forEach(e => localStorage.removeItem(e.key));
}

/** Clear all EPC cache entries */
export function clearEPCCache(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

/** Get cache stats */
export function getCacheStats(): { vin: number; crossref: number; diagram: number; totalBytes: number } {
  let vin = 0, crossref = 0, diagram = 0, totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    const val = localStorage.getItem(key) || '';
    totalBytes += val.length * 2; // rough UTF-16 estimate
    if (key.includes('vin_decode')) vin++;
    else if (key.includes('oem_crossref')) crossref++;
    else if (key.includes('diagram')) diagram++;
  }
  return { vin, crossref, diagram, totalBytes };
}
