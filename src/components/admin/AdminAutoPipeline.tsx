/**
 * AdminAutoPipeline — full overview of auto_pipeline_queue.
 *
 * For each job_type (categorize / fetch_price / match_compat) it shows:
 *   - counts per status (pending / processing / done / failed)
 *   - throughput over the last hour and ETA to drain pending queue
 *   - last processed timestamp + last error
 * Plus manual triggers: run worker once, retry failed, clear stuck "processing".
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Loader2, RefreshCw, Play, AlertTriangle, Clock, CheckCircle2, XCircle, ListChecks, RotateCcw } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type Counts = Record<string, { pending: number; processing: number; done: number; failed: number; total: number }>;

const JOB_TYPES = ["categorize", "fetch_price", "match_compat"] as const;
type JobType = (typeof JOB_TYPES)[number];

const JOB_LABEL: Record<string, string> = {
  categorize: "Kategorizace",
  fetch_price: "Doplnění ceny",
  match_compat: "Párování kompatibility",
};

function fmtEta(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  if (seconds < 60) return `${Math.ceil(seconds)} s`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${h} h ${mm} min`;
}

export default function AdminAutoPipeline() {
  const [counts, setCounts] = useState<Counts>({});
  const [perHour, setPerHour] = useState<Record<string, number>>({});
  const [lastProcessed, setLastProcessed] = useState<Record<string, string | null>>({});
  const [lastError, setLastError] = useState<Record<string, string | null>>({});
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [unstucking, setUnstucking] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // Per-status counts (one query per job × status, parallel)
      const cells = await Promise.all(
        JOB_TYPES.flatMap((jt) =>
          (["pending", "processing", "done", "failed"] as const).map(async (st) => {
            const { count } = await supabase
              .from("auto_pipeline_queue")
              .select("id", { count: "exact", head: true })
              .eq("job_type", jt)
              .eq("status", st);
            return { jt, st, count: count ?? 0 };
          })
        )
      );
      const c: Counts = {};
      for (const jt of JOB_TYPES) c[jt] = { pending: 0, processing: 0, done: 0, failed: 0, total: 0 };
      for (const { jt, st, count } of cells) {
        c[jt][st] = count;
        c[jt].total += count;
      }
      setCounts(c);

      // Throughput last hour (done in last 60 min)
      const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const ph: Record<string, number> = {};
      await Promise.all(
        JOB_TYPES.map(async (jt) => {
          const { count } = await supabase
            .from("auto_pipeline_queue")
            .select("id", { count: "exact", head: true })
            .eq("job_type", jt)
            .eq("status", "done")
            .gte("processed_at", since);
          ph[jt] = count ?? 0;
        })
      );
      setPerHour(ph);

      // Last processed timestamp per type
      const lp: Record<string, string | null> = {};
      const le: Record<string, string | null> = {};
      await Promise.all(
        JOB_TYPES.map(async (jt) => {
          const { data: rows } = await supabase
            .from("auto_pipeline_queue")
            .select("processed_at, status, error_message")
            .eq("job_type", jt)
            .not("processed_at", "is", null)
            .order("processed_at", { ascending: false })
            .limit(1);
          lp[jt] = rows?.[0]?.processed_at ?? null;
          const { data: errRows } = await supabase
            .from("auto_pipeline_queue")
            .select("error_message")
            .eq("job_type", jt)
            .eq("status", "failed")
            .not("error_message", "is", null)
            .order("processed_at", { ascending: false })
            .limit(1);
          le[jt] = errRows?.[0]?.error_message ?? null;
        })
      );
      setLastProcessed(lp);
      setLastError(le);

      // Recent activity
      const { data: r } = await supabase
        .from("auto_pipeline_queue")
        .select("id, job_type, oem_number, status, processed_at, error_message")
        .neq("status", "pending")
        .order("processed_at", { ascending: false, nullsFirst: false })
        .limit(25);
      setRecent(r || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-pipeline-worker", { body: {} });
      if (error) throw error;
      toast({ title: "Pipeline spuštěna", description: `Zpracováno ${data?.processed || 0}, hotovo ${data?.done || 0}, chyby ${data?.failed || 0}.` });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const retryFailed = async () => {
    setRetrying(true);
    try {
      const { error, data } = await supabase
        .from("auto_pipeline_queue")
        .update({ status: "pending", attempts: 0, error_message: null })
        .eq("status", "failed")
        .select("id");
      if (error) throw error;
      toast({ title: "Restart selhaných úloh", description: `${data?.length ?? 0} úloh přesunuto zpět do fronty.` });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setRetrying(false);
    }
  };

  const unstuckProcessing = async () => {
    setUnstucking(true);
    try {
      const cutoff = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { error, data } = await supabase
        .from("auto_pipeline_queue")
        .update({ status: "pending", attempts: 0, error_message: null })
        .eq("status", "processing")
        .lt("created_at", cutoff)
        .select("id");
      if (error) throw error;
      toast({ title: "Zaseklé úlohy uvolněny", description: `${data?.length ?? 0} úloh vráceno na pending.` });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setUnstucking(false);
    }
  };

  const totals = useMemo(() => {
    const t = { pending: 0, processing: 0, done: 0, failed: 0 };
    for (const jt of JOB_TYPES) {
      const c = counts[jt];
      if (!c) continue;
      t.pending += c.pending;
      t.processing += c.processing;
      t.done += c.done;
      t.failed += c.failed;
    }
    return t;
  }, [counts]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-center justify-between p-3 pb-1">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <ListChecks className="w-4 h-4 text-primary" />
              Auto-pipeline — fronta scraperu
            </CardTitle>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Cron běží automaticky každé 2 minuty. Karty níže ukazují aktuální průběh.
            </p>
          </div>
          <div className="flex gap-1">
            <Button size="sm" variant="outline" onClick={load} disabled={loading}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            </Button>
            <Button size="sm" variant="outline" onClick={unstuckProcessing} disabled={unstucking}>
              {unstucking ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
              Uvolnit zaseklé
            </Button>
            <Button size="sm" variant="outline" onClick={retryFailed} disabled={retrying}>
              {retrying ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <RotateCcw className="w-3 h-3 mr-1" />}
              Restart selhaných
            </Button>
            <Button size="sm" onClick={runNow} disabled={running}>
              {running ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Play className="w-3 h-3 mr-1" />}
              Spustit teď
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-3 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Tile icon={Clock} label="Čeká" value={totals.pending} accent="bg-amber-500/10 text-amber-500" />
            <Tile icon={Loader2} label="Zpracovává se" value={totals.processing} accent="bg-primary/10 text-primary" />
            <Tile icon={CheckCircle2} label="Hotovo" value={totals.done} accent="bg-success/10 text-success" />
            <Tile icon={XCircle} label="Selhalo" value={totals.failed} accent="bg-destructive/10 text-destructive" />
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            {JOB_TYPES.map((jt) => {
              const c = counts[jt] || { pending: 0, processing: 0, done: 0, failed: 0, total: 0 };
              const rate = perHour[jt] || 0;
              const etaSec = rate > 0 ? (c.pending / rate) * 3600 : Infinity;
              const donePct = c.total ? Math.round((c.done / c.total) * 100) : 0;
              return (
                <div key={jt} className="border border-border/50 rounded-lg p-3 space-y-2 bg-card/40">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">{JOB_LABEL[jt]}</p>
                    <Badge variant="outline" className="text-[10px]">
                      {rate}/h
                    </Badge>
                  </div>
                  <div className="flex flex-wrap gap-1 text-[10px]">
                    <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30">⌛ {c.pending}</Badge>
                    <Badge variant="outline">⚙ {c.processing}</Badge>
                    <Badge className="bg-success/15 text-success border-success/30">✓ {c.done}</Badge>
                    {c.failed > 0 && (
                      <Badge variant="destructive">✗ {c.failed}</Badge>
                    )}
                  </div>
                  <Progress value={donePct} className="h-1.5" />
                  <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>Hotovo {donePct} %</span>
                    <span>ETA: {fmtEta(etaSec)}</span>
                  </div>
                  <div className="text-[10px] text-muted-foreground border-t border-border/40 pt-1.5">
                    Poslední: {lastProcessed[jt] ? new Date(lastProcessed[jt]!).toLocaleString("cs") : "—"}
                  </div>
                  {lastError[jt] && (
                    <div className="text-[10px] text-destructive flex items-start gap-1">
                      <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{lastError[jt]}</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="p-3 pb-1">
          <CardTitle className="text-sm">Posledních 25 zpracovaných úloh</CardTitle>
        </CardHeader>
        <CardContent className="p-3">
          <div className="border rounded max-h-96 overflow-auto text-[11px]">
            <table className="w-full">
              <thead className="bg-muted sticky top-0">
                <tr>
                  <th className="text-left p-1.5">Typ</th>
                  <th className="text-left p-1.5">OEM</th>
                  <th className="text-center p-1.5">Stav</th>
                  <th className="text-left p-1.5">Kdy</th>
                  <th className="text-left p-1.5">Chyba</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r: any) => (
                  <tr key={r.id} className="border-t border-border/30">
                    <td className="p-1.5 whitespace-nowrap">{JOB_LABEL[r.job_type] || r.job_type}</td>
                    <td className="p-1.5 font-mono">{r.oem_number || "—"}</td>
                    <td className="p-1.5 text-center">
                      <Badge variant={r.status === "done" ? "default" : r.status === "failed" ? "destructive" : "secondary"} className="text-[9px]">
                        {r.status}
                      </Badge>
                    </td>
                    <td className="p-1.5 text-muted-foreground whitespace-nowrap">
                      {r.processed_at ? new Date(r.processed_at).toLocaleString("cs") : "—"}
                    </td>
                    <td className="p-1.5 text-destructive max-w-[260px] truncate" title={r.error_message || ""}>
                      {r.error_message || "—"}
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr><td colSpan={5} className="p-3 text-center text-muted-foreground">Žádná aktivita.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const Tile = ({ icon: Icon, label, value, accent }: { icon: any; label: string; value: number; accent: string }) => (
  <div className="border border-border/40 rounded-lg p-3 flex items-center gap-2 bg-card/40">
    <div className={`p-2 rounded-lg ${accent}`}>
      <Icon className="w-4 h-4" />
    </div>
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-xl font-bold leading-tight">{value.toLocaleString("cs")}</p>
    </div>
  </div>
);
