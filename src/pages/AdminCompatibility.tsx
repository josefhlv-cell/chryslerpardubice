import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle, XCircle, Wand2 } from "lucide-react";

const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"] as const;

export default function AdminCompatibility() {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <PageHeader title="Kompatibilita dílů" subtitle="Auto-matcher, hromadné připojování a fronta ke kontrole" />
      <Tabs defaultValue="matcher" className="mt-4">
        <TabsList>
          <TabsTrigger value="matcher">Auto-Matcher</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Attach</TabsTrigger>
          <TabsTrigger value="queue">Match Queue</TabsTrigger>
          <TabsTrigger value="stats">Statistiky</TabsTrigger>
        </TabsList>
        <TabsContent value="matcher"><MatcherTab /></TabsContent>
        <TabsContent value="bulk"><BulkAttachTab /></TabsContent>
        <TabsContent value="queue"><MatchQueueTab /></TabsContent>
        <TabsContent value="stats"><StatsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

function MatcherTab() {
  const [running, setRunning] = useState(false);
  const [limit, setLimit] = useState(200);
  const [result, setResult] = useState<any>(null);

  async function run() {
    setRunning(true);
    setResult(null);
    const { data, error } = await supabase.functions.invoke("compat-matcher", {
      body: { action: "match-all", limit },
    });
    setRunning(false);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    setResult(data);
    toast({ title: "Hotovo", description: `Zpracováno ${data?.processed || 0} dílů` });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Wand2 className="h-4 w-4" /> Auto-mapovací engine</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Strategie: <strong>exact OEM</strong> → <strong>supersession</strong> → <strong>crossref</strong> → <strong>fuzzy normalized</strong> match.
          Fuzzy matche pod 95 % skóre jdou do fronty ke kontrole.
        </p>
        <div className="flex items-center gap-2">
          <label className="text-sm">Limit dílů:</label>
          <Input type="number" value={limit} onChange={(e) => setLimit(parseInt(e.target.value) || 200)} className="w-32" />
          <Button onClick={run} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            Spustit auto-match
          </Button>
        </div>
        {result && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
            <Stat label="Zpracováno" value={result.processed} />
            <Stat label="Exact" value={result.exact} />
            <Stat label="Supersession" value={result.supersession} />
            <Stat label="Crossref" value={result.crossref} />
            <Stat label="Fuzzy" value={result.fuzzy} />
            <Stat label="Do fronty" value={result.queued} highlight />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BulkAttachTab() {
  const [partOem, setPartOem] = useState("");
  const [brand, setBrand] = useState<string>("Dodge");
  const [model, setModel] = useState("");
  const [engine, setEngine] = useState("");
  const [yearFrom, setYearFrom] = useState("");
  const [yearTo, setYearTo] = useState("");
  const [running, setRunning] = useState(false);

  async function runBulk() {
    if (!partOem.trim()) return toast({ title: "Zadejte OEM", variant: "destructive" });
    setRunning(true);
    const { data: part } = await supabase
      .from("parts_new")
      .select("id, catalog_source")
      .eq("oem_number", partOem.trim())
      .maybeSingle();
    if (!part) {
      setRunning(false);
      return toast({ title: "Díl nenalezen", variant: "destructive" });
    }
    const isOem = ["mopar", "mopar_oem", "csv", "epc-ai", "7zap", "epc-link"].includes(
      (part.catalog_source || "").toLowerCase()
    );
    const { data, error } = await supabase.rpc("bulk_attach_part_to_vehicles", {
      _part_id: part.id,
      _brand: brand,
      _model_pattern: model ? `%${model}%` : null,
      _engine_pattern: engine ? `%${engine}%` : null,
      _year_from: yearFrom ? parseInt(yearFrom) : null,
      _year_to: yearTo ? parseInt(yearTo) : null,
      _is_oem: isOem,
    });
    setRunning(false);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Hotovo", description: `Připojeno ${data} vozidel` });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Hromadné připojení dílu k vozidlům</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="OEM číslo dílu *">
            <Input value={partOem} onChange={(e) => setPartOem(e.target.value)} placeholder="68225344AA" />
          </Field>
          <Field label="Značka *">
            <select value={brand} onChange={(e) => setBrand(e.target.value)} className="w-full bg-background border border-border rounded px-3 py-2 text-sm">
              {ALLOWED_BRANDS.map((b) => <option key={b}>{b}</option>)}
            </select>
          </Field>
          <Field label="Model (pattern, prázdné = všechny)">
            <Input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Challenger" />
          </Field>
          <Field label="Motor (pattern)">
            <Input value={engine} onChange={(e) => setEngine(e.target.value)} placeholder="5.7" />
          </Field>
          <Field label="Rok od">
            <Input type="number" value={yearFrom} onChange={(e) => setYearFrom(e.target.value)} placeholder="2015" />
          </Field>
          <Field label="Rok do">
            <Input type="number" value={yearTo} onChange={(e) => setYearTo(e.target.value)} placeholder="2023" />
          </Field>
        </div>
        <Button onClick={runBulk} disabled={running} size="lg">
          {running ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Play className="h-4 w-4 mr-2" />}
          Připojit ke všem odpovídajícím vozidlům
        </Button>
      </CardContent>
    </Card>
  );
}

function MatchQueueTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("compatibility_match_queue")
      .select("*")
      .eq("status", "pending")
      .order("match_confidence", { ascending: false })
      .limit(100);
    setItems(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function approve(item: any) {
    await supabase.from("catalog_vehicle_compatibility").upsert(
      {
        part_id: item.part_id,
        nextis_vehicle_id: item.nextis_vehicle_id,
        brand: "manual-approved",
        model: "manual-approved",
        is_oem: true,
        match_method: "fuzzy-approved",
        match_confidence: item.match_confidence,
        source: "manual",
      },
      { onConflict: "part_id,nextis_vehicle_id" }
    );
    await supabase.from("compatibility_match_queue").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", item.id);
    load();
  }

  async function reject(item: any) {
    await supabase.from("compatibility_match_queue").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", item.id);
    load();
  }

  if (loading) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <Card>
      <CardHeader><CardTitle>Fuzzy matche ke kontrole ({items.length})</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 && <div className="text-sm text-muted-foreground">Fronta je prázdná.</div>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between border border-border rounded p-2 text-sm">
            <div>
              <div className="font-mono">{item.oem_number} ↔ {item.matched_oem}</div>
              <div className="text-xs text-muted-foreground">
                Confidence: <Badge>{item.match_confidence}%</Badge> · {item.match_method}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => approve(item)}><CheckCircle className="h-3 w-3" /></Button>
              <Button size="sm" variant="ghost" onClick={() => reject(item)}><XCircle className="h-3 w-3" /></Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const { count: vehicleCount } = await supabase.from("nextis_vehicles").select("*", { count: "exact", head: true });
      const { count: linkCount } = await supabase.from("catalog_vehicle_compatibility").select("*", { count: "exact", head: true }).not("nextis_vehicle_id", "is", null);
      const { count: oemLinks } = await supabase.from("catalog_vehicle_compatibility").select("*", { count: "exact", head: true }).eq("is_oem", true);
      const { count: queueCount } = await supabase.from("compatibility_match_queue").select("*", { count: "exact", head: true }).eq("status", "pending");
      setStats({ vehicleCount, linkCount, oemLinks, queueCount });
    })();
  }, []);

  if (!stats) return <Loader2 className="h-6 w-6 animate-spin" />;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <Stat label="Nextis vozidla" value={stats.vehicleCount} />
      <Stat label="Aktivní vazby" value={stats.linkCount} />
      <Stat label="OEM vazby" value={stats.oemLinks} highlight />
      <Stat label="Ve frontě" value={stats.queueCount} />
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-amber-500/40" : ""}>
      <CardContent className="p-4">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={`text-2xl font-bold ${highlight ? "text-amber-400" : ""}`}>{value ?? 0}</div>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      {children}
    </div>
  );
}
