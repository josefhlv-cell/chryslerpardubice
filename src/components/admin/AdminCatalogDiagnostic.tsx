import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { toast } from "@/hooks/use-toast";
import { Play, Square, RefreshCw, AlertTriangle, CheckCircle2, Search, Loader2 } from "lucide-react";

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

export default function AdminCatalogDiagnostic() {
  const { user } = useAuth();
  const [run, setRun] = useState<Run | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
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
        }
        return;
      }
      const data = await callFn("status", { run_id: id });
      setRun(data.run);
      setResults(data.results || []);
    } catch (e: any) {
      console.error(e);
    }
  };

  useEffect(() => { refresh(); /* eslint-disable-next-line */ }, []);

  // Poll every 4s while running
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
      toast({ title: data.reused ? "Diagnostika již běží" : "Diagnostika spuštěna", description: "Běží na pozadí. Můžeš odejít." });
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

  const isRunning = run?.status === "running" || run?.status === "pending";
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

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-semibold flex items-center gap-2">
                <Search className="w-4 h-4 text-amber-400" />
                Ladicí režim katalogu
              </h3>
              <p className="text-xs text-muted-foreground">
                Projde všechny kombinace značka/model/motor/kategorie a zkontroluje počty dílů, duplicity, ceny a názvy.
                Běží na pozadí — můžeš zavřít okno.
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
              <div className="flex items-center gap-2 text-xs">
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
                      {results.length === 0
                        ? "Žádná data — spusť diagnostiku."
                        : "Žádné záznamy odpovídající filtru."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
