/**
 * AdminCatalogHub — single command center for the entire parts catalog.
 *
 * Shows live statistics (parts, prices, images, cross-refs, compatibility, J+M sync),
 * plus admin tools: J+M sync, AI cross-ref bulk generator, price-sync trigger,
 * diagnostics, and quick links to category/compatibility editors.
 *
 * Replaces the older AdminCatalogSettings tab — AutoKelly / SAG / InterCars
 * have been removed from the active flow per project decision.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { jmAdapter } from "@/lib/catalog/adapters/jm";
import {
  Database, Package, Image as ImageIcon, Tag, Link2, Car,
  Activity, RefreshCw, Download, Sparkles, DollarSign, AlertTriangle,
  CheckCircle2, Wrench, BarChart3,
} from "lucide-react";

type Stats = {
  partsTotal: number;
  partsWithPrice: number;
  partsWithImage: number;
  partsByCategory: number;
  crossrefs: number;
  compatibility: number;
  vehicles: number;
  categories: number;
  bySource: Array<{ source: string; count: number }>;
};

const sourceColor: Record<string, string> = {
  mopar: "bg-primary/15 text-primary border-primary/30",
  "epc-ai": "bg-primary/10 text-primary border-primary/20",
  jm: "bg-warning/15 text-warning border-warning/30",
  "7zap": "bg-muted text-muted-foreground",
  makro: "bg-muted text-muted-foreground",
  csv: "bg-secondary text-secondary-foreground",
};

const StatTile = ({
  icon: Icon, label, value, hint, accent,
}: { icon: any; label: string; value: string | number; hint?: string; accent?: string }) => (
  <Card className="bg-card/60 border-border/50">
    <CardContent className="p-3">
      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded-lg ${accent || "bg-primary/10 text-primary"}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="text-lg font-bold leading-tight">{value}</p>
          {hint && <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
        </div>
      </div>
    </CardContent>
  </Card>
);

const AdminCatalogHub = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [jmSyncing, setJmSyncing] = useState(false);
  const [crossrefRunning, setCrossrefRunning] = useState(false);
  const [crossrefBatch, setCrossrefBatch] = useState(50);
  const [crossrefBrand, setCrossrefBrand] = useState("Chrysler");
  const [crossrefModel, setCrossrefModel] = useState("Pacifica");
  const [priceSyncRunning, setPriceSyncRunning] = useState(false);
  const [diagRunning, setDiagRunning] = useState(false);
  const [diagResult, setDiagResult] = useState<{ status: string; ms: number } | null>(null);

  const load = async () => {
    setLoading(true);
    const [pn, withPrice, withImage, partCats, crossref, compat, vehicles, cats, bySource] = await Promise.all([
      supabase.from("parts_new").select("id", { count: "exact", head: true }),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).gt("price_with_vat", 0),
      supabase.from("parts_new").select("id", { count: "exact", head: true }).not("image_urls", "is", null),
      supabase.from("catalog_part_categories").select("id", { count: "exact", head: true }),
      supabase.from("part_crossref").select("id", { count: "exact", head: true }),
      supabase.from("catalog_vehicle_compatibility").select("id", { count: "exact", head: true }),
      supabase.from("nextis_vehicles").select("id", { count: "exact", head: true }),
      supabase.from("catalog_categories").select("id", { count: "exact", head: true }),
      supabase.rpc("execute_sql" as any, { sql: "" }).then(() => null).catch(() => null),
    ]);

    // Source breakdown via direct query
    const { data: sourceRows } = await supabase
      .from("parts_new")
      .select("catalog_source")
      .limit(20000);

    const sourceCounts = new Map<string, number>();
    (sourceRows || []).forEach((r: any) => {
      const s = r.catalog_source || "unknown";
      sourceCounts.set(s, (sourceCounts.get(s) || 0) + 1);
    });

    setStats({
      partsTotal: pn.count ?? 0,
      partsWithPrice: withPrice.count ?? 0,
      partsWithImage: withImage.count ?? 0,
      partsByCategory: partCats.count ?? 0,
      crossrefs: crossref.count ?? 0,
      compatibility: compat.count ?? 0,
      vehicles: vehicles.count ?? 0,
      categories: cats.count ?? 0,
      bySource: [...sourceCounts.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((a, b) => b.count - a.count),
    });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const runJmSync = async () => {
    setJmSyncing(true);
    try {
      const r = await jmAdapter.syncCategories();
      toast({ title: "J+M synchronizace dokončena", description: `Naimportováno ${r.synced} uzlů (přeskočeno ${r.skipped}).` });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba J+M sync", description: e.message, variant: "destructive" });
    }
    setJmSyncing(false);
  };

  const runCrossrefBulk = async () => {
    setCrossrefRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("catalog-bridge", {
        body: { action: "crossref-bulk", brand: crossrefBrand, model: crossrefModel, limit: crossrefBatch },
      });
      if (error) throw error;
      toast({
        title: "AI cross-reference dokončen",
        description: `Zpracováno ${data?.processed || 0} OEM, vytvořeno ${data?.inserted || 0} náhrad.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba AI cross-ref", description: e.message, variant: "destructive" });
    }
    setCrossrefRunning(false);
  };

  const runPriceSync = async () => {
    setPriceSyncRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("price-sync", {
        body: { batchSize: 200, mode: "missing" },
      });
      if (error) throw error;
      toast({
        title: "Price-sync spuštěn",
        description: `Zpracováno ${data?.processed || 0} dílů, aktualizováno ${data?.updated || 0}.`,
      });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba price-sync", description: e.message, variant: "destructive" });
    }
    setPriceSyncRunning(false);
  };

  const runDiagnostics = async () => {
    setDiagRunning(true);
    setDiagResult(null);
    try {
      const start = Date.now();
      const { data, error } = await supabase.functions.invoke("catalog-search", {
        body: { oemCodes: ["68218951AA"], mode: "force" },
      });
      const ms = Date.now() - start;
      if (error) throw error;
      setDiagResult({ status: data ? "ok" : "empty", ms });
      toast({ title: "Diagnostika dokončena", description: `Odezva ${ms} ms.` });
    } catch (e: any) {
      setDiagResult({ status: "error", ms: 0 });
      toast({ title: "Chyba diagnostiky", description: e.message, variant: "destructive" });
    }
    setDiagRunning(false);
  };

  if (loading || !stats) {
    return <div className="text-center py-6 text-sm text-muted-foreground">Načítám statistiky katalogu…</div>;
  }

  const pricePct = stats.partsTotal ? Math.round((stats.partsWithPrice / stats.partsTotal) * 100) : 0;
  const imagePct = stats.partsTotal ? Math.round((stats.partsWithImage / stats.partsTotal) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold flex items-center gap-2">
            <Database className="w-5 h-5 text-primary" />
            Katalog – přehled & nástroje
          </h2>
          <p className="text-xs text-muted-foreground">
            Centrální dashboard pro správu, statistiky a synchronizaci celého katalogu dílů.
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" />
          Obnovit
        </Button>
      </div>

      {/* Hero stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <StatTile icon={Package} label="Díly v katalogu" value={stats.partsTotal.toLocaleString("cs")} accent="bg-primary/10 text-primary" />
        <StatTile icon={DollarSign} label="S cenou" value={`${stats.partsWithPrice.toLocaleString("cs")}`} hint={`${pricePct} % katalogu`} accent="bg-success/10 text-success" />
        <StatTile icon={ImageIcon} label="S obrázkem" value={stats.partsWithImage.toLocaleString("cs")} hint={`${imagePct} % katalogu`} accent="bg-warning/10 text-warning" />
        <StatTile icon={Link2} label="Cross-refs" value={stats.crossrefs.toLocaleString("cs")} hint="náhrady (Bosch, TRW…)" accent="bg-accent/10 text-accent-foreground" />
        <StatTile icon={Car} label="Vozidla (Nextis)" value={stats.vehicles.toLocaleString("cs")} accent="bg-primary/10 text-primary" />
        <StatTile icon={Wrench} label="Vazby díl ↔ vůz" value={stats.compatibility.toLocaleString("cs")} accent="bg-primary/10 text-primary" />
        <StatTile icon={Tag} label="Kategorie" value={stats.categories.toLocaleString("cs")} accent="bg-secondary text-secondary-foreground" />
        <StatTile icon={BarChart3} label="Díly v kategoriích" value={stats.partsByCategory.toLocaleString("cs")} accent="bg-secondary text-secondary-foreground" />
      </div>

      {/* Coverage progress */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-primary" />
            Pokrytí katalogu
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Pokrytí cenami</span>
              <span className={pricePct < 30 ? "text-warning font-semibold" : "text-success"}>{pricePct} %</span>
            </div>
            <Progress value={pricePct} />
          </div>
          <div>
            <div className="flex justify-between text-xs mb-1">
              <span>Pokrytí obrázky</span>
              <span className={imagePct < 30 ? "text-warning font-semibold" : "text-success"}>{imagePct} %</span>
            </div>
            <Progress value={imagePct} />
          </div>
          {pricePct < 30 && (
            <div className="flex items-start gap-2 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md p-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
              <span>Více než 70 % dílů nemá cenu. Spusť price-sync níže pro aktualizaci.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sources */}
      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm">Rozložení dle zdroje</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="flex flex-wrap gap-1.5">
            {stats.bySource.map((s) => (
              <Badge key={s.source} variant="outline" className={`text-[10px] ${sourceColor[s.source] || ""}`}>
                {s.source}: {s.count.toLocaleString("cs")}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* TOOLS */}
      <Card className="border-primary/30">
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm flex items-center gap-1.5">
            <Wrench className="w-4 h-4 text-primary" />
            Nástroje & synchronizace
          </CardTitle>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          {/* J+M sync */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Download className="w-3.5 h-3.5 text-primary" />
                  J+M Nextis – synchronizace katalogu
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Stáhne hierarchii Značka → Model → Motor a kategorie z Nextis API.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={runJmSync} disabled={jmSyncing}>
                {jmSyncing ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Download className="w-3.5 h-3.5 mr-1" />}
                {jmSyncing ? "Synchronizuji…" : "Spustit"}
              </Button>
            </div>
          </div>

          {/* AI Crossref bulk */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div>
              <p className="text-sm font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                AI cross-reference – generování náhrad
              </p>
              <p className="text-[11px] text-muted-foreground">
                Pro každé OEM vytvoří záznamy aftermarket náhrad (Bosch, TRW, MANN…) v <code>part_crossref</code>.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-[10px] text-muted-foreground">Značka</Label>
                <Input value={crossrefBrand} onChange={(e) => setCrossrefBrand(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Model</Label>
                <Input value={crossrefModel} onChange={(e) => setCrossrefModel(e.target.value)} className="h-8 text-xs" />
              </div>
              <div>
                <Label className="text-[10px] text-muted-foreground">Limit dílů</Label>
                <Input type="number" value={crossrefBatch} onChange={(e) => setCrossrefBatch(Number(e.target.value) || 50)} className="h-8 text-xs" />
              </div>
            </div>
            <Button size="sm" className="w-full" onClick={runCrossrefBulk} disabled={crossrefRunning}>
              {crossrefRunning ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 mr-1" />}
              {crossrefRunning ? "Generuji náhrady…" : "Spustit AI cross-ref"}
            </Button>
          </div>

          {/* Price sync */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-primary" />
                  Price-sync – aktualizace cen
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Doplní chybějící ceny z vernostsevyplaci.cz (200 dílů / běh).
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={runPriceSync} disabled={priceSyncRunning}>
                {priceSyncRunning ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <DollarSign className="w-3.5 h-3.5 mr-1" />}
                {priceSyncRunning ? "Spouštím…" : "Spustit"}
              </Button>
            </div>
          </div>

          {/* Diagnostics */}
          <div className="border border-border/50 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                  Diagnostika vyhledávání
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Otestuje katalog-search edge funkci na referenčním OEM 68218951AA.
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={runDiagnostics} disabled={diagRunning}>
                {diagRunning ? <RefreshCw className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Activity className="w-3.5 h-3.5 mr-1" />}
                {diagRunning ? "Testuji…" : "Test"}
              </Button>
            </div>
            {diagResult && (
              <div className="flex items-center gap-2 text-xs">
                {diagResult.status === "ok" ? (
                  <Badge className="bg-success/15 text-success border-success/30"><CheckCircle2 className="w-3 h-3 mr-0.5" />OK · {diagResult.ms} ms</Badge>
                ) : diagResult.status === "empty" ? (
                  <Badge variant="outline">Bez výsledku</Badge>
                ) : (
                  <Badge variant="destructive">Chyba</Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCatalogHub;
