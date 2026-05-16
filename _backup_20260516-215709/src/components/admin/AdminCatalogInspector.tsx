import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { Loader2, Wrench, Brain, History, Play, Download, CheckCircle2 } from "lucide-react";

type Snapshot = { id: string; label: string; trigger: string | null; created_at: string; parts_count: number; vehicles_count: number; compat_count: number; category_count: number; price_missing: number; stats: any };
type FixLog = { id: string; fix_type: string; reason: string | null; affected_count: number; created_at: string; before_value: any; after_value: any };
type Anomaly = { id: string; oem_number: string | null; anomaly_type: string; severity: string; field: string | null; current_value: string | null; suggested_value: string | null; ai_reason: string | null; ai_confidence: number | null; status: string; created_at: string };

export default function AdminCatalogInspector() {
  const [busy, setBusy] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [fixes, setFixes] = useState<FixLog[]>([]);
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [lastResult, setLastResult] = useState<any>(null);

  async function refresh() {
    const [s, f, a] = await Promise.all([
      supabase.functions.invoke("catalog-quickfix", { body: { action: "list_snapshots" } }),
      supabase.functions.invoke("catalog-quickfix", { body: { action: "list_fixes" } }),
      supabase.functions.invoke("catalog-ai-inspector", { body: { action: "list", status: "open" } }),
    ]);
    setSnapshots((s.data as any)?.snapshots ?? []);
    setFixes((f.data as any)?.fixes ?? []);
    setAnomalies((a.data as any)?.anomalies ?? []);
  }
  useEffect(() => { refresh(); }, []);

  async function call(action: string, body: any, name = "catalog-quickfix") {
    setBusy(action);
    try {
      const { data, error } = await supabase.functions.invoke(name, { body });
      if (error) throw error;
      setLastResult(data);
      toast({ title: "Hotovo", description: `${action} dokončeno` });
      await refresh();
    } catch (e: any) {
      toast({ title: "Chyba", description: String(e?.message || e), variant: "destructive" });
    } finally {
      setBusy(null);
    }
  }

  function downloadJson(name: string, data: any) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Inteligentní inspektor katalogu</h2>
          <p className="text-sm text-muted-foreground">Quick-fixes • Snapshoty • AI detekce anomálií</p>
        </div>
        <Button variant="outline" onClick={refresh} disabled={!!busy}>Obnovit</Button>
      </div>

      <Tabs defaultValue="quickfix">
        <TabsList>
          <TabsTrigger value="quickfix"><Wrench className="w-4 h-4 mr-2" />Quick-Fix</TabsTrigger>
          <TabsTrigger value="ai"><Brain className="w-4 h-4 mr-2" />AI inspektor</TabsTrigger>
          <TabsTrigger value="snapshots"><History className="w-4 h-4 mr-2" />Snapshoty</TabsTrigger>
          <TabsTrigger value="log">Log oprav</TabsTrigger>
        </TabsList>

        <TabsContent value="quickfix" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>Automatické opravy</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {[
                ["run_all", "Spustit vše"],
                ["mark_on_order", "Označit „Na objednávku"],
                ["normalize_categories", "Normalizovat kategorie"],
                ["dedupe_compat", "Odstranit duplicitní kompatibility"],
                ["trim_names", "Vyčistit názvy"],
                ["fix_currency", "Doplnit měnu (CZK)"],
                ["fix_active", "Aktivovat NULL is_active"],
              ].map(([k, label]) => (
                <Button key={k} disabled={!!busy} onClick={() => call(k as string, { action: k })}>
                  {busy === k ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  {label}
                </Button>
              ))}
            </CardContent>
          </Card>
          {lastResult && (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Výsledek poslední akce</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => downloadJson(`quickfix-${Date.now()}.json`, lastResult)}>
                  <Download className="w-4 h-4 mr-1" />Export
                </Button>
              </CardHeader>
              <CardContent>
                <pre className="text-xs overflow-auto max-h-96 bg-muted p-3 rounded">{JSON.stringify(lastResult, null, 2)}</pre>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Card>
            <CardHeader><CardTitle>AI sken anomálií (Gemini)</CardTitle></CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button disabled={!!busy} onClick={() => call("scan", { action: "scan", limit: 50 }, "catalog-ai-inspector")}>
                {busy === "scan" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Brain className="w-4 h-4 mr-2" />}
                Skenovat 50 dílů
              </Button>
              <Button disabled={!!busy} variant="secondary" onClick={() => call("scan-apply", { action: "scan", limit: 50, autoApply: true, minConfidence: 0.9 }, "catalog-ai-inspector")}>
                Skenovat + auto-aplikovat (≥90%)
              </Button>
              <Button disabled={!!busy} variant="outline" onClick={() => downloadJson(`anomalies-${Date.now()}.json`, anomalies)}>
                <Download className="w-4 h-4 mr-2" />Export anomálií
              </Button>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Otevřené anomálie ({anomalies.length})</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-[600px] overflow-auto">
                {anomalies.map((a) => (
                  <div key={a.id} className="p-3 border rounded text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={a.severity === "high" ? "destructive" : "secondary"}>{a.severity}</Badge>
                        <Badge variant="outline">{a.anomaly_type}</Badge>
                        <span className="font-mono text-xs">{a.oem_number}</span>
                      </div>
                      <Button size="sm" variant="ghost" onClick={async () => {
                        await supabase.functions.invoke("catalog-ai-inspector", { body: { action: "resolve", id: a.id } });
                        refresh();
                      }}>
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <div className="mt-1"><strong>{a.field}:</strong> <span className="line-through text-muted-foreground">{a.current_value}</span> → <span className="text-primary">{a.suggested_value}</span></div>
                    <div className="text-xs text-muted-foreground mt-1">{a.ai_reason} ({Math.round((a.ai_confidence ?? 0) * 100)}%)</div>
                  </div>
                ))}
                {!anomalies.length && <div className="text-sm text-muted-foreground">Žádné otevřené anomálie.</div>}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="snapshots" className="space-y-4">
          <div className="flex justify-between">
            <Button disabled={!!busy} onClick={() => call("snapshot", { action: "snapshot", label: `manual ${new Date().toLocaleString()}` })}>
              <History className="w-4 h-4 mr-2" />Vytvořit snapshot
            </Button>
            <Button variant="outline" onClick={() => downloadJson(`snapshots-${Date.now()}.json`, snapshots)}>
              <Download className="w-4 h-4 mr-2" />Export
            </Button>
          </div>
          <div className="grid gap-2">
            {snapshots.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-3 text-sm flex flex-wrap gap-3 items-center justify-between">
                  <div>
                    <div className="font-semibold">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{new Date(s.created_at).toLocaleString()} • {s.trigger}</div>
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span>Díly: <strong>{s.parts_count}</strong></span>
                    <span>Vozy: <strong>{s.vehicles_count}</strong></span>
                    <span>Kompat: <strong>{s.compat_count}</strong></span>
                    <span>Kategorie: <strong>{s.category_count}</strong></span>
                    <span className="text-warning">Bez ceny: <strong>{s.price_missing}</strong></span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="log" className="space-y-2">
          <Button variant="outline" onClick={() => downloadJson(`fixlog-${Date.now()}.json`, fixes)}>
            <Download className="w-4 h-4 mr-2" />Export logu
          </Button>
          <div className="max-h-[700px] overflow-auto space-y-1">
            {fixes.map((f) => (
              <div key={f.id} className="p-2 border rounded text-xs flex justify-between gap-2">
                <div>
                  <Badge variant="outline">{f.fix_type}</Badge>
                  <span className="ml-2">{f.reason}</span>
                </div>
                <div className="flex gap-2 text-muted-foreground">
                  <span>×{f.affected_count}</span>
                  <span>{new Date(f.created_at).toLocaleString()}</span>
                </div>
              </div>
            ))}
            {!fixes.length && <div className="text-sm text-muted-foreground">Žádné záznamy.</div>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
