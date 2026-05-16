/**
 * AdminCompatMatcher — manually trigger compat-matcher edge function
 * for a chosen brand / model / engine / category and watch the run summary.
 *
 * Edge function `compat-matcher` action `match-all` now accepts:
 *   { brand, model, engine, category, limit, onlyMissing }
 * and returns counts: { candidates, processed, exact, supersession, crossref, fuzzy, queued }.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Wand2, Link2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { fetchBrands, fetchModelsForBrand, fetchEnginesForModel } from "@/api/catalogV2API";

const CATEGORIES = [
  "Brzdové zařízení", "Motor", "Chlazení", "Odpružení", "Klimatizace",
  "Elektroinstalace", "Filtry", "Palivový systém", "Převodovka", "Výfuk",
  "Karoserie", "Kapaliny a oleje", "Řízení", "Náprava", "Osvětlení", "Ostatní",
];

type RunResult = {
  ok?: boolean;
  candidates?: number;
  processed?: number;
  exact?: number;
  supersession?: number;
  crossref?: number;
  fuzzy?: number;
  queued?: number;
  error?: string;
  scope?: { brand?: string; model?: string; engine?: string; category?: string; onlyMissing?: boolean };
};

export default function AdminCompatMatcher() {
  const [brands, setBrands] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [engines, setEngines] = useState<string[]>([]);

  const [brand, setBrand] = useState<string>("");
  const [model, setModel] = useState<string>("");
  const [engine, setEngine] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [limit, setLimit] = useState<number>(200);
  const [onlyMissing, setOnlyMissing] = useState(true);

  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunResult | null>(null);
  const [queueWaiting, setQueueWaiting] = useState<number>(0);

  useEffect(() => {
    fetchBrands().then(setBrands).catch(() => setBrands([]));
    refreshQueueWaiting();
  }, []);

  useEffect(() => {
    if (!brand) { setModels([]); setModel(""); return; }
    fetchModelsForBrand(brand).then(setModels).catch(() => setModels([]));
  }, [brand]);

  useEffect(() => {
    if (!brand || !model) { setEngines([]); setEngine(""); return; }
    fetchEnginesForModel(brand, model).then(setEngines).catch(() => setEngines([]));
  }, [brand, model]);

  const refreshQueueWaiting = async () => {
    const { count } = await supabase
      .from("compatibility_match_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");
    setQueueWaiting(count ?? 0);
  };

  const run = async () => {
    setRunning(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = {
        action: "match-all",
        limit,
        onlyMissing,
      };
      if (brand) body.brand = brand;
      if (model) body.model = model;
      if (engine) body.engine = engine;
      if (category) body.category = category;

      const { data, error } = await supabase.functions.invoke("compat-matcher", { body });
      if (error) throw error;
      setResult(data as RunResult);
      toast({
        title: "Párování dokončeno",
        description: `Zpracováno ${data?.processed ?? 0} dílů, navázáno ${(data?.exact ?? 0) + (data?.fuzzy ?? 0)} vazeb.`,
      });
      await refreshQueueWaiting();
    } catch (e: any) {
      toast({ title: "Chyba", description: e?.message || String(e), variant: "destructive" });
      setResult({ error: e?.message || String(e) });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card>
      <CardHeader className="p-3 pb-1">
        <CardTitle className="text-base flex items-center gap-2">
          <Link2 className="w-4 h-4 text-primary" />
          Manuální párování OEM ↔ vozidla
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Spustí <code>compat-matcher</code> pro vybraný rozsah. Funguje přes existující J+M vazby + supersessions + crossrefs + fuzzy.
        </p>
      </CardHeader>
      <CardContent className="p-3 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div>
            <Label className="text-[10px] text-muted-foreground">Značka</Label>
            <Select value={brand} onValueChange={setBrand}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Všechny" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Všechny</SelectItem>
                {brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Model</Label>
            <Select value={model} onValueChange={setModel} disabled={!brand}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Všechny" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Všechny</SelectItem>
                {models.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Motor</Label>
            <Select value={engine} onValueChange={setEngine} disabled={!model}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Všechny" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Všechny</SelectItem>
                {engines.filter(Boolean).map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Kategorie</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Všechny" /></SelectTrigger>
              <SelectContent>
                <SelectItem value=" ">Všechny</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label className="text-[10px] text-muted-foreground">Limit dílů na běh</Label>
            <Input
              type="number"
              value={limit}
              min={10}
              max={1000}
              onChange={(e) => setLimit(Math.min(1000, Math.max(10, Number(e.target.value) || 200)))}
              className="h-8 w-28 text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={onlyMissing} onCheckedChange={setOnlyMissing} id="onlyMissing" />
            <Label htmlFor="onlyMissing" className="text-xs">Jen díly bez vazby</Label>
          </div>
          <Button onClick={run} disabled={running} size="sm" className="ml-auto">
            {running ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />}
            {running ? "Páruji…" : "Spustit párování"}
          </Button>
        </div>

        {result && !result.error && (
          <div className="rounded-lg border border-border/50 p-3 bg-card/40 text-xs space-y-2">
            <div className="flex flex-wrap gap-1">
              <Badge variant="outline">Kandidátů: {result.candidates ?? 0}</Badge>
              <Badge variant="outline">Zpracováno: {result.processed ?? 0}</Badge>
              <Badge className="bg-success/15 text-success border-success/30">Exact: {result.exact ?? 0}</Badge>
              <Badge className="bg-primary/15 text-primary border-primary/30">Supersession: {result.supersession ?? 0}</Badge>
              <Badge className="bg-primary/15 text-primary border-primary/30">Crossref: {result.crossref ?? 0}</Badge>
              <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">Fuzzy auto: {result.fuzzy ?? 0}</Badge>
              <Badge variant="destructive">Do fronty schválení: {result.queued ?? 0}</Badge>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Rozsah: {result.scope?.brand || "—"} · {result.scope?.model || "—"} · {result.scope?.engine || "—"} · {result.scope?.category || "—"}
              {result.scope?.onlyMissing ? " · jen díly bez vazby" : ""}
            </p>
          </div>
        )}
        {result?.error && (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>{result.error}</span>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground border-t border-border/40 pt-2 flex items-center gap-2">
          <Badge variant="outline">Čeká na schválení: {queueWaiting}</Badge>
          <span>fuzzy match s nízkou jistotou — najdeš v <code>compatibility_match_queue</code>.</span>
        </div>
      </CardContent>
    </Card>
  );
}
