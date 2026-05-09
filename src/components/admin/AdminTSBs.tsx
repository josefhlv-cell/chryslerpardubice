/**
 * AdminTSBs — správa servisních bulletinů (TSB).
 * Vyhledávání podle VIN/modelu, CRUD, import.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, FileText, ExternalLink } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type TSB = {
  id?: string;
  tsb_number: string;
  title_cs: string;
  summary_cs: string | null;
  full_text: string | null;
  vin_pattern: string | null;
  brand: string | null;
  model: string | null;
  year_from: number | null;
  year_to: number | null;
  system: string | null;
  source_url: string | null;
  published_at: string | null;
};

const empty: TSB = {
  tsb_number: "",
  title_cs: "",
  summary_cs: "",
  full_text: "",
  vin_pattern: "",
  brand: "Chrysler",
  model: "",
  year_from: null,
  year_to: null,
  system: "",
  source_url: "",
  published_at: null,
};

const AdminTSBs = () => {
  const [items, setItems] = useState<TSB[]>([]);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<TSB | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("tsbs").select("*").order("published_at", { ascending: false }).limit(500);
    setItems((data as TSB[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const save = async () => {
    if (!edit) return;
    if (!edit.tsb_number || !edit.title_cs) {
      toast({ title: "Vyplň číslo TSB a název", variant: "destructive" });
      return;
    }
    const { error } = edit.id
      ? await supabase.from("tsbs").update(edit).eq("id", edit.id)
      : await supabase.from("tsbs").insert(edit);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Uloženo" });
    setEdit(null);
    fetchData();
  };

  const remove = async (id: string) => {
    if (!confirm("Smazat TSB?")) return;
    const { error } = await supabase.from("tsbs").delete().eq("id", id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    fetchData();
  };

  const filtered = items.filter(
    (t) =>
      !search ||
      t.tsb_number.toLowerCase().includes(search.toLowerCase()) ||
      t.title_cs.toLowerCase().includes(search.toLowerCase()) ||
      (t.model || "").toLowerCase().includes(search.toLowerCase()) ||
      (t.vin_pattern || "").toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="w-5 h-5 text-primary" />
          TSB databáze
          <Badge variant="outline" className="text-xs">{items.length}</Badge>
        </h2>
        <Button size="sm" onClick={() => setEdit({ ...empty })}>
          <Plus className="w-4 h-4 mr-1" /> Nový TSB
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Hledat podle čísla, modelu, VIN patternu…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítám…</p>}
      {!loading && filtered.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            Žádné TSB záznamy. Přidej první.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-2">
        {filtered.map((t) => (
          <Card key={t.id} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono font-bold text-primary">{t.tsb_number}</code>
                  {t.system && <Badge variant="outline" className="text-[10px]">{t.system}</Badge>}
                  {t.published_at && (
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(t.published_at).toLocaleDateString("cs-CZ")}
                    </span>
                  )}
                </div>
                <p className="text-sm font-medium mt-1">{t.title_cs}</p>
                <p className="text-[11px] text-muted-foreground">
                  {t.brand || "—"} {t.model || ""} {t.year_from ? `(${t.year_from}${t.year_to ? `–${t.year_to}` : "+"})` : ""}
                  {t.vin_pattern && ` · VIN: ${t.vin_pattern}`}
                </p>
                {t.summary_cs && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.summary_cs}</p>}
              </div>
              <div className="flex flex-col gap-1">
                {t.source_url && (
                  <Button size="icon" variant="ghost" asChild>
                    <a href={t.source_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
                  </Button>
                )}
                <Button size="icon" variant="ghost" onClick={() => setEdit(t)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => t.id && remove(t.id)}>
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!edit} onOpenChange={() => setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{edit?.id ? "Upravit" : "Nový"} TSB</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Číslo TSB</label>
                  <Input value={edit.tsb_number} onChange={(e) => setEdit({ ...edit, tsb_number: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Systém</label>
                  <Input placeholder="motor / převodovka / brzdy…" value={edit.system || ""} onChange={(e) => setEdit({ ...edit, system: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Název (CZ)</label>
                <Input value={edit.title_cs} onChange={(e) => setEdit({ ...edit, title_cs: e.target.value })} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Značka</label>
                  <Input value={edit.brand || ""} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Model</label>
                  <Input value={edit.model || ""} onChange={(e) => setEdit({ ...edit, model: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">VIN pattern</label>
                  <Input placeholder="např. 1C3CCBBG*" value={edit.vin_pattern || ""} onChange={(e) => setEdit({ ...edit, vin_pattern: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Rok od</label>
                  <Input type="number" value={edit.year_from ?? ""} onChange={(e) => setEdit({ ...edit, year_from: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Rok do</label>
                  <Input type="number" value={edit.year_to ?? ""} onChange={(e) => setEdit({ ...edit, year_to: e.target.value ? parseInt(e.target.value) : null })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Vydáno</label>
                  <Input type="date" value={edit.published_at || ""} onChange={(e) => setEdit({ ...edit, published_at: e.target.value || null })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Souhrn</label>
                <Textarea rows={2} value={edit.summary_cs || ""} onChange={(e) => setEdit({ ...edit, summary_cs: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Plný text</label>
                <Textarea rows={6} value={edit.full_text || ""} onChange={(e) => setEdit({ ...edit, full_text: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Zdrojový odkaz</label>
                <Input value={edit.source_url || ""} onChange={(e) => setEdit({ ...edit, source_url: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Zrušit</Button>
            <Button onClick={save}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminTSBs;
