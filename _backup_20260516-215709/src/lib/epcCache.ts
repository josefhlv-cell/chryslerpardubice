/**
 * Dual-Layer EPC Cache
 * Layer 1: localStorage (instant, per-device)
 * Layer 2: Supabase api_cache table (shared, persistent)
 * 
 * Flow: localStorage → DB → miss
 * Write-through: saves to both layers on set.
 */

import { supabase } from "@/integrations/supabase/client";

const CACHE_PREFIX = 'epc_cache_';

// TTL in seconds for DB, milliseconds for localStorage
const TTL = {
  vin_decode: { ms: 7 * 24 * 60 * 60 * 1000, sec: 7 * 24 * 60 * 60 },
  oem_crossref: { ms: 30 * 24 * 60 * 60 * 1000, sec: 30 * 24 * 60 * 60 },
  diagram: { ms: -1, sec: null }, // permanent
} as const;

export type CacheType = keyof typeof TTL;

interface LocalCacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // ms, -1 = permanent
}

function localKey(type: CacheType, id: string): string {
  return `${CACHE_PREFIX}${type}_${id}`;
}

// ─── Layer 1: localStorage ───

function localGet<T>(type: CacheType, id: string): T | null {
  try {
    const raw = localStorage.getItem(localKey(type, id));
    if (!raw) return null;
    const entry: LocalCacheEntry<T> = JSON.parse(raw);
    const age = Date.now() - entry.timestamp;
    if (entry.ttl !== -1 && age > entry.ttl) {
      localStorage.removeItem(localKey(type, id));
      return null;
    }
    return entry.data;
  } catch {
    return null;
  }
}

function localSet<T>(type: CacheType, id: string, data: T): void {
  try {
    const ttl = TTL[type].ms;
    const entry: LocalCacheEntry<T> = { data, timestamp: Date.now(), ttl };
    localStorage.setItem(localKey(type, id), JSON.stringify(entry));
  } catch {
    evictOldest(type, 5);
    try {
      const ttl = TTL[type].ms;
      const entry: LocalCacheEntry<T> = { data, timestamp: Date.now(), ttl };
      localStorage.setItem(localKey(type, id), JSON.stringify(entry));
    } catch {
      // silently fail
    }
  }
}

// ─── Layer 2: Supabase DB ───

async function dbGet<T>(type: CacheType, id: string): Promise<T | null> {
  try {
    const { data } = await supabase
      .from("api_cache")
      .select("data, created_at, ttl_seconds")
      .eq("cache_type", type)
      .eq("cache_key", id)
      .maybeSingle();

    if (!data) return null;

    // Check TTL
    if (data.ttl_seconds) {
      const age = (Date.now() - new Date(data.created_at).getTime()) / 1000;
      if (age > data.ttl_seconds) {
        // Expired — delete async, return null
        supabase.from("api_cache").delete().eq("cache_type", type).eq("cache_key", id).then(() => {});
        return null;
      }
    }

    return data.data as T;
  } catch {
    return null;
  }
}

async function dbSet<T>(type: CacheType, id: string, data: T): Promise<void> {
  try {
    await supabase
      .from("api_cache")
      .upsert({
        cache_type: type,
        cache_key: id,
        data: data as any,
        ttl_seconds: TTL[type].sec,
        created_at: new Date().toISOString(),
      }, { onConflict: "cache_type,cache_key" });
  } catch {
    // silently fail
  }
}

// ─── Public API (dual-layer) ───

/** Get from cache: localStorage → DB → null */
export async function cacheGet<T>(type: CacheType, id: string): Promise<T | null> {
  // Layer 1
  const local = localGet<T>(type, id);
  if (local !== null) return local;

  // Layer 2
  const db = await dbGet<T>(type, id);
  if (db !== null) {
    // Promote to localStorage
    localSet(type, id, db);
    return db;
  }

  return null;
}

/** Sync version — localStorage only (for non-async contexts) */
export function cacheGetSync<T>(type: CacheType, id: string): T | null {
  return localGet<T>(type, id);
}

/** Write-through to both layers */
export async function cacheSet<T>(type: CacheType, id: string, data: T): Promise<void> {
  localSet(type, id, data);
  await dbSet(type, id, data);
}

/** Sync set — localStorage only */
export function cacheSetSync<T>(type: CacheType, id: string, data: T): void {
  localSet(type, id, data);
  // Fire-and-forget DB write
  dbSet(type, id, data);
}

// ─── Utilities ───

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

/** Clear all EPC cache entries (localStorage only) */
export function clearEPCCache(): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_PREFIX)) toRemove.push(key);
  }
  toRemove.forEach(k => localStorage.removeItem(k));
}

/** Clear all cache (both layers) */
export async function clearAllCache(): Promise<void> {
  clearEPCCache();
  await supabase.from("api_cache").delete().neq("cache_type", "__never__");
}

/** Get cache stats */
export function getCacheStats(): { vin: number; crossref: number; diagram: number; totalBytes: number } {
  let vin = 0, crossref = 0, diagram = 0, totalBytes = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key?.startsWith(CACHE_PREFIX)) continue;
    const val = localStorage.getItem(key) || '';
    totalBytes += val.length * 2;
    if (key.includes('vin_decode')) vin++;
    else if (key.includes('oem_crossref')) crossref++;
    else if (key.includes('diagram')) diagram++;
  }
  return { vin, crossref, diagram, totalBytes };
}
