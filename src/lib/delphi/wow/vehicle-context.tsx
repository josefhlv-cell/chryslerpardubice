import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

/** Persistent active vehicle context for the WOW/Delphi documentation browser. */
export type WowActiveVehicle = {
  make: string | null;
  model: string | null;
  generation: string | null;
  year: number | null;
  engineCode: string | null;
  engineName: string | null;
  transmission: string | null;
  drivetrain: string | null;
};

export const EMPTY_VEHICLE: WowActiveVehicle = {
  make: null,
  model: null,
  generation: null,
  year: null,
  engineCode: null,
  engineName: null,
  transmission: null,
  drivetrain: null,
};

const STORAGE_KEY = "delphi.wow.activeVehicle.v1";
const DOC_STORAGE_KEY = "delphi.wow.selectedDocId.v1";
const HISTORY_KEY = "delphi.wow.vehicleHistory.v1";

export type WowVehicleHistory = {
  makes: string[];
  models: Record<string, string[]>;
  generations: Record<string, string[]>;
  engines: Record<string, string[]>;
  transmissions: string[];
  drivetrains: string[];
};

const EMPTY_HISTORY: WowVehicleHistory = {
  makes: [], models: {}, generations: {}, engines: {}, transmissions: [], drivetrains: [],
};

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(key) : null;
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
}

function writeJSON(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

/** Which selector levels get invalidated when a higher level changes. */
const RESET_CASCADE: Record<keyof WowActiveVehicle, (keyof WowActiveVehicle)[]> = {
  make:        ["model", "generation", "year", "engineCode", "engineName", "transmission", "drivetrain"],
  model:       ["generation", "year", "engineCode", "engineName", "transmission", "drivetrain"],
  generation:  ["year", "engineCode", "engineName", "transmission", "drivetrain"],
  year:        ["engineCode", "engineName", "transmission", "drivetrain"],
  engineCode:  ["transmission", "drivetrain"],
  engineName:  ["transmission", "drivetrain"],
  transmission: [],
  drivetrain:  [],
};

interface WowVehicleContextValue {
  vehicle: WowActiveVehicle;
  history: WowVehicleHistory;
  setField: <K extends keyof WowActiveVehicle>(key: K, value: WowActiveVehicle[K]) => void;
  resetVehicle: () => void;
  selectedDocId: string | null;
  setSelectedDocId: (id: string | null) => void;
  /** true when vehicle changed and any previously opened document was cleared. */
  invalidatedDocOnce: number;
}

const Ctx = createContext<WowVehicleContextValue | null>(null);

export function WowVehicleProvider({ children }: { children: ReactNode }) {
  const [vehicle, setVehicle] = useState<WowActiveVehicle>(() => ({ ...EMPTY_VEHICLE, ...readJSON(STORAGE_KEY, {}) }));
  const [history, setHistory] = useState<WowVehicleHistory>(() => ({ ...EMPTY_HISTORY, ...readJSON(HISTORY_KEY, {}) }));
  const [selectedDocId, setSelectedDocIdState] = useState<string | null>(() => readJSON<string | null>(DOC_STORAGE_KEY, null));
  const [invalidatedDocOnce, bumpInvalidated] = useState(0);

  useEffect(() => { writeJSON(STORAGE_KEY, vehicle); }, [vehicle]);
  useEffect(() => { writeJSON(HISTORY_KEY, history); }, [history]);
  useEffect(() => { writeJSON(DOC_STORAGE_KEY, selectedDocId); }, [selectedDocId]);

  const setField = useCallback(<K extends keyof WowActiveVehicle>(key: K, value: WowActiveVehicle[K]) => {
    setVehicle((prev) => {
      const next: WowActiveVehicle = { ...prev, [key]: value };
      for (const k of RESET_CASCADE[key]) (next as any)[k] = null;
      return next;
    });
    // Any change above the document invalidates the currently opened one.
    setSelectedDocIdState((prev) => (prev ? (bumpInvalidated((n) => n + 1), null) : prev));
    // Record history so future selectors can offer previously used values.
    setHistory((h) => rememberHistory(h, key, value));
  }, []);

  const resetVehicle = useCallback(() => {
    setVehicle(EMPTY_VEHICLE);
    setSelectedDocIdState(null);
  }, []);

  const setSelectedDocId = useCallback((id: string | null) => setSelectedDocIdState(id), []);

  const value = useMemo<WowVehicleContextValue>(() => ({
    vehicle, history, setField, resetVehicle, selectedDocId, setSelectedDocId, invalidatedDocOnce,
  }), [vehicle, history, setField, resetVehicle, selectedDocId, setSelectedDocId, invalidatedDocOnce]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWowVehicle(): WowVehicleContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useWowVehicle must be used inside WowVehicleProvider");
  return v;
}

function rememberHistory<K extends keyof WowActiveVehicle>(h: WowVehicleHistory, key: K, value: WowActiveVehicle[K]): WowVehicleHistory {
  const v = (value ?? "").toString().trim();
  if (!v) return h;
  const push = (arr: string[]) => (arr.includes(v) ? arr : [v, ...arr].slice(0, 50));
  const scoped = (map: Record<string, string[]>, scope: string | null) => {
    if (!scope) return map;
    const list = map[scope] || [];
    if (list.includes(v)) return map;
    return { ...map, [scope]: [v, ...list].slice(0, 50) };
  };
  switch (key) {
    case "make": return { ...h, makes: push(h.makes) };
    case "model": return { ...h, models: scoped(h.models, null) };
    case "generation": return { ...h, generations: scoped(h.generations, null) };
    case "engineCode":
    case "engineName": return { ...h, engines: scoped(h.engines, null) };
    case "transmission": return { ...h, transmissions: push(h.transmissions) };
    case "drivetrain": return { ...h, drivetrains: push(h.drivetrains) };
    default: return h;
  }
}
