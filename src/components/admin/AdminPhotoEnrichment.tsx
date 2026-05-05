/**
 * AdminPhotoEnrichment — přehled foto-enrichmentu katalogu.
 * Zobrazuje stav: počty s/bez fotky, rozpis důvodů selhání, odhadovaný čas dokončení,
 * ruční trigger dávky.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Image as ImageIcon, AlertCircle, CheckCircle2, Play } from "lucide-react";
import { toast } from "sonner";

interface Stats {
  total: number;
  withPhoto: number;
  withoutPhoto: number;
  exhausted: number; // ≥ MAX_ATTEMPTS
  byStatus: Record<string, number>;
  recentRate: number; // fotek/min za posledních 10 min
}

const MAX_ATTEMPTS = 5;

export default function AdminPhotoEnrichment() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [totalRes, withRes, exhaustedRes, statusRes, recentRes] = await Promise.all([
        supabase.from("parts_new").select("id", { count: "exact", head: true }),
        supabase.from("parts_new").select("id", { count: "exact", head: true }).not("image_urls", "is", null),
        supabase.from("parts_new").select("id", { count: "exact", head: true })
          .or("image_urls.is.null,image_urls.eq.{}")
          .gte("enrich_attempts", MAX_ATTEMPTS),
        supabase.from("parts_new").select("last_enrich_status")
          .or("image_urls.is.null,image_urls.eq.{}")
          .not("last_enrich_status", "is", null)
          .limit(10000),
        supabase.from("catalog_event_log").select("details, created_at")
          .eq("source", "enrich-photos-fallback").eq("event", "batch_done")
          .gte("created_at", new Date(Date.now() - 10 * 60_000).toISOString())
          .limit(50),
      ]);

      const total = totalRes.count || 0;
      const withPhoto = withRes.count || 0;
      const exhausted = exhaustedRes.count || 0;
      const withoutPhoto = total - withPhoto;

      const byStatus: Record<string, number> = {};
      for (const r of statusRes.data || []) {
        const s = (r as any).last_enrich_status || "unknown";
        byStatus[s] = (byStatus[s] || 0) + 1;
      }

      let foundLast10 = 0;
      for (const r of recentRes.data || []) {
        foundLast10 += Number((r as any).details?.found || 0);
      }
      const recentRate = foundLast10 / 10;

      setStats({ total, withPhoto, withoutPhoto, exhausted, byStatus, recentRate });
    } catch (e: any) {
      toast.error("Chyba načítání: " + (e?.message || e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const i = setInterval(load, 30_000);
    return () => clearInterval(i);
  }, []);

  const triggerBatch = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("enrich-photos-fallback", {
        method: "GET",
        body: undefined,
      } as any);
      if (error) throw error;
      toast.success(`Dávka: ${data?.found || 0}/${data?.scanned || 0} fotek doplněno`);
      await load();
    } catch (e: any) {
      // Workaround: invoke nepodporuje GET query, zkusíme přes fetch
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/enrich-photos-fallback?limit=15&google=1`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        });
        const data = await res.json();
        toast.success(`Dávka: ${data?.found || 0}/${data?.scanned || 0} fotek doplněno`);
        await load();
      } catch (e2: any) {
        toast.error("Selhalo: " + (e2?.message || e2));
      }
    } finally {
      setRunning(false);
    }
  };

  const resetExhausted = async () => {
    if (!confirm("Resetovat počet pokusů u dílů, které vyčerpaly limit? Cron je pak zkusí znovu.")) return;
    const { error } = await supabase
      .from("parts_new")
      .update({ enrich_attempts: 0, last_enrich_status: null })
      .gte("enrich_attempts", MAX_ATTEMPTS)
      .or("image_urls.is.null,image_urls.eq.{}");
    if (error) toast.error("Reset selhal: " + error.message);
    else { toast.success("Reset hotov, cron zkusí znovu."); load(); }
  };

  if (loading && !stats) {
    return <div className="flex items-center gap-2 p-4"><Loader2 className="h-4 w-4 animate-spin" />Načítám…</div>;
  }
  if (!stats) return null;

  const coverage = stats.total ? Math.round((stats.withPhoto / stats.total) * 100) : 0;
  const remaining = stats.withoutPhoto - stats.exhausted;
  const etaMinutes = stats.recentRate > 0 ? Math.ceil(remaining / stats.recentRate) : null;
  const etaText = etaMinutes === null ? "—"
    : etaMinutes < 60 ? `${etaMinutes} min`
    : `${Math.floor(etaMinutes / 60)} h ${etaMinutes % 60} min`;

  const statusLabels: Record<string, { label: string; color: string }> = {
    cdn_hit: { label: "CDN nalezeno", color: "bg-emerald-500/15 text-emerald-400" },
    cdn_miss: { label: "CDN neúspěch", color: "bg-amber-500/15 text-amber-400" },
    google_hit: { label: "Google nalezeno", color: "bg-emerald-500/15 text-emerald-400" },
    google_miss: { label: "Google neúspěch", color: "bg-red-500/15 text-red-400" },
    no_oem: { label: "Bez OEM", color: "bg-muted text-muted-foreground" },
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ImageIcon className="h-5 w-5 text-primary" />
          Foto-enrichment katalogu
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={load} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
          <Button size="sm" onClick={triggerBatch} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            Spustit dávku
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCell label="S fotkou" value={stats.withPhoto} icon={<CheckCircle2 className="h-4 w-4 text-emerald-400" />} />
          <StatCell label="Bez fotky" value={stats.withoutPhoto} icon={<AlertCircle className="h-4 w-4 text-amber-400" />} />
          <StatCell label="Vyčerpáno (≥5 pokusů)" value={stats.exhausted} icon={<AlertCircle className="h-4 w-4 text-red-400" />} />
          <StatCell label="Rychlost / min" value={stats.recentRate.toFixed(1)} icon={<RefreshCw className="h-4 w-4 text-primary" />} />
        </div>

        <div>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-muted-foreground">Pokrytí fotkami</span>
            <span className="font-medium">{coverage}%</span>
          </div>
          <Progress value={coverage} />
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Odhad dokončení (cron)</span>
            <span className="font-mono font-semibold text-foreground">{etaText}</span>
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Zbývá {remaining.toLocaleString("cs-CZ")} dílů (vyloučeny vyčerpané). Cron běží každou minutu, dávka 15 ks.
          </div>
        </div>

        <div>
          <div className="text-sm font-medium mb-2">Rozpis posledního stavu (díly bez fotky)</div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(stats.byStatus).sort((a, b) => b[1] - a[1]).map(([k, v]) => {
              const meta = statusLabels[k] || { label: k, color: "bg-muted text-muted-foreground" };
              return (
                <Badge key={k} variant="outline" className={`${meta.color} border-transparent`}>
                  {meta.label}: {v.toLocaleString("cs-CZ")}
                </Badge>
              );
            })}
            {Object.keys(stats.byStatus).length === 0 && (
              <span className="text-xs text-muted-foreground">Zatím žádné záznamy o pokusech.</span>
            )}
          </div>
        </div>

        {stats.exhausted > 0 && (
          <Button size="sm" variant="outline" onClick={resetExhausted} className="w-full">
            Resetovat {stats.exhausted} vyčerpaných (zkusit znovu)
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function StatCell({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card/40 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="text-2xl font-bold mt-1 text-foreground">{typeof value === "number" ? value.toLocaleString("cs-CZ") : value}</div>
    </div>
  );
}
