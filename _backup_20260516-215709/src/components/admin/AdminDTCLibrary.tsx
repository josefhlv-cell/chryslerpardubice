/**
 * AdminDTCLibrary — CRUD pro tabulku dtc_codes.
 * Admin může přidávat / editovat české popisy chybových kódů.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, Search, BookOpen } from "lucide-react";
import { toast } from "@/hooks/use-toast";

type DTC = {
  id?: string;
  code: string;
  system: string;
  severity: string;
  title_cs: string;
  description_cs: string | null;
  causes_cs: string | null;
  solution_cs: string | null;
  affected_models: string[];
};

const empty: DTC = {
  code: "",
  system: "powertrain",
  severity: "medium",
  title_cs: "",
  description_cs: "",
  causes_cs: "",
  solution_cs: "",
  affected_models: ["Chrysler", "Dodge", "RAM"],
};

const sevColor: Record<string, string> = {
  low: "bg-success/15 text-success border-success/30",
  medium: "bg-warning/15 text-warning border-warning/30",
  high: "bg-destructive/15 text-destructive border-destructive/30",
};

const AdminDTCLibrary = () => {
  const [items, setItems] = useState<DTC[]>([]);
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<DTC | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    const { data } = await supabase.from("dtc_codes").select("*").order("code").limit(500);
    setItems((data as DTC[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const save = async () => {
    if (!edit) return;
    if (!edit.code || !edit.title_cs) {
      toast({ title: "Vyplň kód a název", variant: "destructive" });
      return;
    }
    const payload = { ...edit, code: edit.code.toUpperCase().trim() };
    const { error } = edit.id
      ? await supabase.from("dtc_codes").update(payload).eq("id", edit.id)
      : await supabase.from("dtc_codes").insert(payload);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Uloženo" });
    setEdit(null);
    fetchData();
  };

  const remove = async (id: string) => {
    if (!confirm("Smazat tento DTC kód?")) return;
    const { error } = await supabase.from("dtc_codes").delete().eq("id", id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    fetchData();
  };

  const filtered = items.filter(
    (d) =>
      !search ||
      d.code.toLowerCase().includes(search.toLowerCase()) ||
      d.title_cs.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-primary" />
          DTC knihovna
          <Badge variant="outline" className="text-xs">{items.length}</Badge>
        </h2>
        <Button size="sm" onClick={() => setEdit({ ...empty })}>
          <Plus className="w-4 h-4 mr-1" /> Nový kód
        </Button>
      </div>

      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          className="pl-8"
          placeholder="Hledat kód nebo název…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading && <p className="text-sm text-muted-foreground">Načítám…</p>}

      <div className="grid gap-2">
        {filtered.map((d) => (
          <Card key={d.id} className="hover:border-primary/40 transition-colors">
            <CardContent className="p-3 flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <code className="text-sm font-mono font-bold text-primary">{d.code}</code>
                  <Badge variant="outline" className="text-[10px]">{d.system}</Badge>
                  <Badge className={`text-[10px] ${sevColor[d.severity] || ""}`}>{d.severity}</Badge>
                </div>
                <p className="text-sm font-medium mt-1">{d.title_cs}</p>
                {d.description_cs && (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{d.description_cs}</p>
                )}
              </div>
              <div className="flex flex-col gap-1">
                <Button size="icon" variant="ghost" onClick={() => setEdit(d)}>
                  <Pencil className="w-4 h-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => d.id && remove(d.id)}>
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
            <DialogTitle>{edit?.id ? "Upravit" : "Nový"} DTC kód</DialogTitle>
          </DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Kód</label>
                  <Input
                    placeholder="P0420"
                    value={edit.code}
                    onChange={(e) => setEdit({ ...edit, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Systém</label>
                  <Select value={edit.system} onValueChange={(v) => setEdit({ ...edit, system: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="powertrain">powertrain</SelectItem>
                      <SelectItem value="body">body</SelectItem>
                      <SelectItem value="chassis">chassis</SelectItem>
                      <SelectItem value="network">network</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Závažnost</label>
                  <Select value={edit.severity} onValueChange={(v) => setEdit({ ...edit, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Název (CZ)</label>
                <Input value={edit.title_cs} onChange={(e) => setEdit({ ...edit, title_cs: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Popis</label>
                <Textarea rows={2} value={edit.description_cs || ""} onChange={(e) => setEdit({ ...edit, description_cs: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Možné příčiny</label>
                <Textarea rows={2} value={edit.causes_cs || ""} onChange={(e) => setEdit({ ...edit, causes_cs: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Doporučené řešení</label>
                <Textarea rows={2} value={edit.solution_cs || ""} onChange={(e) => setEdit({ ...edit, solution_cs: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Modely (čárka)</label>
                <Input
                  value={edit.affected_models.join(", ")}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      affected_models: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
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

export default AdminDTCLibrary;
