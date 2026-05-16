import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, CheckCircle, XCircle, Wand2, Undo2, Filter as FilterIcon } from "lucide-react";

const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Lancia"] as const;

export default function AdminCompatibility() {
  return (
    <div className="container mx-auto p-4 max-w-6xl">
      <PageHeader title="Kompatibilita dílů" subtitle="Auto-matcher, hromadné připojování a fronta ke kontrole" />
      <Tabs defaultValue="engineid" className="mt-4">
        <TabsList className="flex flex-wrap h-auto">
          <TabsTrigger value="engineid">Engine ID (TecDoc K-type)</TabsTrigger>
          <TabsTrigger value="textmatch">Text-match shody</TabsTrigger>
          <TabsTrigger value="matcher">Auto-Matcher</TabsTrigger>
          <TabsTrigger value="bulk">Bulk Attach</TabsTrigger>
          <TabsTrigger value="queue">Match Queue</TabsTrigger>
          <TabsTrigger value="stats">Statistiky</TabsTrigger>
        </TabsList>
        <TabsContent value="engineid"><EngineIdMappingTab /></TabsContent>
        <TabsContent value="textmatch"><TextMatchReviewTab /></TabsContent>
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

function TextMatchReviewTab() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [methodFilter, setMethodFilter] = useState<string>("text-fuzzy");
  const [brandFilter, setBrandFilter] = useState<string>("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  // Map match_method -> reason label & color
  const reasonMeta = (m: string | null) => {
    const k = (m || "").toLowerCase();
    if (k.includes("alias")) return { label: "Alias modelu", cls: "bg-blue-500/20 text-blue-300 border-blue-500/30" };
    if (k.includes("fuzzy")) return { label: "Fuzzy podobnost", cls: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
    if (k.includes("text")) return { label: "Textová shoda", cls: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    if (k.includes("inherit")) return { label: "Zděděno z modelu", cls: "bg-purple-500/20 text-purple-300 border-purple-500/30" };
    return { label: m || "Neznámý", cls: "bg-slate-500/20 text-slate-300 border-slate-500/30" };
  };

  async function load() {
    setLoading(true);
    let q = supabase
      .from("catalog_vehicle_compatibility")
      .select("id, part_id, nextis_vehicle_id, brand, model, engine, match_method, match_confidence, source, created_at")
      .not("nextis_vehicle_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(200);

    if (methodFilter && methodFilter !== "all") q = q.ilike("match_method", `%${methodFilter}%`);
    if (brandFilter) q = q.ilike("brand", `%${brandFilter}%`);

    const { data, error } = await q;
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }
    // Enrich with part name + vehicle label
    const partIds = Array.from(new Set((data || []).map((r: any) => r.part_id).filter(Boolean)));
    const vehIds = Array.from(new Set((data || []).map((r: any) => r.nextis_vehicle_id).filter(Boolean)));
    const [{ data: parts }, { data: vehs }] = await Promise.all([
      partIds.length
        ? supabase.from("parts_new").select("id, name, oem_number").in("id", partIds)
        : Promise.resolve({ data: [] as any[] }),
      vehIds.length
        ? supabase.from("nextis_vehicles").select("id, brand, model, engine, year_from, year_to").in("id", vehIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const partMap = new Map((parts || []).map((p: any) => [p.id, p]));
    const vehMap = new Map((vehs || []).map((v: any) => [v.id, v]));
    setItems(
      (data || []).map((r: any) => ({
        ...r,
        part: partMap.get(r.part_id) || null,
        vehicle: vehMap.get(r.nextis_vehicle_id) || null,
      })),
    );
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [methodFilter, brandFilter]);

  async function approve(item: any) {
    setBusy((b) => ({ ...b, [item.id]: true }));
    const newMethod = `${item.match_method || "text"}-approved`;
    const { error } = await supabase
      .from("catalog_vehicle_compatibility")
      .update({ match_method: newMethod, match_confidence: 100, source: "manual" })
      .eq("id", item.id);
    setBusy((b) => ({ ...b, [item.id]: false }));
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Schváleno", description: "Vazba potvrzena ručně." });
    load();
  }

  async function revert(item: any) {
    if (!confirm("Vrátit (smazat) tuto vazbu?")) return;
    setBusy((b) => ({ ...b, [item.id]: true }));
    const { error } = await supabase.from("catalog_vehicle_compatibility").delete().eq("id", item.id);
    setBusy((b) => ({ ...b, [item.id]: false }));
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Vráceno", description: "Vazba odstraněna." });
    load();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FilterIcon className="h-4 w-4" /> Kontrola textových / aliasových / fuzzy shod
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Zobrazuje vazby part ↔ vozidlo vytvořené automaticky. U každého řádku je důvod přiřazení a tlačítka pro
          <strong> Schválit</strong> (potvrdit ručně) nebo <strong>Vrátit</strong> (smazat vazbu).
        </p>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground">Důvod:</label>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className="bg-background border border-border rounded px-2 py-1 text-sm"
          >
            <option value="all">Vše</option>
            <option value="text-fuzzy">Fuzzy podobnost</option>
            <option value="text-match">Text match</option>
            <option value="alias">Alias modelu</option>
            <option value="text">Text (legacy)</option>
            <option value="inherit_model">Zděděno z modelu</option>
          </select>
          <Input
            value={brandFilter}
            onChange={(e) => setBrandFilter(e.target.value)}
            placeholder="Filtr značky…"
            className="w-40"
          />
          <Button size="sm" variant="outline" onClick={load}>Obnovit</Button>
          <Badge variant="outline" className="ml-auto">{items.length} vazeb</Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">Žádné vazby k zobrazení.</div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {items.map((item) => {
              const meta = reasonMeta(item.match_method);
              const v = item.vehicle;
              return (
                <div
                  key={item.id}
                  className="flex flex-col md:flex-row md:items-center justify-between gap-2 border border-border rounded p-3 text-sm bg-card/40"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className={`text-[10px] ${meta.cls}`}>{meta.label}</Badge>
                      <Badge variant="secondary" className="text-[10px]">{item.match_confidence ?? 0}%</Badge>
                      {item.match_method && (
                        <span className="text-[10px] font-mono text-muted-foreground">{item.match_method}</span>
                      )}
                    </div>
                    <div className="mt-1 truncate">
                      <span className="font-medium">{item.part?.name || "—"}</span>
                      {item.part?.oem_number && (
                        <span className="text-xs font-mono text-muted-foreground ml-2">{item.part.oem_number}</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      ↔ {v ? `${v.brand} ${v.model} ${v.engine || ""} ${v.year_from ? `(${v.year_from}–${v.year_to || "…"})` : ""}` : `${item.brand} ${item.model}`}
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => approve(item)}
                      disabled={busy[item.id]}
                      className="border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Schválit
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => revert(item)}
                      disabled={busy[item.id]}
                      className="border-red-500/40 text-red-300 hover:bg-red-500/10"
                    >
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Vrátit
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
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

function EngineIdMappingTab() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [form, setForm] = useState({
    brand: "Chrysler", model: "", engine: "", year_from: "", year_to: "",
    power_kw: "", fuel: "", vin_pattern: "", k_type: "", k_type_label: "", notes: "",
  });
  const [candidates, setCandidates] = useState<any[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [validateState, setValidateState] = useState<Record<string, { valid?: boolean; sampleHits?: number; loading?: boolean }>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicle_engine_mappings")
      .select("id, brand, model, engine, year_from, year_to, power_kw, fuel, vin_pattern, k_type, k_type_label, source, verified_at, notes, created_at")
      .order("brand").order("model").order("year_from", { ascending: false });
    setLoading(false);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    setRows(data || []);
  }
  useEffect(() => { load(); }, []);

  async function lookup() {
    if (!form.brand || !form.model) {
      return toast({ title: "Vyplň brand + model", variant: "destructive" });
    }
    setLookupLoading(true);
    setCandidates([]);
    const { data, error } = await supabase.functions.invoke("nextis-ktype-lookup", {
      body: {
        action: "lookup",
        brand: form.brand, model: form.model, engine: form.engine,
        yearFrom: form.year_from ? Number(form.year_from) : undefined,
        yearTo: form.year_to ? Number(form.year_to) : undefined,
        powerKw: form.power_kw ? Number(form.power_kw) : undefined,
        fuel: form.fuel || undefined,
      },
    });
    setLookupLoading(false);
    if (error) return toast({ title: "Lookup selhal", description: error.message, variant: "destructive" });
    const list = (data as any)?.candidates || [];
    setCandidates(list);
    toast({ title: `${list.length} kandidátů`, description: `Z ${(data as any)?.total ?? 0} vozidel v Nextisu` });
  }

  function pickCandidate(c: any) {
    setForm(f => ({
      ...f,
      k_type: String(c.k_type),
      k_type_label: c.label || `${c.engine} ${c.power_kw}kW`,
      power_kw: String(c.power_kw || f.power_kw || ""),
      fuel: c.fuel || f.fuel,
      year_from: String(c.year_from || f.year_from || ""),
      year_to: String(c.year_to || f.year_to || ""),
    }));
  }

  async function save() {
    if (!form.brand || !form.model || !form.engine || !form.k_type) {
      return toast({ title: "Vyplň brand, model, motor a K-type", variant: "destructive" });
    }
    if (!/^\d+$/.test(form.k_type)) {
      return toast({ title: "K-type musí být číslo", variant: "destructive" });
    }
    const payload: any = {
      brand: form.brand.trim(), model: form.model.trim(), engine: form.engine.trim(),
      year_from: form.year_from ? Number(form.year_from) : null,
      year_to: form.year_to ? Number(form.year_to) : null,
      power_kw: form.power_kw ? Number(form.power_kw) : null,
      fuel: form.fuel || null,
      vin_pattern: form.vin_pattern || null,
      k_type: Number(form.k_type),
      k_type_label: form.k_type_label || null,
      notes: form.notes || null,
      source: candidates.length ? "nextis_lookup" : "manual",
      verified_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("vehicle_engine_mappings").insert(payload);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Uloženo" });
    setForm(f => ({ ...f, k_type: "", k_type_label: "", vin_pattern: "", notes: "" }));
    setCandidates([]);
    load();
  }

  async function remove(id: string) {
    if (!confirm("Smazat mapování?")) return;
    const { error } = await supabase.from("vehicle_engine_mappings").delete().eq("id", id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    setRows(r => r.filter(x => x.id !== id));
  }

  async function validate(id: string, kType: number) {
    setValidateState(s => ({ ...s, [id]: { ...s[id], loading: true } }));
    const { data, error } = await supabase.functions.invoke("nextis-ktype-lookup", {
      body: { action: "validate", kType },
    });
    setValidateState(s => ({
      ...s,
      [id]: { loading: false, valid: !error && (data as any)?.valid, sampleHits: (data as any)?.sampleHits },
    }));
  }

  async function clearCache() {
    await supabase.from("api_cache").delete().eq("cache_type", "jm_parts_for_engine");
    await supabase.from("api_cache").delete().eq("cache_type", "jm_scan_progress");
    toast({ title: "Cache vymazána", description: "partsForEngine i scan progress." });
  }

  const filtered = rows.filter(r => {
    if (!filter) return true;
    const hay = `${r.brand} ${r.model} ${r.engine} ${r.k_type}`.toLowerCase();
    return hay.includes(filter.toLowerCase());
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Nové mapování (vehicle_engine_mappings → TecDoc K-type)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Mapuje konkrétní konfiguraci (značka, model, motor, výkon, roky, případně VIN regex) na TecDoc K-type (Engine ID).
            Použito v partsForEngine pro získání plného stromu sekcí z Nextisu.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <select value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} className="h-9 px-2 rounded border bg-background text-sm">
              {ALLOWED_BRANDS.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
            <Input placeholder="Model (300C)" value={form.model} onChange={e => setForm(f => ({ ...f, model: e.target.value }))} />
            <Input placeholder="Motor (5.7L V8 HEMI)" value={form.engine} onChange={e => setForm(f => ({ ...f, engine: e.target.value }))} />
            <Input placeholder="Výkon kW" value={form.power_kw} onChange={e => setForm(f => ({ ...f, power_kw: e.target.value }))} />
            <Input placeholder="Rok od" value={form.year_from} onChange={e => setForm(f => ({ ...f, year_from: e.target.value }))} />
            <Input placeholder="Rok do" value={form.year_to} onChange={e => setForm(f => ({ ...f, year_to: e.target.value }))} />
            <Input placeholder="Palivo (benzín/diesel)" value={form.fuel} onChange={e => setForm(f => ({ ...f, fuel: e.target.value }))} />
            <Input placeholder="VIN pattern (regex, volitelné)" value={form.vin_pattern} onChange={e => setForm(f => ({ ...f, vin_pattern: e.target.value }))} />
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={lookup} disabled={lookupLoading} variant="default">
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Wand2 className="h-4 w-4 mr-2" />}
              Najít K-type v Nextisu
            </Button>
            <Input placeholder="K-type (číslo)" value={form.k_type} onChange={e => setForm(f => ({ ...f, k_type: e.target.value }))} className="w-40" />
            <Input placeholder="Popis K-type" value={form.k_type_label} onChange={e => setForm(f => ({ ...f, k_type_label: e.target.value }))} className="flex-1 min-w-48" />
            <Button onClick={save} variant="default"><CheckCircle className="h-4 w-4 mr-2" />Uložit</Button>
          </div>
          {candidates.length > 0 && (
            <div className="border rounded-md p-2 bg-muted/30 max-h-72 overflow-auto">
              <div className="text-xs font-medium mb-2">Kandidáti z Nextisu (klikni pro výběr):</div>
              <div className="space-y-1">
                {candidates.map((c, i) => (
                  <button key={i} onClick={() => pickCandidate(c)}
                    className="w-full text-left p-2 hover:bg-amber-500/10 rounded text-sm border border-transparent hover:border-amber-500/30 flex items-center gap-3">
                    <Badge variant="outline">K-type {c.k_type}</Badge>
                    <span className="font-medium">{c.label || c.engine}</span>
                    <span className="text-muted-foreground text-xs">
                      {c.power_kw ? `${c.power_kw}kW` : ""}{c.power_hp ? ` (${c.power_hp}HP)` : ""}
                      {c.year_from || c.year_to ? ` · ${c.year_from || "?"}–${c.year_to || "?"}` : ""}
                      {c.fuel ? ` · ${c.fuel}` : ""}
                    </span>
                    <Badge className="ml-auto" variant={c.score >= 50 ? "default" : "secondary"}>skóre {c.score}</Badge>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Existující mapování ({rows.length})</span>
            <div className="flex gap-2">
              <Input placeholder="Filtr…" value={filter} onChange={e => setFilter(e.target.value)} className="w-48" />
              <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Načíst"}
              </Button>
              <Button variant="destructive" size="sm" onClick={clearCache}>Vymazat cache</Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className="text-left p-2">Vozidlo</th>
                  <th className="text-left p-2">Roky</th>
                  <th className="text-left p-2">Výkon/Palivo</th>
                  <th className="text-left p-2">VIN pattern</th>
                  <th className="text-left p-2">K-type</th>
                  <th className="text-left p-2">Zdroj</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => {
                  const v = validateState[r.id];
                  return (
                    <tr key={r.id} className="border-t">
                      <td className="p-2"><strong>{r.brand}</strong> {r.model}<br /><span className="text-muted-foreground text-xs">{r.engine}</span></td>
                      <td className="p-2 text-muted-foreground">{r.year_from || "?"}–{r.year_to || "?"}</td>
                      <td className="p-2 text-muted-foreground">{r.power_kw ? `${r.power_kw}kW` : "—"}{r.fuel ? ` · ${r.fuel}` : ""}</td>
                      <td className="p-2 text-xs"><code>{r.vin_pattern || "—"}</code></td>
                      <td className="p-2"><Badge variant="outline">{r.k_type}</Badge>{r.k_type_label && <div className="text-xs text-muted-foreground mt-0.5">{r.k_type_label}</div>}</td>
                      <td className="p-2"><Badge variant={r.source === "nextis_lookup" ? "default" : "secondary"}>{r.source}</Badge></td>
                      <td className="p-2">
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => validate(r.id, r.k_type)} disabled={v?.loading}>
                            {v?.loading ? <Loader2 className="h-3 w-3 animate-spin" /> :
                              v?.valid === true ? <CheckCircle className="h-3 w-3 text-green-500" /> :
                              v?.valid === false ? <XCircle className="h-3 w-3 text-destructive" /> :
                              <Play className="h-3 w-3" />}
                            <span className="ml-1">Test</span>
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Undo2 className="h-3 w-3" /></Button>
                        </div>
                        {v?.sampleHits !== undefined && <div className="text-xs text-muted-foreground mt-1">{v.sampleHits} hitů</div>}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">Žádná mapování</td></tr>}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

