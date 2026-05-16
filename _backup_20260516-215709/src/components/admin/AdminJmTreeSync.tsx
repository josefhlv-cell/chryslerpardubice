/**
 * AdminJmTreeSync — řízení synchronizace 5-úrovňového katalogu zrcadlícího J+M.
 * 1) Build tree   (Značka → Model → Motor → Kategorie → Subkategorie)
 * 2) Classify parts into the new tree (AI Gemini Flash, batch 25)
 * 3) Toggle feature flag `catalog_jm_tree` to switch UI to the new tree
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { TreePine, Sparkles, Loader2, CheckCircle2, AlertTriangle, Power } from "lucide-react";

type Run = {
  id: string;
  status: string;
  scope: string;
  vehicles_total: number;
  vehicles_done: number;
  categories_created: number;
  parts_classified: number;
  current_step: string | null;
  last_error: string | null;
  started_at: string;
  finished_at: string | null;
};

export default function AdminJmTreeSync() {
  const [buildRun, setBuildRun] = useState<Run | null>(null);
  const [classifyRun, setClassifyRun] = useState<Run | null>(null);
  const [working, setWorking] = useState<"build" | "classify" | null>(null);
  const [flagOn, setFlagOn] = useState(false);
  const [stats, setStats] = useState({ categories: 0, mappedParts: 0, totalParts: 0 });

  async function loadStats() {
    const [{ count: cats }, { count: mapped }, { count: total }, { data: flag }] = await Promise.all([
      supabase.from("catalog_categories").select("*", { count: "exact", head: true }).eq("source", "jm"),
      supabase.from("catalog_part_categories").select("*", { count: "exact", head: true }).eq("is_primary", true),
      supabase.from("parts_new").select("*", { count: "exact", head: true }),
      supabase.from("feature_flags").select("enabled").eq("feature_key", "catalog_jm_tree").maybeSingle(),
    ]);
    setStats({ categories: cats || 0, mappedParts: mapped || 0, totalParts: total || 0 });
    setFlagOn(!!flag?.enabled);
  }

  async function loadLatestRuns() {
    const [{ data: build }, { data: classify }] = await Promise.all([
      supabase.from("jm_tree_sync_runs").select("*").eq("scope", "all").order("started_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("jm_tree_sync_runs").select("*").eq("scope", "classify").order("started_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setBuildRun(build as Run | null);
    setClassifyRun(classify as Run | null);
  }

  useEffect(() => {
    loadStats();
    loadLatestRuns();
  }, []);

  // Polling while running
  useEffect(() => {
    const isRunning = buildRun?.status === "running" || classifyRun?.status === "running";
    if (!isRunning) return;
    const t = setInterval(() => { loadLatestRuns(); loadStats(); }, 3000);
    return () => clearInterval(t);
  }, [buildRun?.status, classifyRun?.status]);

  async function startBuild() {
    setWorking("build");
    try {
      const { data, error } = await supabase.functions.invoke("jm-tree-build", { body: { action: "start" } });
      if (error) throw error;
      toast({ title: "Sync stromu spuštěn", description: `${data?.total ?? "?"} vozidel ke zpracování` });
      await loadLatestRuns();
    } catch (e: any) {
      toast({ title: "Chyba", description: String(e.message || e), variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function startClassify() {
    setWorking("classify");
    try {
      const { data, error } = await supabase.functions.invoke("jm-classify-parts", { body: { action: "start" } });
      if (error) throw error;
      toast({ title: "Klasifikace spuštěna", description: `${data?.total ?? "?"} dílů ke zařazení` });
      await loadLatestRuns();
    } catch (e: any) {
      toast({ title: "Chyba", description: String(e.message || e), variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function toggleFlag(on: boolean) {
    const { error } = await supabase
      .from("feature_flags")
      .upsert({ feature_key: "catalog_jm_tree", enabled: on, description: "Use new J+M-style 5-level catalog tree" }, { onConflict: "feature_key" });
    if (error) {
      toast({ title: "Nepodařilo se přepnout", description: error.message, variant: "destructive" });
      return;
    }
    setFlagOn(on);
    toast({ title: on ? "Nový strom AKTIVNÍ" : "Vrácen starý katalog" });
  }

  const buildPct = buildRun?.vehicles_total ? Math.round((buildRun.vehicles_done / buildRun.vehicles_total) * 100) : 0;
  const classifyPct = classifyRun?.vehicles_total ? Math.round((classifyRun.vehicles_done / classifyRun.vehicles_total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">J+M kategorie</div>
          <div className="text-3xl font-bold">{stats.categories}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Klasifikované díly</div>
          <div className="text-3xl font-bold">{stats.mappedParts} <span className="text-sm text-muted-foreground">/ {stats.totalParts}</span></div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Status nového stromu</div>
          <div className="flex items-center gap-2 mt-2">
            <Switch checked={flagOn} onCheckedChange={toggleFlag} />
            <Label className={flagOn ? "text-emerald-400" : "text-muted-foreground"}>
              {flagOn ? "AKTIVNÍ" : "Vypnuto"}
            </Label>
          </div>
        </CardContent></Card>
      </div>

      {/* Step 1: Build tree */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <TreePine className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold text-lg">Krok 1: Postavit J+M strom</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Pro každý motor (~81 vozidel) AI vygeneruje TecDoc-kompatibilní strom kategorií a subkategorií.
                Idempotentní — lze pouštět opakovaně.
              </p>
            </div>
            <Button onClick={startBuild} disabled={working === "build" || buildRun?.status === "running"}>
              {(working === "build" || buildRun?.status === "running") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spustit sync stromu
            </Button>
          </div>

          {buildRun && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{buildRun.current_step || buildRun.status}</span>
                <Badge variant={buildRun.status === "done" ? "default" : "secondary"}>
                  {buildRun.status === "done" ? <CheckCircle2 className="h-3 w-3 mr-1" /> : null}
                  {buildRun.vehicles_done}/{buildRun.vehicles_total} • {buildRun.categories_created} kategorií
                </Badge>
              </div>
              <Progress value={buildPct} />
              {buildRun.last_error && (
                <div className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{buildRun.last_error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 2: Classify parts */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-amber-400" />
                <h3 className="font-semibold text-lg">Krok 2: Klasifikovat díly do nového stromu</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                AI Gemini Flash zařadí každý díl z parts_new do správné J+M subkategorie. Mopar/CSV ceny zůstávají nedotčené —
                vytváříme jen mapování v catalog_part_categories.
              </p>
            </div>
            <Button onClick={startClassify} disabled={working === "classify" || classifyRun?.status === "running" || stats.categories === 0}>
              {(working === "classify" || classifyRun?.status === "running") && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Spustit klasifikaci
            </Button>
          </div>

          {stats.categories === 0 && (
            <div className="text-xs text-amber-400 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Nejdřív spusť Krok 1 (strom je prázdný)
            </div>
          )}

          {classifyRun && (
            <div className="space-y-2 pt-2 border-t border-border">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{classifyRun.current_step || classifyRun.status}</span>
                <Badge variant={classifyRun.status === "done" ? "default" : "secondary"}>
                  {classifyRun.parts_classified} klasifikováno
                </Badge>
              </div>
              <Progress value={classifyPct} />
              {classifyRun.last_error && (
                <div className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />{classifyRun.last_error}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Step 3: Activation */}
      <Card>
        <CardContent className="p-6 space-y-3">
          <div className="flex items-center gap-2">
            <Power className={`h-5 w-5 ${flagOn ? "text-emerald-400" : "text-muted-foreground"}`} />
            <h3 className="font-semibold text-lg">Krok 3: Aktivace nového stromu</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            Po dokončení kroků 1 a 2 přepneš katalog na nový strom. Lze kdykoliv vrátit zpět — není destruktivní.
            Mopar/CSV díly zůstávají na 1. místě (OEM-first ranking).
          </p>
          <div className="flex items-center gap-3 pt-2">
            <Switch checked={flagOn} onCheckedChange={toggleFlag} id="flag-tree" />
            <Label htmlFor="flag-tree" className="cursor-pointer">
              {flagOn ? "✅ Nový J+M strom je AKTIVNÍ pro všechny uživatele" : "Aktivovat nový J+M strom"}
            </Label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
