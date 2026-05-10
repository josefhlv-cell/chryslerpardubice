import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Eye, Play, RefreshCw } from "lucide-react";

interface ProgressRow {
  id: string;
  brand: string;
  status: string;
  stage: string | null;
  total_items: number;
  done_items: number;
  started_at: string | null;
  finished_at: string | null;
  error_message: string | null;
}

const BRANDS = ["chrysler", "dodge", "ram"];

export default function AdminJqScraper() {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ brand: string; count: number; models: any[] } | null>(null);
  const [progress, setProgress] = useState<ProgressRow[]>([]);

  const loadProgress = async () => {
    const { data } = await supabase
      .from("jq_scrape_progress")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(10);
    setProgress((data as ProgressRow[]) || []);
  };

  useEffect(() => {
    loadProgress();
    const ch = supabase
      .channel("jq-progress")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "jq_scrape_progress" },
        () => loadProgress(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const runPreview = async (brand: string) => {
    setBusy(true);
    setPreview(null);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-scrape-jq", {
        body: { brands: [brand], preview: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setPreview(data);
      toast({ title: "Náhled hotov", description: `Nalezeno ${data.count} modelů` });
    } catch (e: any) {
      toast({ title: "Náhled selhal", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const runFull = async () => {
    if (!confirm("Spustit kompletní synchronizaci J+M YQ katalogu (Chrysler/Dodge/RAM)? Trvá několik minut.")) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("bulk-scrape-jq", {
        body: { brands: BRANDS },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: "Sync spuštěn", description: `Značky: ${(data.started || []).join(", ")}` });
      loadProgress();
    } catch (e: any) {
      toast({ title: "Sync selhal", description: e.message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          J+M YQ katalog – synchronizace
          <Badge variant="outline" className="text-[10px]">Chrysler · Dodge · RAM</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          Vždy nejdřív náhled (jen modely jedné značky), poté plná synchronizace.
          Vyžaduje secret <code>JM_ESHOP_COOKIE</code> z přihlášené B2B session.
        </div>

        <div className="flex flex-wrap gap-2">
          {BRANDS.map((b) => (
            <Button
              key={b}
              size="sm"
              variant="outline"
              onClick={() => runPreview(b)}
              disabled={busy}
            >
              <Eye className="w-3.5 h-3.5 mr-1" />
              Náhled {b}
            </Button>
          ))}
          <Button size="sm" onClick={runFull} disabled={busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Play className="w-3.5 h-3.5 mr-1" />}
            Plná synchronizace
          </Button>
          <Button size="sm" variant="ghost" onClick={loadProgress}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" />
            Obnovit
          </Button>
        </div>

        {preview && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-1 max-h-64 overflow-auto">
            <div className="text-xs font-semibold">
              Náhled: {preview.brand} – {preview.count} modelů
            </div>
            <ul className="text-xs space-y-0.5">
              {preview.models.slice(0, 30).map((m: any, i: number) => (
                <li key={i} className="font-mono">{m.name} <span className="text-muted-foreground">({m.jqId})</span></li>
              ))}
              {preview.models.length > 30 && (
                <li className="text-muted-foreground">… a dalších {preview.models.length - 30}</li>
              )}
            </ul>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Posledních 10 běhů</h4>
          {progress.length === 0 && (
            <p className="text-xs text-muted-foreground">Zatím žádné běhy.</p>
          )}
          {progress.map((p) => {
            const pct = p.total_items > 0 ? Math.round((p.done_items / p.total_items) * 100) : 0;
            return (
              <div key={p.id} className="rounded-md border p-2 text-xs space-y-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{p.brand}</Badge>
                  <Badge
                    className={`text-[10px] ${
                      p.status === "done" ? "bg-green-500/15 text-green-400" :
                      p.status === "error" ? "bg-red-500/15 text-red-400" :
                      "bg-amber-500/15 text-amber-400"
                    }`}
                    variant="outline"
                  >
                    {p.status} {p.stage ? `· ${p.stage}` : ""}
                  </Badge>
                  <span className="ml-auto text-muted-foreground">
                    {p.done_items} / {p.total_items}
                  </span>
                </div>
                {p.total_items > 0 && <Progress value={pct} className="h-1" />}
                {p.error_message && (
                  <p className="text-red-400 text-[10px] font-mono break-all">{p.error_message}</p>
                )}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
