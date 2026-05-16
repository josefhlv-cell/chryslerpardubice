/**
 * 7zap Bulk OEM Scraper — preview, edit, then sync.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, CheckCircle2, Trash2, Eye, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];
const MODELS: Record<string, string[]> = {
  Chrysler: ["300C", "Pacifica", "Town & Country", "Voyager"],
  Dodge: ["Durango", "Charger", "Challenger", "Grand Caravan"],
  RAM: ["1500", "2500", "3500"],
  Cadillac: ["Escalade", "CTS", "SRX"],
  Lancia: ["Thema", "Voyager"],
};

interface PreviewJob {
  id: string;
  source: string;
  brand: string;
  model: string;
  parts_count: number;
  status: string;
  applied_count: number;
  created_at: string;
  raw_payload: Array<{ oem: string; name: string; category: string }>;
}

export default function Admin7zapScraper() {
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [scraping, setScraping] = useState(false);
  const [applying, setApplying] = useState(false);
  const [jobs, setJobs] = useState<PreviewJob[]>([]);
  const [activeJob, setActiveJob] = useState<PreviewJob | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  const loadJobs = async () => {
    const { data } = await supabase
      .from("scrape_preview_jobs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);
    setJobs((data as any) || []);
  };

  useEffect(() => { loadJobs(); }, []);

  const handleScrape = async () => {
    if (!brand || !model) {
      toast({ title: "Vyberte značku a model", variant: "destructive" });
      return;
    }
    setScraping(true);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-7zap-bulk", {
        body: { brand, model, year: year ? parseInt(year) : undefined },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Chyba");
      toast({ title: "Náhled hotový", description: `${data.parts_count} OEM nalezeno` });
      await loadJobs();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setScraping(false);
    }
  };

  const openPreview = async (job: PreviewJob) => {
    setActiveJob(job);
    setExcluded(new Set());
  };

  const toggleExclude = (oem: string) => {
    setExcluded(prev => {
      const next = new Set(prev);
      next.has(oem) ? next.delete(oem) : next.add(oem);
      return next;
    });
  };

  const handleApply = async () => {
    if (!activeJob) return;
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke("apply-scrape-preview", {
        body: { job_id: activeJob.id, exclude_oems: Array.from(excluded) },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Chyba");
      toast({ title: "Synchronizováno", description: `${data.inserted} dílů přidáno do katalogu` });
      setActiveJob(null);
      await loadJobs();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    } finally {
      setApplying(false);
    }
  };

  const discard = async (id: string) => {
    if (!confirm("Smazat náhled?")) return;
    await supabase.from("scrape_preview_jobs").delete().eq("id", id);
    if (activeJob?.id === id) setActiveJob(null);
    await loadJobs();
  };

  const filteredParts = activeJob?.raw_payload.filter(p =>
    !search || p.oem.toLowerCase().includes(search.toLowerCase()) || p.name?.toLowerCase().includes(search.toLowerCase())
  ) || [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Download className="w-4 h-4" /> 7zap Bulk OEM Scraper
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Stáhne všechny OEM čísla pro vybraný model z 7zap.com. Nejdřív náhled, potom synchronizace s katalogem.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); }}>
              <SelectTrigger><SelectValue placeholder="Značka" /></SelectTrigger>
              <SelectContent>{BRANDS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={model} onValueChange={setModel} disabled={!brand}>
              <SelectTrigger><SelectValue placeholder="Model" /></SelectTrigger>
              <SelectContent>{(MODELS[brand] || []).map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Rok (nepovinné)" value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
          <Button onClick={handleScrape} disabled={scraping || !brand || !model} className="w-full">
            {scraping ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
            {scraping ? "Stahuji…" : "Stáhnout náhled"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Náhledy ke schválení</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {jobs.length === 0 && <p className="text-xs text-muted-foreground">Zatím žádné náhledy.</p>}
          {jobs.map(job => (
            <div key={job.id} className="flex items-center justify-between border rounded p-2 text-xs">
              <div>
                <div className="font-semibold">{job.source} · {job.brand} {job.model}</div>
                <div className="text-muted-foreground">
                  {job.parts_count} OEM · {job.status}
                  {job.applied_count > 0 && ` · vloženo ${job.applied_count}`}
                </div>
              </div>
              <div className="flex gap-1">
                {job.status === "preview" && (
                  <Button size="sm" variant="outline" onClick={() => openPreview(job)}>
                    <Eye className="w-3 h-3 mr-1" /> Náhled
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => discard(job.id)}>
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {activeJob && (
        <Card className="border-primary">
          <CardHeader>
            <CardTitle className="text-base">
              Náhled: {activeJob.brand} {activeJob.model} ({filteredParts.length}/{activeJob.parts_count})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Input placeholder="Filtr OEM nebo název…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-96 overflow-auto border rounded text-xs">
              <table className="w-full">
                <thead className="bg-muted sticky top-0">
                  <tr><th className="text-left p-1">OEM</th><th className="text-left p-1">Název</th><th className="text-left p-1">Kategorie</th><th className="p-1">Vyřadit</th></tr>
                </thead>
                <tbody>
                  {filteredParts.slice(0, 500).map((p, i) => (
                    <tr key={i} className={excluded.has(p.oem) ? "opacity-40" : ""}>
                      <td className="p-1 font-mono">{p.oem}</td>
                      <td className="p-1">{p.name}</td>
                      <td className="p-1 text-muted-foreground">{p.category}</td>
                      <td className="p-1 text-center">
                        <input type="checkbox" checked={excluded.has(p.oem)} onChange={() => toggleExclude(p.oem)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredParts.length > 500 && (
              <p className="text-[10px] text-muted-foreground">Zobrazeno prvních 500 (vše bude zpracováno).</p>
            )}
            <div className="flex gap-2">
              <Button onClick={handleApply} disabled={applying} className="flex-1">
                {applying ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Synchronizovat ({activeJob.parts_count - excluded.size} dílů)
              </Button>
              <Button variant="outline" onClick={() => setActiveJob(null)}>Zavřít</Button>
            </div>
            <p className="text-[10px] text-muted-foreground">
              Po vložení se automaticky spustí: kategorizace, dotažení cen z vernostsevyplaci.cz a párování kompatibility.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
