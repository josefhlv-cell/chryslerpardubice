// IndexedDB Offline Cache for sessions, decoder maps, and DTC history
// Works without network — all data persists locally

const DB_NAME = 'chrysler-obd-cache';
const DB_VERSION = 1;

interface CacheStores {
  sessions: 'sessions';
  decoderMaps: 'decoderMaps';
  dtcHistory: 'dtcHistory';
  codingBackups: 'codingBackups';
  settings: 'settings';
}

const STORES: CacheStores = {
  sessions: 'sessions',
  decoderMaps: 'decoderMaps',
  dtcHistory: 'dtcHistory',
  codingBackups: 'codingBackups',
  settings: 'settings',
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.sessions)) {
        db.createObjectStore(STORES.sessions, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.decoderMaps)) {
        db.createObjectStore(STORES.decoderMaps, { keyPath: 'did' });
      }
      if (!db.objectStoreNames.contains(STORES.dtcHistory)) {
        db.createObjectStore(STORES.dtcHistory, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.codingBackups)) {
        db.createObjectStore(STORES.codingBackups, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.settings)) {
        db.createObjectStore(STORES.settings, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// ─── Generic CRUD ───

async function put<T>(store: string, data: T): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(data);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function get<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => { db.close(); resolve(req.result as T | undefined); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => { db.close(); resolve(req.result as T[]); };
    req.onerror = () => { db.close(); reject(req.error); };
  });
}

async function remove(store: string, key: IDBValidKey): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

async function clear(store: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// ─── Session Storage ───

export interface CachedSession {
  id: string;
  timestamp: number;
  duration: number;
  vehicle: string;
  dataPoints: number;
  liveSensorSnapshots: Record<string, number[]>;
  discoveredDIDs: number[];
  notes: string;
}

export const sessionCache = {
  save: (session: CachedSession) => put(STORES.sessions, session),
  load: (id: string) => get<CachedSession>(STORES.sessions, id),
  loadAll: () => getAll<CachedSession>(STORES.sessions),
  remove: (id: string) => remove(STORES.sessions, id),
  clear: () => clear(STORES.sessions),
};

// ─── Decoder Map Storage ───

export interface CachedDecoderEntry {
  did: number;
  name: string;
  bytes: number;
  type: string | null;
  scaling: number | null;
  offset: number;
  unit: string;
  byteLabels: Record<number, string>;
  confidence: number;
  source: 'manual' | 'ai' | 'correlation';
  lastUpdated: number;
}

export const decoderCache = {
  save: (entry: CachedDecoderEntry) => put(STORES.decoderMaps, entry),
  load: (did: number) => get<CachedDecoderEntry>(STORES.decoderMaps, did),
  loadAll: () => getAll<CachedDecoderEntry>(STORES.decoderMaps),
  remove: (did: number) => remove(STORES.decoderMaps, did),
  clear: () => clear(STORES.decoderMaps),

  async merge(entries: CachedDecoderEntry[]): Promise<number> {
    let merged = 0;
    for (const entry of entries) {
      const existing = await this.load(entry.did);
      if (!existing || entry.confidence > existing.confidence || entry.lastUpdated > existing.lastUpdated) {
        await this.save(entry);
        merged++;
      }
    }
    return merged;
  },
};

// ─── DTC History Storage ───

export interface CachedDTCSession {
  id: string;
  timestamp: number;
  codes: { code: string; severity: string; description: string }[];
  clearedCodes: string[];
}

export const dtcCache = {
  save: (session: CachedDTCSession) => put(STORES.dtcHistory, session),
  load: (id: string) => get<CachedDTCSession>(STORES.dtcHistory, id),
  loadAll: () => getAll<CachedDTCSession>(STORES.dtcHistory),
  remove: (id: string) => remove(STORES.dtcHistory, id),
  clear: () => clear(STORES.dtcHistory),
};

// ─── Coding Backup Storage ───

export interface CachedCodingBackup {
  id: string;
  timestamp: number;
  did: number;
  previousValue: number;
  newValue: number;
  success: boolean;
  rolledBack: boolean;
}

export const codingBackupCache = {
  save: (backup: CachedCodingBackup) => put(STORES.codingBackups, backup),
  load: (id: string) => get<CachedCodingBackup>(STORES.codingBackups, id),
  loadAll: () => getAll<CachedCodingBackup>(STORES.codingBackups),
  remove: (id: string) => remove(STORES.codingBackups, id),
  clear: () => clear(STORES.codingBackups),
};

// ─── Settings Storage ───

export const settingsCache = {
  set: (key: string, value: unknown) => put(STORES.settings, { key, value }),
  get: async <T>(key: string): Promise<T | undefined> => {
    const entry = await get<{ key: string; value: T }>(STORES.settings, key);
    return entry?.value;
  },
  remove: (key: string) => remove(STORES.settings, key),
};

// ─── Export / Import Full Cache ───

export async function exportFullCache(): Promise<string> {
  const [sessions, decoders, dtcs, backups] = await Promise.all([
    sessionCache.loadAll(),
    decoderCache.loadAll(),
    dtcCache.loadAll(),
    codingBackupCache.loadAll(),
  ]);
  return JSON.stringify({ sessions, decoders, dtcs, backups, exportedAt: Date.now() }, null, 2);
}

export async function importFullCache(json: string): Promise<{ sessions: number; decoders: number; dtcs: number; backups: number }> {
  const data = JSON.parse(json);
  const counts = { sessions: 0, decoders: 0, dtcs: 0, backups: 0 };

  if (data.sessions) {
    for (const s of data.sessions) { await sessionCache.save(s); counts.sessions++; }
  }
  if (data.decoders) {
    counts.decoders = await decoderCache.merge(data.decoders);
  }
  if (data.dtcs) {
    for (const d of data.dtcs) { await dtcCache.save(d); counts.dtcs++; }
  }
  if (data.backups) {
    for (const b of data.backups) { await codingBackupCache.save(b); counts.backups++; }
  }
  return counts;
}

// ─── Cache Stats ───

export async function getCacheStats(): Promise<{ sessions: number; decoders: number; dtcs: number; backups: number }> {
  const [sessions, decoders, dtcs, backups] = await Promise.all([
    sessionCache.loadAll(),
    decoderCache.loadAll(),
    dtcCache.loadAll(),
    codingBackupCache.loadAll(),
  ]);
  return {
    sessions: sessions.length,
    decoders: decoders.length,
    dtcs: dtcs.length,
    backups: backups.length,
  };
}
