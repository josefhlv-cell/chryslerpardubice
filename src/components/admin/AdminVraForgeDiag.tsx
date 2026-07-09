/**
 * AdminVraForgeDiag — admin-only diagnostic console powered by Delphi-OBD
 * catalogs. UI matches the VraForge Diag reference design.
 *
 * Not for customer use — this is a service technician tool.
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
  Play, Search, Copy, FileCode2, Activity, ChevronLeft, ChevronRight,
  ShieldAlert, CircleDot,
} from "lucide-react";
import {
  PROFILES, loadProfileFunctions, runDiagFunction, runRawCommand,
  buildJsonReport, type DiagFunction, type DiagRunResult, type ProfileKey,
} from "@/lib/obd/vraforge-diag";
import { bleManager } from "@/lib/obd/ble-manager";
import { getActiveElmProfile } from "@/lib/obd/adapter/elm-init";

type LastAction = { time: string; command: string; name: string; status: string; durationMs: number };

const PAGE_SIZE = 20;

const StatusPill = ({ ok, label }: { ok: boolean; label: string }) => (
  <Badge className={ok ? "bg-green-600/20 text-green-400 border-green-600/40" : "bg-red-600/20 text-red-400 border-red-600/40"}>
    <CircleDot className="w-3 h-3 mr-1" /> {label}
  </Badge>
);

export default function AdminVraForgeDiag() {
  const [profileKey, setProfileKey] = useState<ProfileKey>("vag");
  const [ecuFilter, setEcuFilter] = useState<string>("__all");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [search, setSearch] = useState("");
  const [functions, setFunctions] = useState<DiagFunction[]>([]);
  const [ecus, setEcus] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<DiagFunction | null>(null);
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<DiagRunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [rawCmd, setRawCmd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [history, setHistory] = useState<LastAction[]>([]);
  const [bleState, setBleState] = useState(bleManager.getState());
  const [voltage] = useState<string>("—");

  useEffect(() => bleManager.subscribe((e) => { if (e.type === "stateChange") setBleState(e.payload); }), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadProfileFunctions(profileKey).then((r) => {
      if (cancelled) return;
      setFunctions(r.functions);
      const ecuNames = Array.from(new Set(r.functions.map((f) => f.ecu).filter(Boolean))) as string[];
      setEcus(ecuNames.sort());
      setPage(1);
      setSelected(null);
    }).catch((e) => toast({ title: "Chyba katalogu", description: String(e), variant: "destructive" }))
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [profileKey]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    functions.forEach((f) => f.category && set.add(f.category));
    return Array.from(set).sort();
  }, [functions]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return functions.filter((f) => {
      if (ecuFilter !== "__all" && f.ecu !== ecuFilter) return false;
      if (categoryFilter !== "__all" && f.category !== categoryFilter) return false;
      if (!q) return true;
      return f.name.toLowerCase().includes(q)
        || (f.description || "").toLowerCase().includes(q)
        || f.command.toLowerCase().includes(q)
        || (f.did || "").toLowerCase().includes(q)
        || (f.routineId || "").toLowerCase().includes(q);
    });
  }, [functions, ecuFilter, categoryFilter, search]);

  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  const bleOk = bleState === "connected";
  const elmProfileLabel = getActiveElmProfile() ?? "—";

  const run = async () => {
    if (!selected) return;
    if (selected.destructive && confirm !== "SPUSTIT EGR" && /egr/i.test(selected.name)) {
      toast({ title: "Vyžadováno potvrzení", description: "Do pole napiš: SPUSTIT EGR", variant: "destructive" });
      return;
    }
    if (selected.destructive && !/egr/i.test(selected.name) && confirm !== "SPUSTIT") {
      toast({ title: "Vyžadováno potvrzení", description: "Do pole napiš: SPUSTIT", variant: "destructive" });
      return;
    }
    setRunning(true);
    try {
      const r = await runDiagFunction(selected);
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
      const r = await runRawCommand(rawCmd.trim(), profileKey);
      setResult(r);
      setHistory((h) => [{ time: new Date().toLocaleTimeString(), command: r.command, name: `RAW ${r.command}`, status: r.status, durationMs: r.durationMs }, ...h].slice(0, 15));
    } finally {
      setRunning(false);
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: `${label} zkopírováno` }));
  };

  const jsonReport = result ? JSON.stringify(buildJsonReport(result), null, 2) : "";

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
          <div><p className="text-muted-foreground">Profil</p><p className="font-semibold">{PROFILES.find(p=>p.key===profileKey)?.label}</p></div>
          <div><p className="text-muted-foreground">Protokol</p><p className="font-semibold">ISO 15765-4</p></div>
          <div><p className="text-muted-foreground">ELM profil</p><p className="font-semibold uppercase">{elmProfileLabel}</p></div>
          <div><p className="text-muted-foreground">Napětí</p><p className="font-semibold">{voltage}</p></div>
          <div><p className="text-muted-foreground">Stav</p><StatusPill ok={bleOk} label={bleOk ? "OK" : bleState} /></div>
          <div className="flex items-center gap-2 justify-end">
            <Badge variant="outline"><ShieldAlert className="w-3 h-3 mr-1"/> Admin only</Badge>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-4">
        {/* Left: catalog browser */}
        <Card>
          <CardContent className="p-3 space-y-3">
            <div>
              <Label className="text-xs">Profil / Značka</Label>
              <Select value={profileKey} onValueChange={(v) => setProfileKey(v as ProfileKey)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROFILES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">ECU / Oblast</Label>
              <Select value={ecuFilter} onValueChange={setEcuFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Všechny ECU</SelectItem>
                  {ecus.map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Kategorie</Label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">Všechny kategorie</SelectItem>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2 top-2.5 text-muted-foreground" />
              <Input placeholder="Hledat funkci / příkaz / PID / DID"
                className="pl-7 text-xs" value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
            </div>

            <div className="text-xs text-muted-foreground pt-1">
              Seznam funkcí (Delphi-OBD) · {filtered.length} funkcí
            </div>

            <div className="border border-border/40 rounded-md divide-y divide-border/30 max-h-[520px] overflow-y-auto">
              {loading && <div className="p-3 text-xs text-muted-foreground">Načítám katalog…</div>}
              {!loading && paged.map((f) => (
                <button key={f.id} onClick={() => setSelected(f)}
                  className={`w-full text-left px-3 py-2 text-xs hover:bg-secondary/40 ${selected?.id === f.id ? "bg-primary/10" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{f.name}</span>
                    <Badge variant="outline" className="text-[9px] uppercase">
                      {f.kind === "routine" ? "Rutina" : f.kind === "dtc_scan" ? "DTC" : f.kind === "obd2_pid" ? "PID" : "DID"}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-muted-foreground font-mono">{f.command}</div>
                </button>
              ))}
              {!loading && paged.length === 0 && <div className="p-3 text-xs text-muted-foreground">Nic nenalezeno</div>}
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
              <p className="text-xs text-muted-foreground">Vybraná funkce</p>
              {!selected && <p className="text-sm text-muted-foreground mt-2">Vyber funkci z katalogu vlevo.</p>}
              {selected && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-[1fr_auto] gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold">{selected.name}</h3>
                      <Badge variant="outline" className="font-mono text-xs">{selected.command}</Badge>
                      {selected.destructive && <Badge className="bg-amber-500/20 text-amber-500 border-amber-500/40">DESTRUCTIVE</Badge>}
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                      <div><span className="text-muted-foreground">Zdroj:</span> Delphi-OBD ({selected.sourceFile})</div>
                      <div><span className="text-muted-foreground">Kategorie:</span> {selected.category || "—"}</div>
                      <div><span className="text-muted-foreground">Popis:</span> {selected.description || "—"}</div>
                      <div><span className="text-muted-foreground">ECU:</span> {selected.ecu || selected.ecuAddress || "—"}</div>
                      <div><span className="text-muted-foreground">Typ dekodéru:</span> {selected.decoder?.kind || "—"}</div>
                      <div><span className="text-muted-foreground">Jednotka:</span> {selected.decoder?.unit || "—"}</div>
                      <div><span className="text-muted-foreground">Měřítko:</span> {selected.decoder?.scale ?? "—"}</div>
                      <div><span className="text-muted-foreground">Offset:</span> {selected.decoder?.offset ?? "—"}</div>
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
              <p className="text-xs font-semibold flex items-center gap-2"><FileCode2 className="w-3.5 h-3.5"/> Raw VraForge Diag command</p>
              <div className="flex gap-2">
                <Input value={rawCmd} onChange={(e) => setRawCmd(e.target.value)} placeholder="např. 22 F1 90"
                  className="font-mono text-xs" />
                <Button onClick={runRaw} disabled={running || !bleOk || !rawCmd.trim()}><Play className="w-3.5 h-3.5 mr-1"/> Poslat</Button>
              </div>
              <p className="text-[10px] text-muted-foreground">Prochází přes elmQueue → bleManager → ELM327. Žádný přímý BLE write.</p>
            </CardContent>
          </Card>

          {/* Result */}
          <Card>
            <CardContent className="p-4">
              <Tabs defaultValue="result">
                <TabsList>
                  <TabsTrigger value="result">Výsledek</TabsTrigger>
                  <TabsTrigger value="raw">Raw odpověď</TabsTrigger>
                  <TabsTrigger value="clean">Vyčištěná</TabsTrigger>
                  <TabsTrigger value="decoded">Decoded</TabsTrigger>
                  <TabsTrigger value="json">JSON</TabsTrigger>
                  <TabsTrigger value="log">Log</TabsTrigger>
                </TabsList>

                <TabsContent value="result">
                  {!result && <p className="text-xs text-muted-foreground p-2">Zatím žádný výsledek.</p>}
                  {result && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs p-2">
                      <div><p className="text-muted-foreground">Status</p><p className={`font-semibold ${result.status === "ok" ? "text-green-500" : "text-amber-500"}`}>{result.status}</p></div>
                      <div><p className="text-muted-foreground">Doba odezvy</p><p className="font-semibold">{result.durationMs} ms</p></div>
                      <div><p className="text-muted-foreground">Datum / čas</p><p className="font-semibold">{new Date(result.timestamp).toLocaleString()}</p></div>
                      <div><p className="text-muted-foreground">Varování</p><p className="font-semibold">{result.warnings.length || "—"}</p></div>
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
              </Tabs>

              <div className="flex flex-wrap gap-2 pt-3 border-t border-border/30 mt-3">
                <Button variant="outline" size="sm" disabled={!result} onClick={() => copy(result?.cleanedResponse || "", "Výsledek")}><Copy className="w-3.5 h-3.5 mr-1"/> Kopírovat výsledek</Button>
                <Button variant="outline" size="sm" disabled={!result} onClick={() => copy(jsonReport, "JSON")}><Copy className="w-3.5 h-3.5 mr-1"/> Kopírovat JSON</Button>
                <Button variant="ghost" size="sm" onClick={() => window.dispatchEvent(new CustomEvent("admin:goto", { detail: "diag-obd-debug" }))}>
                  <Activity className="w-3.5 h-3.5 mr-1"/> Zobrazit v OBD Debug
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* History */}
          <Card>
            <CardContent className="p-4">
              <p className="text-xs font-semibold mb-2">Poslední akce</p>
              {history.length === 0 && <p className="text-xs text-muted-foreground">Zatím žádné akce.</p>}
              <ul className="text-xs divide-y divide-border/30">
                {history.map((h, i) => (
                  <li key={i} className="grid grid-cols-[80px_60px_1fr_80px] gap-2 py-1.5">
                    <span className="text-muted-foreground">{h.time}</span>
                    <Badge className={h.status === "ok" ? "bg-green-600/20 text-green-400" : "bg-amber-500/20 text-amber-500"}>{h.status}</Badge>
                    <span>{h.name} <span className="text-muted-foreground font-mono">{h.command}</span></span>
                    <span className="text-right text-muted-foreground">{h.durationMs} ms</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
