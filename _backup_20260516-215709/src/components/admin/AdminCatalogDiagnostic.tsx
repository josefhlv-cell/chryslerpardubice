import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import {
  Play, Square, RefreshCw, AlertTriangle, CheckCircle2, Search, Loader2,
  AlertOctagon, Wrench, X, Check, ShieldAlert,
} from "lucide-react";

type Run = {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  total_combinations: number;
  processed_combinations: number;
  total_parts_found: number;
  issues_found: number;
  current_step: string | null;
  last_error: string | null;
  critical_issues: any[];
  validation_summary: Record<string, number>;
};

type Result = {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  category: string | null;
  parts_count: number;
  oem_unique_count: number;
  duplicates_count: number;
  missing_names_count: number;
  missing_prices_count: number;
  zero_price_count: number;
  uncategorized_count: number;
  issues: any[];
  sample_oems: any[];
  checked_at: string;
};

type Fix = {
  id: string;
  fix_type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string | null;
  affected_count: number;
  preview: any[];
  payload: any;
  status: "pending" | "approved" | "applied" | "rejected" | "failed";
  applied_count: number | null;
  error_message: string | null;
};

const SEVERITY_STYLE: Record<string, { cls: string; label: string; icon: any }> = {
  critical: { cls: "bg-destructive/15 border-destructive/40 text-destructive", label: "KRITICKÉ", icon: AlertOctagon },
  high:     { cls: "bg-amber-500/15 border-amber-500/40 text-amber-300", label: "VYSOKÉ", icon: AlertTriangle },
  medium:   { cls: "bg-yellow-500/10 border-yellow-500/30 text-yellow-300", label: "STŘEDNÍ", icon: AlertTriangle },
  low:      { cls: "bg-muted border-border text-muted-foreground", label: "NÍZKÉ", icon: AlertTriangle },
};

