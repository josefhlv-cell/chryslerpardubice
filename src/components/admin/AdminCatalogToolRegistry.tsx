/**
 * AdminCatalogToolRegistry — přehledný seznam všech aktivních nástrojů
 * katalogu s českým názvem, popisem, stavem posledního běhu a tlačítkem
 * Spustit. Sjednocuje monitoring + ovládání edge funkcí na jednom místě.
 */
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, RefreshCw, CheckCircle2, AlertCircle, Clock, Circle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type ToolDef = {
  fn: string;
  label: string;
  desc: string;
  category: "sync" | "tree" | "cache" | "graphic" | "compat" | "diag";
  body?: Record<string, unknown>;
};

const TOOLS: ToolDef[] = [
  { fn: "price-sync", label: "Synchronizace cen dílů", desc: "Stahuje aktuální ceny z věrnostního systému. Doporučeno spouštět průběžně.", category: "sync", body: { batchSize: 100, mode: "manual" } },
  { fn: "kitoem-price-sync", label: "Synchronizace cen KITOEM (originálů)", desc: "Dohledává ceny pro originální OEM díly z KITOEM databáze.", category: "sync", body: { batchSize: 200 } },
  { fn: "jm-tree-v2-build", label: "Sestavení J+M stromu (v2)", desc: "Postaví strom kategorií podle aktuálního J+M katalogu pro všechny vozy.", category: "tree" },
  { fn: "warm-jm-cache", label: "Předehřátí mezipaměti J+M", desc: "Načte oblíbené kategorie do cache pro okamžitou odezvu katalogu.", category: "cache" },
  { fn: "enrich-from-jm", label: "Doplnění dat z J+M", desc: "Doplní KITOEM originálům chybějící fotky, popisy a technické parametry z J+M.", category: "sync" },
  { fn: "compat-matcher", label: "Párování dílů s vozy", desc: "Spáruje OEM čísla s konkrétními motorizacemi (K-Type).", category: "compat" },
  { fn: "resolve-engine-ktypes", label: "Dohledání K-typů motorů", desc: "Pro každou motorizaci najde odpovídající TecDoc K-Type.", category: "compat" },
  { fn: "scrape-jq-eshop", label: "Stažení grafických katalogů", desc: "Stáhne nákresy a schémata z J+M B2B eshopu (vyžaduje JM_LOGIN).", category: "graphic" },
  { fn: "catalog-auto-maintenance", label: "Údržba katalogu", desc: "Vyčistí duplicity, opraví chybějící kategorie, ověří kompatibilitu.", category: "diag" },
  { fn: "nightly-catalog-verify", label: "Noční ověření katalogu", desc: "Denní kontrola zdraví katalogu a OEM matchingu (00:01).", category: "diag" },
];

type RunStatus = {
  state: "idle" | "running" | "ok" | "error";
  lastRun?: string | null;
  message?: string | null;
};

const StatusBadge = ({ s }: { s: RunStatus }) => {
  if (s.state === "running") return <Badge className="bg-blue-500/20 text-blue-300 border-blue-500/40"><Loader2 className="w-3 h-3 mr-1 animate-spin" />Běží</Badge>;
  if (s.state === "ok") return <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40"><CheckCircle2 className="w-3 h-3 mr-1" />OK</Badge>;
  if (s.state === "error") return <Badge className="bg-red-500/20 text-red-300 border-red-500/40"><AlertCircle className="w-3 h-3 mr-1" />Chyba</Badge>;
  return <Badge variant="outline" className="text-muted-foreground"><Circle className="w-3 h-3 mr-1" />Nespuštěno</Badge>;
};

const AdminCatalogToolRegistry = () => {
  const [statuses, setStatuses] = useState<Record<string, RunStatus>>({});

  // Načti poslední běh pro známé sync joby (price_sync_runs, jm_tree_sync_runs).
  useEffect(() => {
    (async () => {
      const next: Record<string, RunStatus> = {};
      try {
        const { data: ps } = await (supabase as any)
          .from("price_sync_runs")
          .select("status, finished_at, last_error")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ps) {
          next["price-sync"] = {
            state: ps.status === "running" ? "running" : ps.status === "failed" ? "error" : "ok",
            lastRun: ps.finished_at,
            message: ps.last_error || null,
          };
        }
      } catch { /* ignore */ }
      try {
        const { data: ts } = await (supabase as any)
          .from("jm_tree_sync_runs")
          .select("status, finished_at, message")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (ts) {
          next["jm-tree-v2-build"] = {
            state: ts.status === "running" ? "running" : ts.status === "failed" ? "error" : "ok",
            lastRun: ts.finished_at,
            message: ts.message || null,
          };
        }
      } catch { /* ignore */ }
      setStatuses(next);
    })();
  }, []);

  const run = async (t: ToolDef) => {
    setStatuses((s) => ({ ...s, [t.fn]: { state: "running" } }));
    try {
      const { data, error } = await supabase.functions.invoke(t.fn, { body: t.body ?? {} });
      if (error) throw error;
      setStatuses((s) => ({
        ...s,
        [t.fn]: { state: "ok", lastRun: new Date().toISOString(), message: typeof data === "object" ? JSON.stringify(data).slice(0, 120) : null },
      }));
      toast.success(`${t.label}: spuštěno`);
    } catch (e: any) {
      setStatuses((s) => ({ ...s, [t.fn]: { state: "error", lastRun: new Date().toISOString(), message: e?.message } }));
      toast.error(`${t.label}: ${e?.message || "chyba"}`);
    }
  };

  const fmt = (iso?: string | null) =>
    !iso ? "—" : new Intl.DateTimeFormat("cs-CZ", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));

  return (
    <Card className="bg-card/60 border-border/40">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 text-amber-400" />
          Nástroje katalogu
        </CardTitle>
        <p className="text-[11px] text-muted-foreground">
          Sjednocený přehled aktivních nástrojů katalogu. Každý nástroj má český název, popis a stav posledního běhu.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {TOOLS.map((t) => {
          const s = statuses[t.fn] || { state: "idle" as const };
          return (
            <div key={t.fn} className="flex items-start justify-between gap-3 p-3 rounded-lg bg-secondary/30 border border-border/30">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold text-foreground">{t.label}</h4>
                  <StatusBadge s={s} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">{t.desc}</p>
                <div className="flex items-center gap-3 text-[10px] text-muted-foreground/70 mt-1">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{fmt(s.lastRun)}</span>
                  <span className="font-mono">{t.fn}</span>
                </div>
                {s.message && (
                  <p className="text-[10px] text-muted-foreground/80 mt-1 truncate" title={s.message}>{s.message}</p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => run(t)}
                disabled={s.state === "running"}
                className="shrink-0"
              >
                {s.state === "running" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
                Spustit
              </Button>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
};

export default AdminCatalogToolRegistry;
