import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Gauge, Loader2, Pause, Play, Square, StopCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  runDiagFunction,
  translateLabel,
  resolveSystemGroup,
  SYSTEM_GROUP_ORDER,
  type SystemGroupKey,
} from "@/lib/delphi";
import type { ActiveDiagContext, DiagFunction } from "@/lib/delphi";

type Status = "idle" | "ok" | "no_data" | "error" | "timeout" | "nrc";
type Sample = { value: string; unit: string; status: Status; updatedAt: number | null; durationMs: number | null };

type Props = {
  liveFunctions: DiagFunction[];
  activeContext: ActiveDiagContext | null;
  transportReady: boolean;
  vehicleSelected: boolean;
  ecuSelected: boolean;
  /** Bumping this number stops polling and clears samples (used on vehicle/ECU change). */
  resetKey: number;
};

const MAX_SELECTED = 12;

function normalizeAddress(v?: string) {
  return (v || "").replace(/^0x/i, "").replace(/\s+/g, "").toUpperCase();
}

function formatValue(value: unknown): { value: string; unit: string } {
  if (value === null || value === undefined || value === "") return { value: "—", unit: "" };
  if (typeof value === "number") return { value: Number.isInteger(value) ? String(value) : value.toFixed(2), unit: "" };
  if (typeof value === "boolean") return { value: value ? "ON" : "OFF", unit: "" };
  return { value: String(value), unit: "" };
}

/** Czech label from catalog (name + description), translated if English. */
function czechLabel(fn: DiagFunction): string {
  const desc = (fn.description || "").trim();
  const base = desc && !/^[A-Z0-9_]+$/.test(desc) ? desc : fn.name;
  return translateLabel(base);
}

