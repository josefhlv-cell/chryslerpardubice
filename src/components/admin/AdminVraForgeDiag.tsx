/**
 * AdminVraForgeDiag — Delphi-style hierarchical diagnostic console powered
 * by the vendored Delphi-OBD catalogs (46+ manufacturers).
 *
 * Workflow (matches Delphi DS):
 *   1. Brand   (OBD2 + all catalog manufacturers, auto-picked from VIN)
 *   2. System  (ECU — chosen from the brand's ECU list)
 *   3. Function (DID / Live PID / Routine / Actuator / DTC scan)
 *   4. Run     (executes via elmQueue → BLE → ELM327)
 *
 * Admin-only tool — not for customer view.
 */
import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import {
  Play, Search, Copy, FileCode2, ChevronLeft, ChevronRight,
  ShieldAlert, CircleDot, Scan,
} from "lucide-react";
import {
  listBrands, loadBrandFunctions, findBrandForVin,
  runDiagFunction, runRawCommand, buildJsonReport,
} from "@/lib/obd/vraforge-diag";
import type {
  DiagFunction, DiagRunResult, BrandManifestEntry, ActiveDiagContext, FunctionKind,
} from "@/lib/obd/vraforge-diag";
import { bleManager } from "@/lib/obd/ble-manager";
import { getActiveElmProfile } from "@/lib/obd/adapter/elm-init";

type LastAction = { time: string; command: string; name: string; status: string; durationMs: number };
const PAGE_SIZE = 25;

const KIND_LABEL: Record<FunctionKind, string> = {
  obd2_pid: "PID",
  live_pid: "LIVE",
  did: "DID",
  routine: "RUT",
  actuator_test: "AKT",
  dtc_scan: "DTC",
  raw: "RAW",
};

const StatusPill = ({ ok, label }: { ok: boolean; label: string }) => (
  <Badge className={ok ? "bg-green-600/20 text-green-400 border-green-600/40" : "bg-red-600/20 text-red-400 border-red-600/40"}>
    <CircleDot className="w-3 h-3 mr-1" /> {label}
  </Badge>
);

