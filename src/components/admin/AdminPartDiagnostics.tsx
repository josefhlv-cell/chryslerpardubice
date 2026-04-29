/**
 * AdminPartDiagnostics — per-part diagnostic engine.
 * Workflow: Analyze (read-only) → review suggestions → Apply (mandatory backup first).
 * Backed by edge function `diagnose-part` which calls db-backup before any UPDATE.
 */
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { Search, Microscope, ShieldCheck, Loader2, CheckCircle2, AlertTriangle, ListChecks } from "lucide-react";

type Diag = {
  id: string;
  part_id: string;
  name_status: string;
  category_status: string;
  description_status: string;
  oem_status: string;
  suggested_name: string | null;
  suggested_category: string | null;
  suggested_description: string | null;
  applied: boolean;
  backup_path: string | null;
  created_at: string;
};

type PartLite = { id: string; name: string; oem_number: string; category: string | null };

const STATUS_COLOR: Record<string, string> = {
  ok: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  matched: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
  suspicious: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  poor: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  mismatch: "bg-amber-500/20 text-amber-400 border-amber-500/40",
  missing: "bg-destructive/20 text-destructive border-destructive/40",
  invalid: "bg-destructive/20 text-destructive border-destructive/40",
  incorrect: "bg-destructive/20 text-destructive border-destructive/40",
};

export default function AdminPartDiagnostics() {
  const { user } = useAuth();
  const [parts, setParts] = useState<PartLite[]>([]);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [diagnostics, setDiagnostics] = useState<Diag[]>([]);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [applying, setApplying] = useState(false);

  async function loadParts() {
    setLoading(true);
    let q = supabase.from("parts_new").select("id, name, oem_number, category").limit(80);
    if (filter.trim()) {
      const f = filter.trim();
      q = q.or(`oem_number.ilike.%${f}%,name.ilike.%${f}%`);
    }
    const { data } = await q;
    setParts(data || []);
    setLoading(false);
  }

  async function loadDiagnostics() {
    const { data } = await supabase
      .from("part_diagnostics")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setDiagnostics((data || []) as Diag[]);
  }

  useEffect(() => { loadParts(); loadDiagnostics(); }, []);

  const diagByPart = useMemo(() => {
    const m = new Map<string, Diag>();
    for (const d of diagnostics) if (!m.has(d.part_id)) m.set(d.part_id, d); // newest wins
    return m;
  }, [diagnostics]);

  const pendingDiags = diagnostics.filter((d) => !d.applied && (d.suggested_name || d.suggested_category || d.suggested_description));

  function toggle(id: string) {
    const n = new Set(selected);
    n.has(id) ? n.delete(id) : n.add(id);
    setSelected(n);
  }

  async function analyzeSelected() {
    if (selected.size === 0) { toast({ title: "Vyber alespoň jeden díl" }); return; }
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("diagnose-part", {
        body: { action: "analyze", partIds: Array.from(selected) },
      });
      if (error) throw error;
      toast({ title: "Analýza hotová", description: `${data?.diagnostics?.length ?? 0} dílů zkontrolováno` });
      setSelected(new Set());
      await loadDiagnostics();
    } catch (e: any) {
      toast({ title: "Chyba", description: String(e.message || e), variant: "destructive" });
    } finally {
      setAnalyzing(false);
    }
  }

  async function applyPending() {
    if (pendingDiags.length === 0) { toast({ title: "Žádné návrhy k aplikaci" }); return; }
    if (!confirm(`Aplikovat ${pendingDiags.length} oprav?\n\n🚨 Před změnami se automaticky vytvoří záloha celé databáze.`)) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("diagnose-part", {
        body: { action: "apply", diagnosticIds: pendingDiags.map((d) => d.id), userId: user?.id },
      });
      if (error) throw error;
      toast({
        title: "Opravy aplikovány",
        description: `${data?.applied} dílů opraveno • Záloha: ${data?.backupPath}`,
      });
      await loadDiagnostics();
      await loadParts();
    } catch (e: any) {
      toast({ title: "Chyba", description: String(e.message || e), variant: "destructive" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Hledat OEM nebo název dílu…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && loadParts()}
            className="pl-8"
          />
        </div>
        <Button variant="outline" onClick={loadParts} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Hledat
        </Button>
        <Button onClick={analyzeSelected} disabled={analyzing || selected.size === 0}>
          {analyzing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Microscope className="mr-2 h-4 w-4" />
          Analyzovat ({selected.size})
        </Button>
        <Button
          variant="default"
          onClick={applyPending}
          disabled={applying || pendingDiags.length === 0}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          {applying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <ShieldCheck className="mr-2 h-4 w-4" />
          Aplikovat {pendingDiags.length} oprav (se zálohou)
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="p-2 w-10"></th>
                  <th className="p-2 text-left">OEM</th>
                  <th className="p-2 text-left">Název</th>
                  <th className="p-2 text-left">Kategorie</th>
                  <th className="p-2 text-left">Diagnostika</th>
                  <th className="p-2 text-left">Návrh opravy</th>
                </tr>
              </thead>
              <tbody>
                {parts.map((p) => {
                  const d = diagByPart.get(p.id);
                  return (
                    <tr key={p.id} className="border-b border-border/40 hover:bg-muted/20">
                      <td className="p-2">
                        <Checkbox checked={selected.has(p.id)} onCheckedChange={() => toggle(p.id)} />
                      </td>
                      <td className="p-2 font-mono text-xs">{p.oem_number}</td>
                      <td className="p-2 max-w-xs truncate">{p.name}</td>
                      <td className="p-2 text-xs text-muted-foreground max-w-[120px] truncate">{p.category || "—"}</td>
                      <td className="p-2">
                        {d ? (
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline" className={STATUS_COLOR[d.name_status] || ""}>N: {d.name_status}</Badge>
                            <Badge variant="outline" className={STATUS_COLOR[d.category_status] || ""}>K: {d.category_status}</Badge>
                            <Badge variant="outline" className={STATUS_COLOR[d.oem_status] || ""}>O: {d.oem_status}</Badge>
                            {d.applied && <Badge className="bg-emerald-600"><CheckCircle2 className="h-3 w-3 mr-1" />Aplikováno</Badge>}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs">
                        {d?.suggested_name && d.suggested_name !== p.name && (
                          <div className="text-amber-400">→ {d.suggested_name}</div>
                        )}
                        {d?.suggested_category && d.suggested_category !== p.category && (
                          <div className="text-amber-400/80">📁 {d.suggested_category}</div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {parts.length === 0 && !loading && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground text-sm">Žádné výsledky</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex items-center gap-2">
        <ListChecks className="h-3 w-3" />
        Celkem diagnostických záznamů: <strong>{diagnostics.length}</strong>
        {pendingDiags.length > 0 && <Badge variant="outline" className="text-amber-400 border-amber-500/40">{pendingDiags.length} čeká na aplikaci</Badge>}
      </div>
    </div>
  );
}