export function LiveDataPanel({
  liveFunctions,
  activeContext,
  transportReady,
  vehicleSelected,
  ecuSelected,
  resetKey,
}: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [samples, setSamples] = useState<Map<string, Sample>>(new Map());
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [loopCount, setLoopCount] = useState(0);
  const [filter, setFilter] = useState("");
  const stopRef = useRef(false);
  const pauseRef = useRef(false);

  // Vehicle/ECU change → stop everything, clear samples.
  useEffect(() => {
    stopRef.current = true;
    setRunning(false);
    setPaused(false);
    setSamples(new Map());
    setSelected(new Set());
    setLoopCount(0);
  }, [resetKey]);

  // Transport lost → stop.
  useEffect(() => {
    if (!transportReady && running) {
      stopRef.current = true;
      setRunning(false);
      setPaused(false);
    }
  }, [transportReady, running]);

  useEffect(() => { pauseRef.current = paused; }, [paused]);

  const ecuAddr = normalizeAddress(activeContext?.ecuAddress);

  const applicable = useMemo(() => {
    // Only PIDs the current ECU (or "all") can answer.
    const q = filter.trim().toLocaleLowerCase("cs");
    return liveFunctions.filter((fn) => {
      if (!["live_pid", "obd2_pid", "did"].includes(fn.kind)) return false;
      if (ecuAddr && fn.ecuAddress) {
        if (normalizeAddress(fn.ecuAddress) !== ecuAddr) return false;
      }
      if (!q) return true;
      return `${fn.name} ${fn.description || ""} ${fn.category || ""}`.toLocaleLowerCase("cs").includes(q);
    });
  }, [liveFunctions, ecuAddr, filter]);

  const groupedBySystem = useMemo(() => {
    const map = new Map<SystemGroupKey, { label: string; order: number; fns: DiagFunction[] }>();
    for (const fn of applicable) {
      const g = resolveSystemGroup(fn);
      const bucket = map.get(g.key) || { label: g.label, order: g.order, fns: [] };
      bucket.fns.push(fn);
      map.set(g.key, bucket);
    }
    const orderIndex = new Map(SYSTEM_GROUP_ORDER.map((k, i) => [k, i]));
    return [...map.entries()]
      .sort(([a], [b]) => (orderIndex.get(a) ?? 99) - (orderIndex.get(b) ?? 99))
      .map(([key, v]) => ({ key, label: v.label, fns: v.fns }));
  }, [applicable]);

  const canOperate = vehicleSelected && ecuSelected && transportReady;
  const disabledReason = !vehicleSelected
    ? "Nejdřív vyber vozidlo (značka → model → rok → motor)."
    : !ecuSelected
      ? "Nejdřív vyber konkrétní řídicí jednotku (ne „Všechny systémy“)."
      : !transportReady
        ? "Připoj OBD zdroj v kroku 0."
        : null;

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < MAX_SELECTED) next.add(id);
      return next;
    });
  };

  const selectAll = (fns: DiagFunction[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const fn of fns) {
        if (next.size >= MAX_SELECTED) break;
        next.add(fn.id);
      }
      return next;
    });
  };

  const start = useCallback(() => {
    if (!canOperate || selected.size === 0) return;
    stopRef.current = false;
    pauseRef.current = false;
    setPaused(false);
    setRunning(true);
  }, [canOperate, selected.size]);

  const stop = () => {
    stopRef.current = true;
    setRunning(false);
    setPaused(false);
  };

  // Poll loop: only the selected IDs, sequential, respects pause.
  useEffect(() => {
    if (!running) return;
    let cancelled = false;
    const idList = [...selected];

    (async () => {
      while (!cancelled && !stopRef.current) {
        for (const id of idList) {
          if (cancelled || stopRef.current) break;
          while (pauseRef.current && !cancelled && !stopRef.current) {
            await new Promise((r) => setTimeout(r, 200));
          }
          if (cancelled || stopRef.current) break;
          const fn = liveFunctions.find((f) => f.id === id);
          if (!fn) continue;
          try {
            const res = await runDiagFunction(fn, { activeContext, vin: activeContext?.vin || null });
            if (cancelled || stopRef.current) break;
            const first = res.decoded?.[0];
            const formatted = first ? formatValue(first.value) : { value: "—", unit: "" };
            const unit = (first?.unit ?? formatted.unit) || "";
            setSamples((prev) => {
              const next = new Map(prev);
              next.set(id, {
                value: formatted.value,
                unit,
                status: res.status as Status,
                updatedAt: Date.now(),
                durationMs: res.durationMs,
              });
              return next;
            });
          } catch {
            setSamples((prev) => {
              const next = new Map(prev);
              const cur = next.get(id);
              next.set(id, { value: cur?.value ?? "—", unit: cur?.unit ?? "", status: "error", updatedAt: Date.now(), durationMs: cur?.durationMs ?? null });
              return next;
            });
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        setLoopCount((n) => n + 1);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [running, selected, liveFunctions, activeContext]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-500 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-blue-700" />
          <h3 className="text-base font-black text-slate-950">Živá data (ruční výběr)</h3>
          <Badge variant="outline" className="border-slate-400 text-slate-700">
            {selected.size}/{MAX_SELECTED} · smyčka #{loopCount}
          </Badge>
        </div>
        <div className="flex flex-wrap gap-2">
          {!running ? (
            <Button size="sm" onClick={start} disabled={!canOperate || selected.size === 0} className="bg-emerald-700 hover:bg-emerald-600">
              <Play className="mr-1 h-4 w-4" /> Start
            </Button>
          ) : paused ? (
            <Button size="sm" onClick={() => setPaused(false)} className="bg-emerald-700 hover:bg-emerald-600">
              <Play className="mr-1 h-4 w-4" /> Pokračovat
            </Button>
          ) : (
            <Button size="sm" onClick={() => setPaused(true)} className="bg-amber-600 hover:bg-amber-500">
              <Pause className="mr-1 h-4 w-4" /> Pauza
            </Button>
          )}
          <Button size="sm" onClick={stop} disabled={!running} variant="outline" className="border-slate-500">
            <StopCircle className="mr-1 h-4 w-4" /> Stop
          </Button>
          <Button size="sm" onClick={() => { setSelected(new Set()); setSamples(new Map()); }} disabled={running} variant="ghost">
            <Square className="mr-1 h-4 w-4" /> Vyčistit výběr
          </Button>
        </div>
      </div>

      {disabledReason && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">{disabledReason}</p>
      )}

      <Input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filtrovat parametry (např. teplota, převodovka, tlak)…"
        className="border-slate-400 bg-white text-slate-950"
      />

      <Group
        title="OEM parametry (výrobce)"
        color="border-blue-400 bg-blue-50 text-blue-900"
        fns={groupOem}
        selected={selected}
        samples={samples}
        onToggle={toggle}
        onSelectAll={() => selectAll(groupOem)}
      />
      <Group
        title="Obecné OBD-II parametry"
        color="border-emerald-400 bg-emerald-50 text-emerald-900"
        fns={groupGeneric}
        selected={selected}
        samples={samples}
        onToggle={toggle}
        onSelectAll={() => selectAll(groupGeneric)}
      />

      {running && (
        <p className="flex items-center gap-2 text-xs text-slate-600">
          <Loader2 className="h-3 w-3 animate-spin" /> Dotazuji vybrané parametry ({selected.size}). Ostatní PIDy nejsou aktivní.
        </p>
      )}
    </div>
  );
}

function Group({
  title, color, fns, selected, samples, onToggle, onSelectAll,
}: {
  title: string; color: string; fns: DiagFunction[]; selected: Set<string>; samples: Map<string, Sample>;
  onToggle: (id: string) => void; onSelectAll: () => void;
}) {
  if (fns.length === 0) return null;
  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-2">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-[11px] font-bold ${color}`}>{title} · {fns.length}</p>
        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onSelectAll}>Přidat vše (limit)</Button>
      </div>
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
        {fns.map((fn) => {
          const isSel = selected.has(fn.id);
          const s = samples.get(fn.id);
          const stale = s?.updatedAt ? Date.now() - s.updatedAt > 4000 : false;
          const bad = s?.status === "no_data" || s?.status === "error" || s?.status === "timeout" || s?.status === "nrc";
          return (
            <button
              type="button"
              key={fn.id}
              onClick={() => onToggle(fn.id)}
              className={`flex min-w-0 items-start gap-2 rounded border p-2 text-left transition ${
                isSel ? "border-blue-600 bg-white ring-1 ring-blue-500" : "border-slate-300 bg-white hover:bg-slate-50"
              }`}
            >
              <input type="checkbox" checked={isSel} readOnly className="mt-1 accent-blue-600" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[11px] font-bold uppercase text-slate-700">{czechLabel(fn)}</p>
                <p className="mt-1 flex items-baseline gap-1">
                  <span className={`text-lg font-black tabular-nums ${bad ? "text-amber-800" : stale ? "text-slate-500" : "text-slate-950"}`}>
                    {s?.value ?? "—"}
                  </span>
                  {s?.unit && <span className="text-xs font-bold text-slate-700">{s.unit}</span>}
                </p>
                <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    {s?.durationMs ? `${s.durationMs} ms` : "—"}
                  </span>
                  <span className="uppercase">{s?.status ?? "idle"}</span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
