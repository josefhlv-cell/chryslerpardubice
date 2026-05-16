/**
 * AdminCatalogJmAudit — 1:1 ověření katalogu vůči J+M.
 * Kontroluje: vozidla bez K-type, bez kompatibilit, bez stromu, díly bez klasifikace,
 * díly bez ceny (mají být "Na objednávku"), díly bez kompatibility, ne-kanonické kategorie.
 * Nabídí cílené opravy.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Loader2, Play, Wrench, ShieldCheck, AlertTriangle, RefreshCw, Search, CheckCircle2 } from "lucide-react";

type Vehicle = {
  id: string; brand: string; model: string; engine: string | null;
  year_from: number | null; year_to: number | null;
  external_id: string | null;
  parts: number; categories: number; subcategories: number;
  issues: string[]; ok: boolean;
};

type Report = {
  generated_at: string;
  summary: {
    totalParts: number; mappedParts: number; classificationRate: number;
    compatibilityLinks: number; vehicles: number; vehiclesOk: number; vehiclesWithIssues: number;
    categoryNodes: { globals: number; categories: number; subcategories: number };
    priceMissing: number; unmappedParts: number; partsWithoutCompat: number; nonCanonicalCategories: number;
  };
  perVehicle: Vehicle[];
  samples: {
    unmapped: any[]; noPrice: any[]; noCompat: any[]; nonCanonicalCategories: string[];
  };
};

export default function AdminCatalogJmAudit() {
  const [report, setReport] = useState<Report | null>(null);
  const [progress, setProgress] = useState<any>(null);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState("");
  const [fixing, setFixing] = useState<string | null>(null);

  const loadReport = async () => {
    const { data } = await supabase.functions.invoke("catalog-jm-audit", { body: { action: "report" } });
    if (data?.report) setReport(data.report as Report);
  };
  const loadProgress = async () => {
    const { data } = await supabase.functions.invoke("catalog-jm-audit", { body: { action: "progress" } });
    setProgress(data?.progress);
    if (data?.progress?.status === "done") { setRunning(false); await loadReport(); }
    if (data?.progress?.status === "failed") { setRunning(false); }
  };

  useEffect(() => { loadReport(); loadProgress(); }, []);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(loadProgress, 3000);
    return () => clearInterval(t);
  }, [running]);

  const startAudit = async () => {
    setRunning(true);
    setProgress({ status: "running", phase: "queued" });
    const { data, error } = await supabase.functions.invoke("catalog-jm-audit", { body: { action: "run" } });
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); setRunning(false); }
    else toast({ title: "Audit spuštěn", description: data?.message });
  };

  const applyFix = async (fix: string, label: string) => {
    setFixing(fix);
    const { data, error } = await supabase.functions.invoke("catalog-jm-audit", { body: { action: "fix", fix } });
    setFixing(null);
    if (error || !data?.ok) {
      toast({ title: "Oprava selhala", description: error?.message || data?.error, variant: "destructive" });
    } else {
      toast({ title: label, description: data?.message || `Ovlivněno: ${data?.affected ?? "—"}` });
      setTimeout(loadReport, 4000);
    }
  };

  const filtered = (report?.perVehicle || []).filter((v) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return v.brand.toLowerCase().includes(q) || v.model.toLowerCase().includes(q) || (v.engine || "").toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> 1:1 audit katalogu vs. J+M
          </h2>
          <p className="text-xs text-muted-foreground">
            Strukturální kontrola: vozy, kategorie, kompatibility, ceny, klasifikace.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={startAudit} disabled={running} className="gap-2">
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
            Spustit audit
          </Button>
          <Button variant="outline" size="sm" onClick={() => { loadReport(); loadProgress(); }}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {progress && progress.status !== "done" && (
        <Card><CardContent className="p-3 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span>Stav: <strong>{progress.phase || progress.status}</strong></span>
            <Badge variant={progress.status === "failed" ? "destructive" : "secondary"}>{progress.status}</Badge>
          </div>
          {progress.status === "running" && <Progress value={progress.phase === "summary" ? 20 : progress.phase === "per-vehicle" ? 60 : 90} />}
          {progress.error && <p className="text-xs text-destructive">{progress.error}</p>}
        </CardContent></Card>
      )}

      {!report && !running && (
        <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">
          Zatím žádný audit. Klikni na "Spustit audit".
        </CardContent></Card>
      )}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Vozů celkem" value={report.summary.vehicles} sub={`OK: ${report.summary.vehiclesOk}`} />
            <StatCard label="Problémových vozů" value={report.summary.vehiclesWithIssues} warn={report.summary.vehiclesWithIssues > 0} />
            <StatCard label="Klasifikace dílů" value={`${report.summary.classificationRate}%`} sub={`${report.summary.mappedParts}/${report.summary.totalParts}`} />
            <StatCard label="Bez ceny → Na objednávku" value={report.summary.priceMissing} warn={report.summary.priceMissing > 0} />
            <StatCard label="Kompatibility (vazby)" value={report.summary.compatibilityLinks} />
            <StatCard label="Globálních kategorií" value={report.summary.categoryNodes.globals} />
            <StatCard label="Kategorií / Sub" value={`${report.summary.categoryNodes.categories}/${report.summary.categoryNodes.subcategories}`} />
            <StatCard label="Ne-kanonické kategorie" value={report.summary.nonCanonicalCategories} warn={report.summary.nonCanonicalCategories > 0} />
          </div>

          <Card>
            <CardContent className="p-4 space-y-2">
              <p className="font-semibold text-sm flex items-center gap-2"><Wrench className="w-4 h-4 text-primary" /> Rychlé opravy</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" disabled={!!fixing} onClick={() => applyFix("mark_on_order", "Označeno jako Na objednávku")}>
                  {fixing === "mark_on_order" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Označit díly bez ceny → Na objednávku
                </Button>
                <Button size="sm" variant="outline" disabled={!!fixing} onClick={() => applyFix("reclassify", "Reklasifikace")}>
                  {fixing === "reclassify" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Reklasifikovat všechny díly
                </Button>
                <Button size="sm" variant="outline" disabled={!!fixing} onClick={() => applyFix("rebuild_compat", "Opětovné spárování")}>
                  {fixing === "rebuild_compat" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Doplnit chybějící kompatibility
                </Button>
                <Button size="sm" variant="outline" disabled={!!fixing} onClick={() => applyFix("rebuild_tree", "Build stromu")}>
                  {fixing === "rebuild_tree" && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                  Přestavět J+M strom
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-sm">Vozy ({filtered.length})</p>
                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input className="h-8 pl-7 text-xs" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrovat značku/model/motor…" />
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-left text-muted-foreground border-b border-border">
                    <tr>
                      <th className="py-2">Vůz</th><th>Motor</th><th>Roky</th>
                      <th>K-type</th><th>Díly</th><th>Kat./Sub</th><th>Stav</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((v) => (
                      <tr key={v.id} className={`border-b border-border/40 ${v.ok ? "" : "bg-destructive/5"}`}>
                        <td className="py-2 font-medium">{v.brand} {v.model}</td>
                        <td>{v.engine || "—"}</td>
                        <td>{v.year_from || "?"}–{v.year_to || "…"}</td>
                        <td>{v.external_id ? <Badge variant="outline" className="text-[10px]">{v.external_id}</Badge> : <span className="text-destructive">chybí</span>}</td>
                        <td>{v.parts}</td>
                        <td>{v.categories}/{v.subcategories}</td>
                        <td>
                          {v.ok
                            ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="w-3 h-3" />OK</span>
                            : <span className="inline-flex items-center gap-1 text-destructive"><AlertTriangle className="w-3 h-3" />{v.issues.length}</span>}
                          {!v.ok && <div className="text-[10px] text-muted-foreground mt-1">{v.issues.join(" · ")}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {report.samples.nonCanonicalCategories.length > 0 && (
            <Card><CardContent className="p-4 space-y-1">
              <p className="font-semibold text-sm">Ne-kanonické kategorie ({report.samples.nonCanonicalCategories.length})</p>
              <div className="flex flex-wrap gap-1">
                {report.samples.nonCanonicalCategories.slice(0, 50).map((c) => (
                  <Badge key={c} variant="outline" className="text-[10px]">{c}</Badge>
                ))}
              </div>
            </CardContent></Card>
          )}

          <p className="text-[10px] text-muted-foreground text-right">Vygenerováno: {new Date(report.generated_at).toLocaleString("cs-CZ")}</p>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, warn }: { label: string; value: any; sub?: string; warn?: boolean }) {
  return (
    <Card><CardContent className="p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`text-2xl font-bold ${warn ? "text-destructive" : ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
    </CardContent></Card>
  );
}
