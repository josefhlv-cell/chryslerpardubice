/**
 * Auto-pipeline status panel — shows queue counts and last processed jobs.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Play } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function AdminAutoPipeline() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [recent, setRecent] = useState<any[]>([]);
  const [running, setRunning] = useState(false);

  const load = async () => {
    const { data: pending } = await supabase
      .from("auto_pipeline_queue")
      .select("job_type, status")
      .eq("status", "pending");
    const c: Record<string, number> = {};
    (pending || []).forEach((r: any) => { c[r.job_type] = (c[r.job_type] || 0) + 1; });
    setCounts(c);

    const { data: r } = await supabase
      .from("auto_pipeline_queue")
      .select("*")
      .neq("status", "pending")
      .order("processed_at", { ascending: false })
      .limit(20);
    setRecent(r || []);
  };

  useEffect(() => { load(); }, []);

  const runNow = async () => {
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("auto-pipeline-worker", { body: {} });
      if (error) throw error;
      toast({ title: "Pipeline spuštěna", description: `Zpracováno ${data?.processed || 0} úloh` });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally { setRunning(false); }
  };

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Auto-pipeline</CardTitle>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={load}><RefreshCw className="w-3 h-3" /></Button>
          <Button size="sm" onClick={runNow} disabled={running}>
            {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3 mr-1" />} Spustit
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Po vložení nového OEM se automaticky spouští kategorizace, dotažení ceny z vernostsevyplaci.cz a párování kompatibility (každé 2 min).
        </p>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {["categorize", "fetch_price", "match_compat"].map(t => (
            <div key={t} className="border rounded p-2">
              <div className="text-muted-foreground">{t}</div>
              <div className="text-2xl font-bold">{counts[t] || 0}</div>
              <div className="text-[10px] text-muted-foreground">čeká</div>
            </div>
          ))}
        </div>
        <div className="border rounded max-h-60 overflow-auto text-[10px]">
          <table className="w-full">
            <thead className="bg-muted sticky top-0">
              <tr><th className="text-left p-1">Typ</th><th className="text-left p-1">OEM</th><th className="p-1">Stav</th><th className="text-left p-1">Kdy</th></tr>
            </thead>
            <tbody>
              {recent.map((r: any) => (
                <tr key={r.id}>
                  <td className="p-1">{r.job_type}</td>
                  <td className="p-1 font-mono">{r.oem_number || "-"}</td>
                  <td className="p-1 text-center"><Badge variant={r.status === "done" ? "default" : "destructive"}>{r.status}</Badge></td>
                  <td className="p-1 text-muted-foreground">{r.processed_at ? new Date(r.processed_at).toLocaleTimeString("cs") : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
