import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Pause, Play, Gauge, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { runDiagFunction, translateLabel } from "@/lib/delphi";
import type { ActiveDiagContext, DiagFunction } from "@/lib/delphi";

type Sample = {
  fn: DiagFunction;
  label: string;
  value: string;
  unit: string;
  status: "idle" | "ok" | "no_data" | "error" | "timeout";
  updatedAt: number | null;
  durationMs: number | null;
};

/**
 * Priority patterns for a compact "Delphi/Autocom-style" live dashboard.
 * We look for the FIRST live function whose name matches each pattern.
 */
const PRIORITY: Array<{ key: string; label: string; patterns: RegExp[] }> = [
  { key: "rpm", label: "Otáčky motoru", patterns: [/rpm/i, /ot[áa][čc]ky/i, /engine speed/i] },
  { key: "speed", label: "Rychlost", patterns: [/vehicle speed/i, /rychlost/i, /\bspeed\b/i] },
  { key: "coolant", label: "Teplota chladicí kap.", patterns: [/coolant/i, /chladic/i, /ect/i] },
  { key: "iat", label: "Teplota nasávaného vzduchu", patterns: [/intake air/i, /nas[áa]van/i, /\biat\b/i] },
  { key: "load", label: "Zatížení motoru", patterns: [/engine load/i, /zat[íi][žz]en/i, /\bload\b/i] },
  { key: "throttle", label: "Poloha plynu", patterns: [/throttle/i, /plyn/i, /pedal/i] },
  { key: "maf", label: "Průtok vzduchu (MAF)", patterns: [/\bmaf\b/i, /mass air/i, /pr[uů]tok/i] },
  { key: "map", label: "Tlak sání (MAP)", patterns: [/\bmap\b/i, /manifold pressure/i, /tlak s[áa]n/i] },
  { key: "batt", label: "Napětí baterie", patterns: [/battery/i, /baterie/i, /control module voltage/i, /nap[ěe]t[íi]/i] },
  { key: "trans_temp", label: "Teplota převodovky", patterns: [/trans.*temp/i, /gearbox.*temp/i, /p[řr]evodovk/i] },
  { key: "oil_temp", label: "Teplota oleje", patterns: [/oil temp/i, /engine oil/i, /olej/i] },
  { key: "oil_press", label: "Tlak oleje", patterns: [/oil press/i, /tlak oleje/i] },
  { key: "fuel_trim_s", label: "Krátkodobá korekce", patterns: [/short.*fuel.*trim/i, /str[ií]dav[áa].*korekc/i] },
  { key: "fuel_trim_l", label: "Dlouhodobá korekce", patterns: [/long.*fuel.*trim/i, /dlouhodob[áa].*korekc/i] },
  { key: "timing", label: "Předstih", patterns: [/timing advance/i, /p[řr]edstih/i] },
  { key: "fuel_press", label: "Tlak paliva", patterns: [/fuel press/i, /tlak paliva/i] },
];

function pickTopFunctions(liveFunctions: DiagFunction[]) {
  const chosen: Array<{ fn: DiagFunction; label: string }> = [];
  const used = new Set<string>();

  for (const spec of PRIORITY) {
    const found = liveFunctions.find(
      (fn) => !used.has(fn.id) && spec.patterns.some((r) => r.test(fn.name || "")),
    );
    if (found) {
      used.add(found.id);
      chosen.push({ fn: found, label: spec.label });
    }
  }

  // Doplníme na alespoň 6 položek prvními dostupnými živými parametry, aby dashboard neby prázdný.
  for (const fn of liveFunctions) {
    if (chosen.length >= 8) break;
    if (used.has(fn.id)) continue;
    used.add(fn.id);
    chosen.push({ fn, label: fn.name });
  }

  return chosen.slice(0, 8);
}

function formatValue(value: unknown): { value: string; unit: string } {
  if (value === null || value === undefined || value === "") return { value: "—", unit: "" };
  if (typeof value === "number") {
    return { value: Number.isInteger(value) ? String(value) : value.toFixed(1), unit: "" };
  }
  return { value: String(value), unit: "" };
}

