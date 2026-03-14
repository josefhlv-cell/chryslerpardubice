import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, Download, Search, BookOpen, Wrench, Zap, Eye, FileText, Cpu, LayoutGrid } from "lucide-react";

type Procedure = {
  id: string;
  brand: string;
  model: string;
  category: string;
  title: string;
  content: string | null;
  source_url: string | null;
  source: string | null;
  procedure_type: string | null;
  created_at: string;
};

const MODELS = ["300", "Pacifica", "Town & Country", "Voyager", "PT Cruiser", "Sebring"];
const CATEGORIES = [
  "Motor", "Převodovka", "Brzdy", "Odpružení", "Elektroinstalace", "Klimatizace",
  "Chladící systém", "Palivový systém", "Řízení", "Výfuk", "Karoserie", "Osvětlení",
  "Startování", "Tempomat", "Přístroje", "Stěrače", "Relé a moduly", "Chlazení",
  "Okna", "Příslušenství",
];

const typeIcons: Record<string, typeof Wrench> = {
  repair: Wrench,
  diagnostic: Zap,
  inspection: Eye,
  specification: FileText,
  wiring: Cpu,
};

const typeLabels: Record<string, string> = {
  repair: "Oprava",
  diagnostic: "Diagnostika",
  inspection: "Kontrola",
  specification: "Specifikace",
  wiring: "Schéma zapojení",
};

const MODES = [
  { value: "service", label: "Servisní postupy", icon: Wrench },
  { value: "technical", label: "Technická data", icon: FileText },
  { value: "diagrams", label: "Nákresy / schémata", icon: LayoutGrid },
] as const;

const AdminServiceProcedures = () => {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [loading, setLoading] = useState(true);
  const [scraping, setScraping] = useState(false);
  const [scrapingMode, setScrapingMode] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState<Procedure | null>(null);

  const fetchProcedures = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("service_procedures" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    setProcedures((data as any as Procedure[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchProcedures(); }, []);

  const startScrape = async (mode: string, model?: string) => {
    setScraping(true);
    setScrapingMode(mode);
    const modeLabel = MODES.find(m => m.value === mode)?.label || mode;
    toast({ title: "Stahování zahájeno", description: `${modeLabel} — ${model || 'Všechny modely'}` });

    try {
      const { data, error } = await supabase.functions.invoke("scrape-service-procedures", {
        body: {
          model: model === "all" ? null : model,
          mode,
        },
      });

      if (error) throw error;

      if (data?.error) {
        toast({ title: "Chyba", description: data.error, variant: "destructive" });
      } else {
        toast({
          title: "Stahování dokončeno",
          description: `Uloženo ${data?.savedCount || 0} záznamů (${modeLabel})`,
        });
      }
      fetchProcedures();
    } catch (err: any) {
      toast({ title: "Chyba", description: err.message, variant: "destructive" });
    } finally {
      setScraping(false);
      setScrapingMode(null);
    }
  };

  const filtered = procedures.filter(p => {
    if (modelFilter !== "all" && p.model !== modelFilter) return false;
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (typeFilter !== "all" && p.procedure_type !== typeFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return p.title.toLowerCase().includes(q) || p.content?.toLowerCase().includes(q) || p.category.toLowerCase().includes(q);
    }
    return true;
  });

  const modelCounts = MODELS.reduce((acc, m) => {
    acc[m] = procedures.filter(p => p.model === m).length;
    return acc;
  }, {} as Record<string, number>);

  const typeCounts = Object.keys(typeLabels).reduce((acc, t) => {
    acc[t] = procedures.filter(p => p.procedure_type === t).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="space-y-4 mt-2">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{procedures.length}</p>
          <p className="text-xs text-muted-foreground">Celkem</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{typeCounts.specification || 0}</p>
          <p className="text-xs text-muted-foreground">Specifikace</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{typeCounts.wiring || 0}</p>
          <p className="text-xs text-muted-foreground">Schémata</p>
        </CardContent></Card>
        <Card><CardContent className="p-3 text-center">
          <p className="text-2xl font-bold text-primary">{typeCounts.repair || 0}</p>
          <p className="text-xs text-muted-foreground">Opravy</p>
        </CardContent></Card>
      </div>

      {/* Scrape controls — 3 modes */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Download className="w-4 h-4" /> Stáhnout z workshop-manuals.com
          </h3>

          {MODES.map(mode => {
            const ModeIcon = mode.icon;
            return (
              <div key={mode.value} className="space-y-2">
                <div className="flex items-center gap-2">
                  <ModeIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium">{mode.label}</span>
                </div>
                <div className="flex gap-2 flex-wrap pl-6">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startScrape(mode.value)}
                    disabled={scraping}
                  >
                    {scrapingMode === mode.value ? <RefreshCw className="w-3 h-3 mr-1 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
                    Vše
                  </Button>
                  {MODELS.slice(0, 4).map(m => (
                    <Button
                      key={m}
                      size="sm"
                      variant="ghost"
                      className="h-7 text-xs"
                      onClick={() => startScrape(mode.value, m)}
                      disabled={scraping}
                    >
                      {m}
                    </Button>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Per-model badge counts */}
      <div className="flex flex-wrap gap-1">
        {MODELS.map(m => (
          <Badge
            key={m}
            variant={modelFilter === m ? "default" : "outline"}
            className="text-[10px] cursor-pointer"
            onClick={() => setModelFilter(modelFilter === m ? "all" : m)}
          >
            {m}: {modelCounts[m]}
          </Badge>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Hledat v postupech..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Typ" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vše</SelectItem>
            {Object.entries(typeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v} ({typeCounts[k] || 0})</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Kategorie" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vše</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8">
          <RefreshCw className="w-5 h-5 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-center text-muted-foreground py-8 text-sm">
          {procedures.length === 0 ? "Zatím žádné záznamy. Spusťte stahování výše." : "Žádné výsledky"}
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.slice(0, 50).map(proc => {
            const TypeIcon = typeIcons[proc.procedure_type || 'repair'] || BookOpen;
            return (
              <Card key={proc.id} className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => setSelected(proc)}>
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                      <TypeIcon className="w-4 h-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{proc.title}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <Badge variant="outline" className="text-[10px]">{proc.model}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{proc.category}</Badge>
                        <span className="text-[10px] text-muted-foreground">
                          {typeLabels[proc.procedure_type || 'repair']}
                        </span>
                      </div>
                      {proc.content && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{proc.content.substring(0, 150)}...</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {filtered.length > 50 && (
            <p className="text-center text-xs text-muted-foreground py-2">
              Zobrazeno 50 z {filtered.length} výsledků
            </p>
          )}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-base">{selected?.title}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3">
              <div className="flex gap-2 flex-wrap">
                <Badge>{selected.model}</Badge>
                <Badge variant="secondary">{selected.category}</Badge>
                <Badge variant="outline">{typeLabels[selected.procedure_type || 'repair']}</Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <pre className="whitespace-pre-wrap text-xs bg-muted p-3 rounded-lg">{selected.content}</pre>
              </div>
              {selected.source_url && (
                <a
                  href={selected.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary underline"
                >
                  Zdroj: {selected.source}
                </a>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminServiceProcedures;