export default function AdminCatalogDiagnostic() {
  const { user } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [fixes, setFixes] = useState<Fix[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [activeFix, setActiveFix] = useState<Fix | null>(null);
  const [applyingFix, setApplyingFix] = useState(false);
  const pollRef = useRef<number | null>(null);

  const callFn = async (action: string, payload: any = {}) => {
    const { data, error } = await supabase.functions.invoke("catalog-diagnostic", {
      body: { action, ...payload },
    });
    if (error) throw new Error(error.message);
    if (!data?.success) throw new Error(data?.error || "Selhalo volání");
    return data;
  };

  const refresh = async (runId?: string) => {
    try {
      const id = runId || run?.id;
      if (!id) {
        const latest = await callFn("latest");
        if (latest.run) {
          setRun(latest.run);
          const status = await callFn("status", { run_id: latest.run.id });
          setResults(status.results || []);
          setFixes(status.fixes || []);
        }
        return;
      }
      const data = await callFn("status", { run_id: id });
      setRun(data.run);
      setResults(data.results || []);
      setFixes(data.fixes || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  useEffect(() => {
    if (run && (run.status === "running" || run.status === "pending")) {
      pollRef.current = window.setInterval(() => refresh(run.id), 4000);
      return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
    }
  }, [run?.id, run?.status]); // eslint-disable-line

  const start = async () => {
    setLoading(true);
    try {
      const data = await callFn("start", { user_id: user?.id });
      toast({
        title: data.reused ? "Diagnostika již běží" : "Diagnostika spuštěna",
        description: "Nejprve prioritní validace, poté hluboký sken. Můžeš odejít.",
      });
      await refresh(data.run_id);
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally { setLoading(false); }
  };

  const cancel = async () => {
    if (!run) return;
    if (!confirm("Opravdu zrušit běžící diagnostiku?")) return;
    try {
      await callFn("cancel", { run_id: run.id });
      toast({ title: "Diagnostika zrušena" });
      await refresh();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const applyFix = async (fix: Fix) => {
    setApplyingFix(true);
    try {
      const res = await callFn("applyFix", { fix_id: fix.id, user_id: user?.id });
      toast({
        title: "Oprava aplikována",
        description: `Upraveno ${res.applied} záznamů.`,
      });
      setActiveFix(null);
      await refresh();
    } catch (e: any) {
      toast({ title: "Oprava selhala", description: e.message, variant: "destructive" });
    } finally { setApplyingFix(false); }
  };

  const rejectFix = async (fix: Fix) => {
    try {
      await callFn("rejectFix", { fix_id: fix.id });
      toast({ title: "Oprava zamítnuta" });
      setActiveFix(null);
      await refresh();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
  };

  const isRunning = run?.status === "running" || run?.status === "pending";
  const isCompleted = run?.status === "completed";
  const progress = run && run.total_combinations > 0
    ? Math.round((run.processed_combinations / run.total_combinations) * 100)
    : 0;

  const filtered = results.filter((r) => {
    if (onlyIssues && (r.issues?.length || 0) === 0) return false;
    if (!filter.trim()) return true;
    const f = filter.toLowerCase();
    return (
      r.brand.toLowerCase().includes(f) ||
      r.model.toLowerCase().includes(f) ||
      (r.engine || "").toLowerCase().includes(f) ||
      (r.category || "").toLowerCase().includes(f)
    );
  });

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending:   { label: "Čeká", cls: "bg-muted text-muted-foreground" },
      running:   { label: "Běží", cls: "bg-amber-500/20 text-amber-300" },
      completed: { label: "Hotovo", cls: "bg-emerald-500/20 text-emerald-300" },
      failed:    { label: "Chyba", cls: "bg-destructive/20 text-destructive" },
      cancelled: { label: "Zrušeno", cls: "bg-muted text-muted-foreground" },
    };
    const m = map[s] || { label: s, cls: "" };
    return <Badge className={m.cls}>{m.label}</Badge>;
  };

  const pendingFixes = fixes.filter((f) => f.status === "pending");
  const appliedFixes = fixes.filter((f) => f.status === "applied");

  return (
    <div className="space-y-4">
      {/* HEADER + CONTROLS */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-400" />
                Ladicí režim katalogu
              </h3>
              <p className="text-xs text-muted-foreground">
                Validace kategorií, OEM mapování, cen a názvů. Po dokončení nabídne konkrétní opravy ke schválení.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refresh()}>
                <RefreshCw className="w-3 h-3 mr-1" /> Obnovit
              </Button>
              {!isRunning && (
                <Button onClick={start} disabled={loading} size="sm">
                  {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
                  Spustit diagnostiku
                </Button>
              )}
              {isRunning && (
                <Button variant="destructive" size="sm" onClick={cancel}>
                  <Square className="w-3 h-3 mr-1" /> Zrušit
                </Button>
              )}
            </div>
          </div>

          {run && (
            <div className="space-y-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2 text-xs flex-wrap">
                {statusBadge(run.status)}
                <span className="text-muted-foreground">
                  {run.processed_combinations}/{run.total_combinations} kombinací · {run.total_parts_found} dílů ·{" "}
                  <span className="text-amber-400">{run.issues_found} problémů</span>
                </span>
              </div>
              <Progress value={progress} className="h-1.5" />
              {run.current_step && (
                <p className="text-[11px] text-muted-foreground italic">{run.current_step}</p>
              )}
              {run.last_error && (
                <p className="text-[11px] text-destructive">⚠ {run.last_error}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* KRITICKÉ NÁLEZY (priority) */}
      {run && (run.critical_issues?.length || 0) > 0 && (
        <Card className="border-destructive/40">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-semibold flex items-center gap-2 text-destructive">
              <ShieldAlert className="w-4 h-4" />
              Kritická zjištění ({run.critical_issues.length})
            </h3>
            <div className="space-y-2">
              {run.critical_issues.map((issue: any, i: number) => {
                const sev = SEVERITY_STYLE[issue.severity] || SEVERITY_STYLE.medium;
                const Icon = sev.icon;
                return (
                  <div key={i} className={`p-2.5 rounded border text-xs ${sev.cls}`}>
                    <div className="flex items-start gap-2">
                      <Icon className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold">{issue.title}</div>
                        <div className="opacity-80">{issue.message}</div>
                        {!issue.fixable && (
                          <div className="opacity-60 italic mt-1">⚠ Vyžaduje ruční opravu</div>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[9px]">{sev.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* NÁVRHY OPRAV — vyžadují souhlas admina */}
      {(pendingFixes.length > 0 || appliedFixes.length > 0) && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold flex items-center gap-2 text-amber-300">
                <Wrench className="w-4 h-4" />
                Navržené opravy
              </h3>
              <span className="text-xs text-muted-foreground">
                {pendingFixes.length} čekajících · {appliedFixes.length} aplikovaných
              </span>
            </div>

            {isCompleted && pendingFixes.length > 0 && (
              <p className="text-xs text-amber-300/80 bg-amber-500/10 p-2 rounded border border-amber-500/30">
                ✋ Diagnostika dokončena. Potřebujeme tvůj souhlas s každou opravou před aplikací.
              </p>
            )}

            <div className="space-y-2">
              {fixes.map((fix) => {
                const sev = SEVERITY_STYLE[fix.severity] || SEVERITY_STYLE.medium;
                const isApplied = fix.status === "applied";
                const isRejected = fix.status === "rejected";
                const isFailed = fix.status === "failed";
                return (
                  <div
                    key={fix.id}
                    className={`p-2.5 rounded border text-xs ${
                      isApplied ? "bg-emerald-500/10 border-emerald-500/30" :
                      isRejected ? "bg-muted border-border opacity-60" :
                      isFailed ? "bg-destructive/10 border-destructive/30" :
                      sev.cls
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold flex items-center gap-2">
                          {isApplied && <CheckCircle2 className="w-3 h-3 text-emerald-400" />}
                          {isRejected && <X className="w-3 h-3" />}
                          {isFailed && <AlertOctagon className="w-3 h-3 text-destructive" />}
                          {fix.title}
                        </div>
                        {fix.description && <div className="opacity-80 mt-0.5">{fix.description}</div>}
                        {isApplied && (
                          <div className="text-emerald-400 mt-1">✓ Upraveno {fix.applied_count} záznamů</div>
                        )}
                        {isFailed && fix.error_message && (
                          <div className="text-destructive mt-1">✗ {fix.error_message}</div>
                        )}
                      </div>
                      {fix.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => setActiveFix(fix)}>
                          Zkontrolovat
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DETAILNÍ TABULKA VÝSLEDKŮ */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex gap-2 flex-wrap">
            <Input
              placeholder="Filtr (značka, model, motor, kategorie)…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="max-w-xs h-8 text-xs"
            />
            <Button
              variant={onlyIssues ? "default" : "outline"}
              size="sm"
              onClick={() => setOnlyIssues((v) => !v)}
            >
              <AlertTriangle className="w-3 h-3 mr-1" /> Jen s problémy
            </Button>
            <span className="text-xs text-muted-foreground self-center ml-auto">
              {filtered.length} z {results.length} záznamů
            </span>
          </div>

          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-[11px]">
              <thead className="text-left text-muted-foreground border-b border-border/40">
                <tr>
                  <th className="py-1 pr-2">Vozidlo</th>
                  <th className="py-1 pr-2">Kategorie</th>
                  <th className="py-1 pr-2 text-right">Dílů</th>
                  <th className="py-1 pr-2 text-right">Unikátní OEM</th>
                  <th className="py-1 pr-2 text-right">Dupl.</th>
                  <th className="py-1 pr-2 text-right">Bez ceny</th>
                  <th className="py-1 pr-2 text-right">0 Kč</th>
                  <th className="py-1 pr-2 text-right">Bez kat.</th>
                  <th className="py-1 pr-2">Stav</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const hasIssue = (r.issues?.length || 0) > 0;
                  return (
                    <tr key={r.id} className="border-b border-border/20 hover:bg-muted/20">
                      <td className="py-1 pr-2">
                        {r.brand} {r.model}{" "}
                        {r.engine && <span className="text-muted-foreground">/ {r.engine}</span>}
                      </td>
                      <td className="py-1 pr-2">
                        {r.category || <span className="text-muted-foreground italic">vše</span>}
                      </td>
                      <td className="py-1 pr-2 text-right font-medium">{r.parts_count}</td>
                      <td className="py-1 pr-2 text-right">{r.oem_unique_count}</td>
                      <td className={`py-1 pr-2 text-right ${r.duplicates_count > 0 ? "text-amber-400" : ""}`}>
                        {r.duplicates_count}
                      </td>
                      <td className={`py-1 pr-2 text-right ${r.missing_prices_count > 0 ? "text-amber-400" : ""}`}>
                        {r.missing_prices_count}
                      </td>
                      <td className={`py-1 pr-2 text-right ${r.zero_price_count > 0 ? "text-amber-400" : ""}`}>
                        {r.zero_price_count}
                      </td>
                      <td className={`py-1 pr-2 text-right ${r.uncategorized_count > 0 ? "text-amber-400" : ""}`}>
                        {r.uncategorized_count}
                      </td>
                      <td className="py-1 pr-2">
                        {hasIssue ? (
                          <span className="text-amber-400 inline-flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" />
                            {r.issues.length}
                          </span>
                        ) : (
                          <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-muted-foreground">
                      {results.length === 0 ? "Žádná data — spusť diagnostiku." : "Žádné záznamy odpovídající filtru."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* DIALOG SCHVÁLENÍ OPRAVY */}
      <Dialog open={!!activeFix} onOpenChange={(o) => !o && setActiveFix(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {activeFix && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Wrench className="w-4 h-4 text-amber-400" />
                  {activeFix.title}
                </DialogTitle>
                <DialogDescription>
                  {activeFix.description}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="bg-muted/30 p-3 rounded border border-border/40 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Závažnost:</span>
                    <Badge variant="outline">{SEVERITY_STYLE[activeFix.severity]?.label}</Badge>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">Dotčeno záznamů:</span>
                    <span className="font-semibold">{activeFix.affected_count}</span>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-muted-foreground">Typ:</span>
                    <code className="text-xs">{activeFix.fix_type}</code>
                  </div>
                </div>

                {activeFix.preview && activeFix.preview.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold mb-2 text-muted-foreground">
                      Ukázka změn (prvních {activeFix.preview.length}):
                    </p>
                    <div className="bg-background/60 p-2 rounded border border-border/40 max-h-64 overflow-y-auto">
                      <pre className="text-[10px] text-muted-foreground">
                        {JSON.stringify(activeFix.preview, null, 2)}
                      </pre>
                    </div>
                  </div>
                )}

                <div className="bg-amber-500/10 border border-amber-500/30 rounded p-2.5 text-xs text-amber-300">
                  ⚠ Tato akce upraví <strong>{activeFix.affected_count}</strong> záznamů v databázi.
                  Akci nelze automaticky vrátit (ale máš denní zálohy).
                </div>
              </div>

              <DialogFooter className="gap-2 flex-row">
                <Button
                  variant="outline"
                  onClick={() => rejectFix(activeFix)}
                  disabled={applyingFix}
                >
                  <X className="w-3 h-3 mr-1" /> Zamítnout
                </Button>
                <Button
                  onClick={() => applyFix(activeFix)}
                  disabled={applyingFix}
                >
                  {applyingFix ? (
                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                  ) : (
                    <Check className="w-3 h-3 mr-1" />
                  )}
                  Souhlasím, aplikovat opravu
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
