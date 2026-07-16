import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, ShieldAlert, Info, FileText, Database } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  loadWowProtocolCatalog,
  loadWowHelpIndex,
  evaluateWowElmCompatibility,
  type WowProtocolRecord,
  type WowHelpRecord,
} from "@/lib/delphi/wow";

type CatalogState = {
  loading: boolean;
  error: string | null;
  total: number;
  systems: string[];
  helpCount: number;
};

function stateLabel(state: "metadata" | "candidate" | "blocked"): { label: string; className: string } {
  if (state === "candidate")
    return {
      label: "Kandidát – vyžaduje ověření",
      className: "border-amber-400 bg-amber-50 text-amber-900",
    };
  if (state === "blocked")
    return {
      label: "Vyžaduje Delphi CDP+/Snooper",
      className: "border-rose-400 bg-rose-50 text-rose-900",
    };
  return {
    label: "Pouze technická dokumentace",
    className: "border-slate-400 bg-slate-100 text-slate-800",
  };
}

export default function AdminDelphiWow() {
  const [meta, setMeta] = useState<CatalogState>({
    loading: true,
    error: null,
    total: 0,
    systems: [],
    helpCount: 0,
  });
  const [system, setSystem] = useState("");
  const [protocol, setProtocol] = useState("");
  const [rows, setRows] = useState<WowProtocolRecord[]>([]);
  const [help, setHelp] = useState<WowHelpRecord[]>([]);
  const [helpQuery, setHelpQuery] = useState("");
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [catalog, helpIdx] = await Promise.all([
          loadWowProtocolCatalog(),
          loadWowHelpIndex().catch(() => ({ records: [] as WowHelpRecord[] })),
        ]);
        if (cancelled) return;
        const systems = Array.from(
          new Set(
            catalog.records
              .map((r) => r.systemName?.trim())
              .filter((s): s is string => Boolean(s)),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setMeta({
          loading: false,
          error: null,
          total: catalog.recordCount,
          systems,
          helpCount: helpIdx.records.length,
        });
        setHelp(helpIdx.records);
      } catch (e) {
        if (cancelled) return;
        setMeta({
          loading: false,
          error: (e as Error).message,
          total: 0,
          systems: [],
          helpCount: 0,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runSearch() {
    setSearching(true);
    try {
      const { findWowProtocols } = await import("@/lib/delphi/wow");
      const results = await findWowProtocols({
        system: system || undefined,
        protocol: protocol || undefined,
        limit: 300,
      });
      setRows(results);
    } finally {
      setSearching(false);
    }
  }

  const helpResults = useMemo(() => {
    const q = helpQuery.trim().toLowerCase();
    if (!q) return help.slice(0, 40);
    return help
      .filter((h) => `${h.title} ${h.fileName} ${h.tags.join(" ")}`.toLowerCase().includes(q))
      .slice(0, 80);
  }, [help, helpQuery]);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
        <div className="flex items-start gap-2">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <div>
            <p className="font-semibold">WOW/Würth katalog – pouze metadata</p>
            <p className="mt-1">
              Data pocházejí z reálných zdrojů <code>mid_prot_overview.csv</code> a <code>ac_diagnosis_module.zip</code>.
              Žádná servisní funkce z tohoto katalogu <strong>není povolena ke spuštění</strong> – WOW protokoly
              vyžadují ověřenou sekvenci bytů, ECU adresu, transport a bezpečnostní podmínky, které nejsou v CSV obsaženy.
              Ověřené a spustitelné funkce zůstávají v hlavním Delphi runneru výše.
            </p>
          </div>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Database className="h-4 w-4 text-primary" />
            <span>Prohlížeč WOW protokolů</span>
            {meta.loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : meta.error ? (
              <Badge variant="destructive">Chyba: {meta.error}</Badge>
            ) : (
              <Badge variant="secondary">
                {meta.total.toLocaleString("cs")} záznamů · {meta.systems.length} systémů
              </Badge>
            )}
          </div>

          <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
            <div>
              <Label className="text-xs">Systém (např. Airbag, ABS, Gearbox)</Label>
              <Input
                value={system}
                onChange={(e) => setSystem(e.target.value)}
                placeholder="obsahuje…"
                disabled={meta.loading}
              />
            </div>
            <div>
              <Label className="text-xs">Protokol / ECU (např. eobd, vpw, j1962)</Label>
              <Input
                value={protocol}
                onChange={(e) => setProtocol(e.target.value)}
                placeholder="obsahuje…"
                disabled={meta.loading}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={runSearch} disabled={meta.loading || searching} className="w-full sm:w-auto">
                {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                <span className="ml-2">Hledat</span>
              </Button>
            </div>
          </div>

          <div className="max-h-[420px] overflow-y-auto rounded border">
            {rows.length === 0 ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {meta.loading
                  ? "Načítám WOW katalog…"
                  : "Zadejte filtr a stiskněte Hledat. Zobrazí se max. 300 záznamů."}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="p-2 text-left">Systém</th>
                    <th className="p-2 text-left">Roky</th>
                    <th className="p-2 text-left">Protokol</th>
                    <th className="p-2 text-left">ECU</th>
                    <th className="p-2 text-left">Stav pro ELM/Vgate</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const decision = evaluateWowElmCompatibility(r);
                    const s = stateLabel(decision.state);
                    return (
                      <tr key={r.id} className="border-t align-top">
                        <td className="p-2">
                          <div className="font-medium">{r.systemName || "—"}</div>
                          {r.systemVariant ? (
                            <div className="text-muted-foreground">{r.systemVariant}</div>
                          ) : null}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          {r.startYear || "?"}–{r.endYear || "?"}
                        </td>
                        <td className="p-2 font-mono text-[10px]">
                          {r.obdProtocol || r.diagnosisProtocol || r.eobdProtocol || "—"}
                        </td>
                        <td className="p-2 font-mono text-[10px]">{r.ecuObd || "—"}</td>
                        <td className="p-2">
                          <Badge variant="outline" className={s.className}>
                            {s.label}
                          </Badge>
                          <div className="mt-1 text-[10px] text-muted-foreground">{decision.reason}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            <span>Technická nápověda (WOW help)</span>
            <Badge variant="secondary">{meta.helpCount.toLocaleString("cs")} dokumentů</Badge>
          </div>
          <Input
            value={helpQuery}
            onChange={(e) => setHelpQuery(e.target.value)}
            placeholder="Hledat v názvech (např. adaption, activation, dpf, egr)…"
          />
          <div className="max-h-72 overflow-y-auto rounded border divide-y">
            {helpResults.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">Žádné dokumenty.</div>
            ) : (
              helpResults.map((h) => (
                <div key={h.id} className="p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Info className="h-3 w-3 text-muted-foreground" />
                    <span className="font-medium">{h.title || h.fileName}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-1 text-[10px] text-muted-foreground">
                    <span className="font-mono">{h.fileName}</span>
                    {h.tags.map((t) => (
                      <Badge key={t} variant="outline" className="h-4 px-1 py-0 text-[9px]">
                        {t}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">
            Zobrazuje se pouze index (název, tagy, zdrojový soubor). Obsah HTML dokumentů se do bundlu nepřidává.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export const AdminDelphiWowLazy = lazy(() => import("./AdminDelphiWow"));

export function AdminDelphiWowSection() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Načítám WOW modul…
        </div>
      }
    >
      <AdminDelphiWowLazy />
    </Suspense>
  );
}
