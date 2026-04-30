/**
 * AdminCatalogCommandCenter — single unified workspace for all catalog
 * diagnostics & repair tools.
 *
 * Replaces three separate admin tabs:
 *   - Diagnostika (full-catalog scan with auto-fixes)
 *   - Per-díl    (per-part AI diagnostic)
 *   - J+M Strom  (J+M tree sync)
 *
 * Adds:
 *   - "Auto-seed crossref" – batch fill missing J+M alternatives via AI
 *   - "Event log"          – live error/empty-result feed from jm-proxy & catalogV2API
 *   - "Quick repair"       – 1-click bulk fixes (relink orphans, retag NÁHRADA badges)
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import {
  Wrench, Activity, Microscope, Database, ListChecks,
  Sparkles, RefreshCw, AlertTriangle, CheckCircle2, Search, Loader2, Trash2,
} from "lucide-react";

import AdminCatalogDiagnostic from "./AdminCatalogDiagnostic";
import AdminPartDiagnostics from "./AdminPartDiagnostics";
import AdminJmTreeSync from "./AdminJmTreeSync";

type LogRow = {
  id: string;
  created_at: string;
  source: string;
  level: string;
  event: string;
  message: string | null;
  oem_number: string | null;
  category: string | null;
  duration_ms: number | null;
  details: any;
};

const LEVEL_BADGE: Record<string, string> = {
  error: "bg-destructive/20 text-destructive border-destructive/40",
  warn:  "bg-amber-500/20 text-amber-300 border-amber-500/40",
  info:  "bg-primary/15 text-primary border-primary/40",
  debug: "bg-muted text-muted-foreground border-border",
};

// --------- Event log panel ---------
function EventLogPanel() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>("all");
  const [filterSource, setFilterSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [stats, setStats] = useState<{ errors24h: number; warns24h: number; emptyJm24h: number; emptyList24h: number } | null>(null);

  async function load() {
    setLoading(true);
    let q = (supabase as any).from("catalog_event_log").select("*").order("created_at", { ascending: false }).limit(200);
    if (filterLevel !== "all") q = q.eq("level", filterLevel);
    if (filterSource !== "all") q = q.eq("source", filterSource);
    const { data } = await q;
    let list = (data || []) as LogRow[];
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((r) =>
        (r.message || "").toLowerCase().includes(s) ||
        (r.oem_number || "").toLowerCase().includes(s) ||
        (r.event || "").toLowerCase().includes(s),
      );
    }
    setRows(list);

    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const [{ count: errCount }, { count: warnCount }, { count: emptyJm }, { count: emptyList }] = await Promise.all([
      (supabase as any).from("catalog_event_log").select("id", { count: "exact", head: true }).eq("level", "error").gte("created_at", since),
      (supabase as any).from("catalog_event_log").select("id", { count: "exact", head: true }).eq("level", "warn").gte("created_at", since),
      (supabase as any).from("catalog_event_log").select("id", { count: "exact", head: true }).eq("event", "searchByCode_empty").gte("created_at", since),
      (supabase as any).from("catalog_event_log").select("id", { count: "exact", head: true }).eq("event", "listPartsForVehicle_empty").gte("created_at", since),
    ]);
    setStats({
      errors24h: errCount ?? 0,
      warns24h: warnCount ?? 0,
      emptyJm24h: emptyJm ?? 0,
      emptyList24h: emptyList ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterLevel, filterSource]);

  async function purgeOld() {
    if (!confirm("Smazat všechny logy starší než 14 dní?")) return;
    const cutoff = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
    const { error } = await (supabase as any).from("catalog_event_log").delete().lt("created_at", cutoff);
    if (error) toast({ title: "Chyba", description: error.message, variant: "destructive" });
    else { toast({ title: "Hotovo", description: "Staré logy smazány" }); load(); }
  }

  return (
    <div className="space-y-3">
      {/* stats */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Chyby 24h</p><p className="text-lg font-bold text-destructive">{stats.errors24h}</p></CardContent></Card>
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Varování 24h</p><p className="text-lg font-bold text-amber-400">{stats.warns24h}</p></CardContent></Card>
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Prázdné J+M 24h</p><p className="text-lg font-bold">{stats.emptyJm24h}</p></CardContent></Card>
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Prázdné výpisy 24h</p><p className="text-lg font-bold">{stats.emptyList24h}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Input placeholder="Hledat (OEM, event, zpráva)..." value={search} onChange={(e) => setSearch(e.target.value)} className="h-8 text-xs max-w-xs" />
            <select value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)} className="h-8 text-xs rounded border bg-background px-2">
              <option value="all">Vše</option><option value="error">Chyby</option><option value="warn">Varování</option><option value="info">Info</option>
            </select>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)} className="h-8 text-xs rounded border bg-background px-2">
              <option value="all">Všechny zdroje</option>
              <option value="jm-proxy">jm-proxy</option>
              <option value="catalogV2API">catalogV2API</option>
              <option value="crossref-auto-seed">crossref-auto-seed</option>
            </select>
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
              Obnovit
            </Button>
            <Button size="sm" variant="ghost" onClick={purgeOld} className="text-destructive ml-auto">
              <Trash2 className="w-3 h-3 mr-1" /> Vyčistit &gt;14 dní
            </Button>
          </div>

          <div className="overflow-x-auto -mx-3 px-3">
            <table className="w-full text-[11px]">
              <thead className="text-left text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="py-1 pr-2">Čas</th>
                  <th className="py-1 pr-2">Zdroj</th>
                  <th className="py-1 pr-2">Úroveň</th>
                  <th className="py-1 pr-2">Event</th>
                  <th className="py-1 pr-2">OEM/Kategorie</th>
                  <th className="py-1 pr-2">Zpráva</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20 align-top">
                    <td className="py-1 pr-2 whitespace-nowrap text-muted-foreground">{new Date(r.created_at).toLocaleString("cs")}</td>
                    <td className="py-1 pr-2"><Badge variant="outline" className="text-[9px]">{r.source}</Badge></td>
                    <td className="py-1 pr-2"><Badge className={LEVEL_BADGE[r.level] || ""}>{r.level}</Badge></td>
                    <td className="py-1 pr-2 font-mono">{r.event}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">{r.oem_number || r.category || "—"}</td>
                    <td className="py-1 pr-2 max-w-md">
                      <div className="truncate" title={r.message || ""}>{r.message || "—"}</div>
                      {r.details?.reason && <div className="text-[9px] text-muted-foreground italic">{r.details.reason}</div>}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && !loading && (
                  <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Žádné záznamy</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --------- Quick repair panel ---------
type RepairKpi = {
  partsWithoutCategory: number;
  partsWithoutCompat: number;
  duplicateOems: number;
  moparWithoutCrossref: number;
  pendingQueue: number;
  failedQueue: number;
};

function QuickRepairPanel() {
  const [kpi, setKpi] = useState<RepairKpi | null>(null);
  const [loading, setLoading] = useState(false);
  const [seedRunning, setSeedRunning] = useState(false);
  const [seedLimit, setSeedLimit] = useState(25);
  const [retagRunning, setRetagRunning] = useState(false);
  const [orphanRunning, setOrphanRunning] = useState(false);

  async function loadKpi() {
    setLoading(true);
    const [
      { count: noCat },
      { count: noCompat },
      { count: moparTotal },
      { count: moparWithCross },
      { count: pending },
      { count: failed },
    ] = await Promise.all([
      supabase.from("parts_new").select("id", { count: "exact", head: true }).is("category", null),
      supabase.from("parts_new").select("id", { count: "exact", head: true }),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).ilike("manufacturer", "mopar"),
      supabase.from("part_crossref").select("oem_number", { count: "exact", head: true }),
      (supabase as any).from("crossref_seed_queue").select("id", { count: "exact", head: true }).eq("status", "pending"),
      (supabase as any).from("crossref_seed_queue").select("id", { count: "exact", head: true }).eq("status", "failed"),
    ]);
    setKpi({
      partsWithoutCategory: noCat ?? 0,
      partsWithoutCompat: 0, // placeholder, expensive to compute exactly
      duplicateOems: 0,
      moparWithoutCrossref: Math.max(0, (moparTotal ?? 0) - (moparWithCross ?? 0)),
      pendingQueue: pending ?? 0,
      failedQueue: failed ?? 0,
    });
    setLoading(false);
  }

  useEffect(() => { loadKpi(); }, []);

  async function runAutoSeed() {
    setSeedRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("crossref-auto-seed", { body: { limit: seedLimit } });
      if (error) throw error;
      toast({
        title: "Auto-seed dokončen",
        description: `Zpracováno ${data?.processed || 0} OEM, vloženo ${data?.inserted || 0} náhrad.`,
      });
      await loadKpi();
    } catch (e: any) {
      toast({ title: "Auto-seed selhal", description: e.message, variant: "destructive" });
    } finally { setSeedRunning(false); }
  }

  async function retagBadges() {
    if (!confirm("Přeznačit ORIGINÁL vs NÁHRADA u všech dílů podle catalog_source / manufacturer?")) return;
    setRetagRunning(true);
    try {
      // Aftermarket sources => availability not changed but we ensure manufacturer is not 'Mopar' for those.
      const { error: e1 } = await (supabase as any)
        .from("parts_new")
        .update({ manufacturer: null })
        .in("catalog_source", ["epc-ai", "ai-epc", "makro", "autokelly", "crossref", "sag"])
        .ilike("manufacturer", "mopar");
      if (e1) throw e1;
      toast({ title: "Hotovo", description: "Aftermarket dílům odstraněn label Mopar." });
      await loadKpi();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally { setRetagRunning(false); }
  }

  async function relinkOrphans() {
    if (!confirm("Spustit kompatibilitní matcher (compat-matcher) pro nepřiřazené díly?")) return;
    setOrphanRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("compat-matcher", { body: { mode: "orphans", limit: 500 } });
      if (error) throw error;
      toast({ title: "Matcher hotov", description: `Přiřazeno ${data?.matched || 0} z ${data?.processed || 0}.` });
      await loadKpi();
    } catch (e: any) {
      toast({ title: "Chyba matcheru", description: e.message, variant: "destructive" });
    } finally { setOrphanRunning(false); }
  }

  return (
    <div className="space-y-3">
      {kpi && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Bez kategorie</p><p className="text-lg font-bold text-amber-400">{kpi.partsWithoutCategory}</p></CardContent></Card>
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Mopar bez crossref</p><p className="text-lg font-bold">{kpi.moparWithoutCrossref}</p></CardContent></Card>
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Queue čeká</p><p className="text-lg font-bold">{kpi.pendingQueue}</p></CardContent></Card>
          <Card><CardContent className="p-2"><p className="text-[10px] text-muted-foreground uppercase">Queue chyb</p><p className="text-lg font-bold text-destructive">{kpi.failedQueue}</p></CardContent></Card>
        </div>
      )}

      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-primary" />Automatické opravy</CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          {/* auto-seed */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold">Auto-seed J+M cross-references</p>
              <p className="text-[11px] text-muted-foreground">
                Pro Mopar OEM bez záznamu v <code>part_crossref</code> doplní AI Gateway
                aftermarket náhrady (Bosch, MANN, TRW, …). Cron běží každou hodinu, ale můžeš spustit
                ručně.
              </p>
            </div>
            <div className="flex items-end gap-2">
              <div className="w-24">
                <Label className="text-[10px] text-muted-foreground">Limit</Label>
                <Input type="number" value={seedLimit} onChange={(e) => setSeedLimit(Number(e.target.value) || 25)} className="h-8 text-xs" />
              </div>
              <Button size="sm" onClick={runAutoSeed} disabled={seedRunning}>
                {seedRunning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Sparkles className="w-3 h-3 mr-1" />}
                Spustit
              </Button>
            </div>
          </div>

          {/* retag badges */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold">Oprav ORIGINÁL/NÁHRADA badge</p>
              <p className="text-[11px] text-muted-foreground">
                U dílů z aftermarket zdrojů (EPC AI, Makro, AutoKelly, SAG) odstraní falešný label „Mopar".
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={retagBadges} disabled={retagRunning}>
              {retagRunning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
              Spustit přeznačení
            </Button>
          </div>

          {/* compat orphans */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold">Přepoj sirotky → vozidla</p>
              <p className="text-[11px] text-muted-foreground">
                Spustí <code>compat-matcher</code> pro díly bez vazby na Nextis vozidlo.
              </p>
            </div>
            <Button size="sm" variant="outline" onClick={relinkOrphans} disabled={orphanRunning}>
              {orphanRunning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Wrench className="w-3 h-3 mr-1" />}
              Spustit matcher (500)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// --------- Main shell ---------
export default function AdminCatalogCommandCenter() {
  return (
    <div className="space-y-3">
      <div>
        <h2 className="font-display text-lg font-bold flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" /> Diagnostické a opravné centrum
        </h2>
        <p className="text-xs text-muted-foreground">
          Sjednocené nástroje pro analýzu, opravy a monitoring katalogu.
        </p>
      </div>

      <Tabs defaultValue="repair">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="repair" className="text-[11px] gap-1"><Sparkles className="w-3 h-3" />Rychlé opravy</TabsTrigger>
          <TabsTrigger value="scan" className="text-[11px] gap-1"><Search className="w-3 h-3" />Hluboký sken</TabsTrigger>
          <TabsTrigger value="part" className="text-[11px] gap-1"><Microscope className="w-3 h-3" />Per-díl AI</TabsTrigger>
          <TabsTrigger value="tree" className="text-[11px] gap-1"><Database className="w-3 h-3" />J+M Strom</TabsTrigger>
          <TabsTrigger value="logs" className="text-[11px] gap-1"><Activity className="w-3 h-3" />Live log</TabsTrigger>
        </TabsList>

        <TabsContent value="repair" className="mt-3"><QuickRepairPanel /></TabsContent>
        <TabsContent value="scan" className="mt-3"><AdminCatalogDiagnostic /></TabsContent>
        <TabsContent value="part" className="mt-3"><AdminPartDiagnostics /></TabsContent>
        <TabsContent value="tree" className="mt-3"><AdminJmTreeSync /></TabsContent>
        <TabsContent value="logs" className="mt-3"><EventLogPanel /></TabsContent>
      </Tabs>
    </div>
  );
}