export default function AdminVraForgeDiag() {
  // ---------- Brand / VIN ----------
  const [brands, setBrands] = useState<BrandManifestEntry[]>([]);
  const [brandKey, setBrandKey] = useState<string>("OBD2");
  const [vin, setVin] = useState("");
  const [brandLoading, setBrandLoading] = useState(false);

  // ---------- ECU + functions ----------
  const [functions, setFunctions] = useState<DiagFunction[]>([]);
  const [ecuOptions, setEcuOptions] = useState<{ address: string; name: string; common?: string }[]>([]);
  const [ecuAddress, setEcuAddress] = useState<string>("__all");
  const [kindFilter, setKindFilter] = useState<string>("__all");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<DiagFunction | null>(null);

  // ---------- Runner ----------
  const [result, setResult] = useState<DiagRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [rawCmd, setRawCmd] = useState("");
  const [manualTx, setManualTx] = useState("");
  const [manualRx, setManualRx] = useState("");
  const [confirm, setConfirm] = useState("");
  const [history, setHistory] = useState<LastAction[]>([]);
  const [bleState, setBleState] = useState(bleManager.getState());

  useEffect(() => bleManager.subscribe((e) => { if (e.type === "stateChange") setBleState(e.payload); }), []);

  // Load brand manifest once
  useEffect(() => {
    listBrands()
      .then((bs) => setBrands(bs))
      .catch((e) => toast({ title: "Chyba manifestu", description: String(e), variant: "destructive" }));
  }, []);

  // Load functions when brand changes
  useEffect(() => {
    if (!brandKey) return;
    let cancelled = false;
    setBrandLoading(true);
    loadBrandFunctions(brandKey).then((r) => {
      if (cancelled) return;
      setFunctions(r.functions);
      const uniq = new Map<string, { address: string; name: string; common?: string }>();
      (r.catalog.ecus || []).forEach((e) => uniq.set(e.address, { address: e.address, name: e.name, common: e.common_name }));
      setEcuOptions(Array.from(uniq.values()).sort((a, b) => a.name.localeCompare(b.name)));
      setEcuAddress("__all");
      setKindFilter("__all");
      setCategoryFilter("__all");
      setPage(1);
      setSelected(null);
    }).catch((e) => toast({ title: "Chyba katalogu", description: String(e), variant: "destructive" }))
      .finally(() => !cancelled && setBrandLoading(false));
    return () => { cancelled = true; };
  }, [brandKey]);

  const brand = useMemo(() => brands.find((b) => b.key === brandKey), [brands, brandKey]);
  const activeContext: ActiveDiagContext | null = useMemo(() => {
    if (!brand) return null;
    const ecu = ecuAddress !== "__all" ? ecuOptions.find((e) => e.address === ecuAddress) : undefined;
    return {
      brandKey: brand.key,
      brandLabel: brand.display_name,
      isOem: brand.key !== "OBD2",
      vin: vin || null,
      ecuAddress: ecu?.address,
      ecuName: ecu?.name,
      manualTx: manualTx.trim() || undefined,
      manualRx: manualRx.trim() || undefined,
    };
  }, [brand, ecuAddress, ecuOptions, vin, manualTx, manualRx]);

  const decodeVin = async () => {
    const b = await findBrandForVin(vin);
    if (b) {
      setBrandKey(b.key);
      toast({ title: "Rozpoznáno z VIN", description: b.display_name });
    } else {
      toast({ title: "VIN nerozpoznán", description: "Značka nebyla dohledána v katalogu WMI.", variant: "destructive" });
    }
  };

  const categories = useMemo(() => {
    const set = new Set<string>();
    functions.forEach((f) => {
      if (ecuAddress !== "__all" && f.ecuAddress !== ecuAddress) return;
      if (f.category) set.add(f.category);
    });
    return Array.from(set).sort();
  }, [functions, ecuAddress]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return functions.filter((f) => {
      if (ecuAddress !== "__all" && f.ecuAddress !== ecuAddress && f.kind !== "dtc_scan") return false;
      if (kindFilter !== "__all" && f.kind !== kindFilter) return false;
      if (categoryFilter !== "__all" && f.category !== categoryFilter) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q)
        || (f.description || "").toLowerCase().includes(q)
        || f.command.toLowerCase().includes(q)
        || (f.did || "").toLowerCase().includes(q)
        || (f.routineId || "").toLowerCase().includes(q)
        || (f.ecu || "").toLowerCase().includes(q);
    });
  }, [functions, ecuAddress, kindFilter, categoryFilter, search]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const bleOk = bleState === "connected";
  const elmProfileLabel = getActiveElmProfile() ?? "—";

  const run = async () => {
    if (!selected) return;
    if (selected.destructive) {
      const isEgr = /egr/i.test(selected.name);
      const need = isEgr ? "SPUSTIT EGR" : "SPUSTIT";
      if (confirm !== need) {
        toast({ title: "Vyžadováno potvrzení", description: `Do pole napiš: ${need}`, variant: "destructive" });
        return;
      }
    }
    setRunning(true);
    try {
      const r = await runDiagFunction(selected, { activeContext, vin: vin || null });
      setResult(r);
      setHistory((h) => [{ time: new Date().toLocaleTimeString(), command: r.command, name: selected.name, status: r.status, durationMs: r.durationMs }, ...h].slice(0, 15));
    } finally {
      setRunning(false);
      setConfirm("");
    }
  };

  const runRaw = async () => {
    if (!rawCmd.trim()) return;
    setRunning(true);
    try {
      const r = await runRawCommand(rawCmd.trim(), activeContext, { vin: vin || null });
      setResult(r);
      setHistory((h) => [{ time: new Date().toLocaleTimeString(), command: r.command, name: `RAW ${r.command}`, status: r.status, durationMs: r.durationMs }, ...h].slice(0, 15));
    } finally {
      setRunning(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} zkopírováno` }));
  };

  const jsonReport = result ? JSON.stringify(buildJsonReport(result, { activeContext, vin: vin || null }), null, 2) : "";

  return (
    <div className="space-y-4">
      {/* Breadcrumb */}
      <div className="text-xs text-muted-foreground flex items-center gap-1">
        Admin <ChevronRight className="w-3 h-3" /> Diagnostika <ChevronRight className="w-3 h-3" />
        <span className="text-foreground font-semibold">VraForge Diag</span>
      </div>

      {/* Status bar */}
      <Card className="bg-secondary/20">
        <CardContent className="p-4 grid grid-cols-2 md:grid-cols-6 gap-4 text-xs">
          <div><p className="text-muted-foreground">Značka</p><p className="font-semibold">{brand?.display_name || "—"}</p></div>
          <div><p className="text-muted-foreground">ECU</p><p className="font-semibold">{activeContext?.ecuName || "Všechny"}</p></div>
          <div><p className="text-muted-foreground">TX / RX</p><p className="font-semibold font-mono">{activeContext?.ecuAddress ? `${activeContext.ecuAddress.replace(/^0x/i,'').toUpperCase()}` : "AUTO"}</p></div>
          <div><p className="text-muted-foreground">ELM profil</p><p className="font-semibold uppercase">{elmProfileLabel}</p></div>
          <div><p className="text-muted-foreground">BLE</p><StatusPill ok={bleOk} label={bleOk ? "OK" : bleState} /></div>
          <div className="flex items-center gap-2 justify-end">
            <Badge variant="outline"><ShieldAlert className="w-3 h-3 mr-1"/> Admin only</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Delphi-style Vehicle Identification */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">1. Identifikace vozidla</p>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <div>
              <Label className="text-xs">VIN (volitelné — auto výběr značky)</Label>
              <div className="flex gap-2">
                <Input value={vin} maxLength={17}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="např. WVWZZZ1KZ8W123456"
                  className="font-mono text-xs" />
                <Button size="sm" variant="outline" onClick={decodeVin} disabled={vin.length < 3}>
                  <Scan className="w-3.5 h-3.5 mr-1" /> Dekódovat
                </Button>
              </div>
            </div>
            <div className="hidden md:block text-center text-muted-foreground text-xs pb-2">nebo</div>
            <div>
              <Label className="text-xs">Značka / výrobce ({brands.length})</Label>
              <Select value={brandKey} onValueChange={setBrandKey}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  {brands.map((b) => (
                    <SelectItem key={b.key} value={b.key}>
                      {b.display_name} <span className="text-[10px] text-muted-foreground ml-2">({b.ecus || 0} ECU · {b.dids || 0} DID · {b.routines || 0} rutin)</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* Left: catalog browser */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">2. Systém (ECU)</p>
            <Select value={ecuAddress} onValueChange={setEcuAddress}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent className="max-h-[380px]">
                <SelectItem value="__all">Všechny systémy</SelectItem>
                {ecuOptions.map((e) => (
                  <SelectItem key={e.address} value={e.address}>
                    <span className="font-mono text-[10px] mr-2">{e.address.replace(/^0x/i,'').toUpperCase()}</span>
                    {e.common || e.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <p className="text-xs font-semibold uppercase text-muted-foreground pt-2">3. Funkce</p>
            <div className="grid grid-cols-2 gap-2">
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Všechny typy</SelectItem>
                  <SelectItem value="live_pid">Live data</SelectItem>
                  <SelectItem value="did">Čtení DID</SelectItem>
                  <SelectItem value="obd2_pid">OBD-II PID</SelectItem>
                  <SelectItem value="dtc_scan">DTC sken</SelectItem>
                  <SelectItem value="routine">Servisní rutina</SelectItem>
                  <SelectItem value="actuator_test">Aktuátor test</SelectItem>
                </SelectContent>
              </Select>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="max-h-[300px]">
                  <SelectItem value="__all">Všechny kategorie</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input placeholder="Hledat funkci / PID / DID / rutinu…"
                className="pl-7 text-xs" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>

            <div className="text-xs text-muted-foreground pt-1">
              {filtered.length} funkcí · zdroj: {brand?.file || "—"}
            </div>

            <div className="border border-border/40 rounded-md divide-y divide-border/30 max-h-[520px] overflow-y-auto">
              {brandLoading && <div className="p-3 text-xs text-muted-foreground">Načítám katalog…</div>}
              {!brandLoading && paged.map((f) => (
                <button key={f.id} onClick={() => setSelected(f)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary/40 ${selected?.id === f.id ? "bg-primary/10" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{f.name}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">{KIND_LABEL[f.kind]}</Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono flex justify-between">
                    <span>{f.command}</span>
                    <span>{f.ecu || (f.ecuAddress || "—")}</span>
                  </div>
                </button>
              ))}
              {!brandLoading && paged.length === 0 && <div className="p-3 text-xs text-muted-foreground">Nic nenalezeno</div>}
            </div>

            <div className="flex items-center justify-between text-xs">
              <Button size="sm" variant="ghost" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}><ChevronLeft className="w-3 h-3"/></Button>
              <span>Strana {page} / {totalPages}</span>
              <Button size="sm" variant="ghost" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}><ChevronRight className="w-3 h-3"/></Button>
            </div>
          </CardContent>
        </Card>

        {/* Right: selected + result */}
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">4. Vybraná funkce</p>
              {!selected && <p className="text-sm text-muted-foreground mt-2">Vyber funkci z katalogu vlevo.</p>}
              {selected && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-lg font-semibold">{selected.name}</h3>
                      <Badge variant="outline" className="font-mono text-xs">{selected.command}</Badge>
                      <Badge variant="outline" className="text-[10px] uppercase">{KIND_LABEL[selected.kind]}</Badge>
                      {selected.destructive && <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/40">DESTRUCTIVE</Badge>}
                    </div>
                    {selected.safetyWarning && (
                      <p className="text-xs text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded p-2">
                        ⚠ {selected.safetyWarning}
                      </p>
                    )}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Zdroj:</span> {selected.sourceFile}</div>
                      <div><span className="text-muted-foreground">Kategorie:</span> {selected.category || "—"}</div>
                      <div><span className="text-muted-foreground">Popis:</span> {selected.description || "—"}</div>
                      <div><span className="text-muted-foreground">ECU:</span> {selected.ecuCommonName || selected.ecu || selected.ecuAddress || "—"}</div>
                      <div><span className="text-muted-foreground">TX:</span> <span className="font-mono">{(selected.ecuAddress || "").replace(/^0x/i,'').toUpperCase() || "AUTO"}</span></div>
                      <div><span className="text-muted-foreground">Dekodér:</span> {selected.decoder?.kind || "—"}</div>
                    </div>
                    {selected.destructive && (
                      <div className="pt-2">
                        <Label className="text-xs">Napiš potvrzení: {/egr/i.test(selected.name) ? "SPUSTIT EGR" : "SPUSTIT"}</Label>
                        <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1 text-xs" />
                      </div>
                    )}
                  </div>
                  <div className="flex md:flex-col gap-2">
                    <Button onClick={run} disabled={running || !bleOk} className="min-w-[120px]">
                      <Play className="w-4 h-4 mr-1"/> {running ? "Běží…" : "Spustit"}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Raw command */}
          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="text-xs font-semibold flex items-center gap-2"><FileCode2 className="w-3.5 h-3.5"/> Raw příkaz</p>
              <div className="flex gap-2">
                <Input value={rawCmd} onChange={(e) => setRawCmd(e.target.value)} placeholder="např. 22 F1 90"
                  className="font-mono text-xs" />
                <Button onClick={runRaw} disabled={running || !bleOk || !rawCmd.trim()}><Play className="w-3.5 h-3.5 mr-1"/> Poslat</Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Používá aktivní ECU kontext (TX/RX). Přes elmQueue → bleManager → ELM327.</p>
            </CardContent>
          </Card>

          {/* Result */}
          <Card>
            <CardContent className="p-4">
              <Tabs defaultValue="result">
                <TabsList>
                  <TabsTrigger value="result">Výsledek</TabsTrigger>
                  <TabsTrigger value="raw">Raw</TabsTrigger>
                  <TabsTrigger value="clean">Cleaned</TabsTrigger>
                  <TabsTrigger value="decoded">Decoded</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                  <TabsTrigger value="log">Log</TabsTrigger>
                  <TabsTrigger value="hist">Historie</TabsTrigger>
                </TabsList>

                <TabsContent value="result">
                  {!result && <p className="text-xs text-muted-foreground p-2">Zatím žádný výsledek.</p>}
                  {result && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-2">
                      <div><p className="text-muted-foreground">Status</p><p className={`font-semibold ${result.status === "ok" ? "text-green-500" : result.status === "nrc" ? "text-red-500" : "text-amber-500"}`}>{result.status}</p></div>
                      <div><p className="text-muted-foreground">Doba odezvy</p><p className="font-semibold">{result.durationMs} ms</p></div>
                      <div><p className="text-muted-foreground">Datum / čas</p><p className="font-semibold">{new Date(result.timestamp).toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground">Varování</p><p className="font-semibold">{result.warnings.length || "—"}</p></div>
                      {result.nrc && (
                        <div className="col-span-full text-red-400">
                          <p className="text-muted-foreground">NRC</p>
                          <p className="font-mono">7F {result.nrc.sid} {result.nrc.code} — {result.nrc.description || "?"}</p>
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="raw"><pre className="p-3 bg-secondary/30 text-xs font-mono whitespace-pre-wrap min-h-[80px] rounded">{result?.rawResponse || "—"}</pre></TabsContent>
                <TabsContent value="clean"><pre className="p-3 bg-secondary/30 text-xs font-mono min-h-[80px] rounded">{result?.cleanedResponse || "—"}</pre></TabsContent>
                <TabsContent value="decoded">
                  <div className="p-2 text-xs">
                    {!result?.decoded.length && "—"}
                    {result?.decoded.map((d, i) => (
                      <div key={i} className="grid grid-cols-4 gap-2 py-1 border-b border-border/20">
                        <span>{d.name}</span>
                        <span className="font-semibold">{String(d.value)}</span>
                        <span className="text-muted-foreground">{d.unit || ""}</span>
                        <span className="text-muted-foreground">{d.description || ""}</span>
                      </div>
                    ))}
                  </div>
                </TabsContent>
                <TabsContent value="json"><Textarea readOnly value={jsonReport} className="font-mono text-[10px] min-h-[240px]" /></TabsContent>
                <TabsContent value="log">
                  <ul className="text-xs space-y-1 p-2">
                    {result?.warnings.map((w, i) => <li key={i} className="text-amber-500">⚠ {w}</li>)}
                    {result?.error && <li className="text-red-500">✖ {result.error}</li>}
                    {!result && <li className="text-muted-foreground">—</li>}
                  </ul>
                </TabsContent>
                <TabsContent value="hist">
                  <ul className="text-xs space-y-1 p-2 font-mono">
                    {history.map((h, i) => (
                      <li key={i} className="flex justify-between gap-2 border-b border-border/20 py-1">
                        <span className="text-muted-foreground">{h.time}</span>
                        <span className="truncate flex-1">{h.name}</span>
                        <span>{h.command}</span>
                        <span className={h.status === "ok" ? "text-green-500" : "text-amber-500"}>{h.status}</span>
                        <span className="text-muted-foreground">{h.durationMs}ms</span>
                      </li>
                    ))}
                    {!history.length && <li className="text-muted-foreground">—</li>}
                  </ul>
                </TabsContent>
              </Tabs>

              <div className="flex flex-wrap gap-2 pt-3 border-t border-border/30 mt-3">
                <Button variant="outline" size="sm" disabled={!result} onClick={() => copy(result?.cleanedResponse || "", "Výsledek")}><Copy className="w-3.5 h-3.5 mr-1"/> Kopírovat výsledek</Button>
                <Button variant="outline" size="sm" disabled={!result} onClick={() => copy(jsonReport, "JSON")}><Copy className="w-3.5 h-3.5 mr-1"/> Kopírovat JSON</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