export function LiveDashboard({
  liveFunctions,
  activeContext,
  transportReady,
}: {
  liveFunctions: DiagFunction[];
  activeContext: ActiveDiagContext | null;
  transportReady: boolean;
}) {
  const [running, setRunning] = useState(false);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [loopCounter, setLoopCounter] = useState(0);
  const stopRef = useRef(false);

  const picks = useMemo(() => pickTopFunctions(liveFunctions), [liveFunctions]);

  useEffect(() => {
    setSamples(
      picks.map(({ fn, label }) => ({
        fn,
        label,
        value: "—",
        unit: "",
        status: "idle",
        updatedAt: null,
        durationMs: null,
      })),
    );
  }, [picks]);

  // Zastav auto-poll, pokud transport odpadne.
  useEffect(() => {
    if (!transportReady && running) {
      stopRef.current = true;
      setRunning(false);
    }
  }, [transportReady, running]);

  // Poll loop
  useEffect(() => {
    if (!running || picks.length === 0) return;

    stopRef.current = false;
    let cancelled = false;

    (async () => {
      while (!cancelled && !stopRef.current) {
        for (let i = 0; i < picks.length; i += 1) {
          if (cancelled || stopRef.current) break;
          const { fn, label } = picks[i];
          try {
            const res = await runDiagFunction(fn, { activeContext, vin: activeContext?.vin || null });
            if (cancelled || stopRef.current) break;

            const first = res.decoded?.[0];
            const formatted = first ? formatValue(first.value) : { value: "—", unit: "" };
            const unit = (first?.unit ?? formatted.unit) || "";

            setSamples((prev) => {
              const next = prev.slice();
              next[i] = {
                fn,
                label,
                value: formatted.value,
                unit,
                status: res.status as Sample["status"],
                updatedAt: Date.now(),
                durationMs: res.durationMs,
              };
              return next;
            });
          } catch {
            setSamples((prev) => {
              const next = prev.slice();
              next[i] = { ...next[i], status: "error", updatedAt: Date.now() };
              return next;
            });
          }

          // Krátká pauza mezi PIDy, ať queue nezablokujeme.
          await new Promise((r) => setTimeout(r, 40));
        }
        setLoopCounter((n) => n + 1);
      }
    })();

    return () => {
      cancelled = true;
      stopRef.current = true;
    };
  }, [running, picks, activeContext]);

  if (picks.length === 0) {
    return (
      <div className="rounded-lg border border-slate-300 bg-white p-4 text-sm text-slate-600">
        Pro tuto ECU/značku katalog neobsahuje žádné živé parametry.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-slate-500 bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-blue-700" />
          <h3 className="text-base font-black text-slate-950">Live dashboard</h3>
          <Badge variant="outline" className="border-slate-400 text-slate-700">
            {picks.length} PID · smyčka #{loopCounter}
          </Badge>
        </div>
        <Button
          size="sm"
          onClick={() => setRunning((v) => !v)}
          disabled={!transportReady}
          className={running ? "bg-red-700 hover:bg-red-600" : "bg-emerald-700 hover:bg-emerald-600"}
        >
          {running ? (
            <>
              <Pause className="mr-2 h-4 w-4" /> Zastavit
            </>
          ) : (
            <>
              <Play className="mr-2 h-4 w-4" /> Spustit live
            </>
          )}
        </Button>
      </div>

      {!transportReady && (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          Nejdřív vyber online OBD zdroj (BLE nebo vzdálený zákazník). Live dashboard se pak spustí.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {samples.map((s, index) => {
          const stale = s.updatedAt && Date.now() - s.updatedAt > 4000;
          const bad = s.status === "no_data" || s.status === "error" || s.status === "timeout";
          return (
            <div
              key={`${s.fn.id}-${index}`}
              className={`overflow-hidden rounded-lg border p-2 ${
                bad
                  ? "border-amber-300 bg-amber-50"
                  : s.status === "ok"
                    ? "border-emerald-300 bg-white"
                    : "border-slate-300 bg-white"
              }`}
            >
              <p className="truncate text-[10px] font-bold uppercase text-slate-500">
                {s.label}
              </p>
              <p className="mt-1 flex items-baseline gap-1">
                <span
                  className={`text-2xl font-black tabular-nums ${
                    bad ? "text-amber-800" : stale ? "text-slate-500" : "text-slate-950"
                  }`}
                >
                  {s.value}
                </span>
                {s.unit && (
                  <span className="text-xs font-bold text-slate-600">{s.unit}</span>
                )}
              </p>
              <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                <span className="flex items-center gap-1">
                  <Activity className="h-3 w-3" />
                  {s.durationMs ? `${s.durationMs} ms` : "—"}
                </span>
                <span className="uppercase">{s.status}</span>
              </div>
            </div>
          );
        })}
      </div>

      {running && (
        <p className="flex items-center gap-2 text-xs text-slate-500">
          <Loader2 className="h-3 w-3 animate-spin" />
          Kontinuální dotazování PIDů. Vysoká zátěž ELM327 fronty je řízena interně.
        </p>
      )}
    </div>
  );
}
