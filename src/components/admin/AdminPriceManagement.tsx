import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import { Loader2, Lock, Unlock, DollarSign, History, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Part = {
  id: string;
  name: string;
  oem_number: string;
  price_without_vat: number;
  price_with_vat: number;
  price_locked: boolean;
  admin_price: number | null;
  admin_margin_percent: number | null;
  last_price_update: string | null;
};

type PriceHistoryEntry = {
  id: string;
  old_price_without_vat: number;
  new_price_without_vat: number;
  old_price_with_vat: number;
  new_price_with_vat: number;
  source: string;
  created_at: string;
};

const AdminPriceManagement = () => {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [editPart, setEditPart] = useState<Part | null>(null);
  const [formPrice, setFormPrice] = useState("");
  const [formMargin, setFormMargin] = useState("");
  const [formLocked, setFormLocked] = useState(false);
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [historyPart, setHistoryPart] = useState<Part | null>(null);
  const [syncing, setSyncing] = useState(false);

  const searchParts = async () => {
    if (!search) return;
    setLoading(true);
    const { data } = await supabase.from("parts_new").select("id, name, oem_number, price_without_vat, price_with_vat, price_locked, admin_price, admin_margin_percent, last_price_update")
      .or(`oem_number.ilike.%${search}%,name.ilike.%${search}%`)
      .limit(20);
    setParts((data as Part[]) || []);
    setLoading(false);
  };

  const openEdit = (p: Part) => {
    setEditPart(p);
    setFormPrice(p.admin_price?.toString() || p.price_without_vat.toString());
    setFormMargin(p.admin_margin_percent?.toString() || "0");
    setFormLocked(p.price_locked);
  };

  const savePart = async () => {
    if (!editPart) return;
    const priceVal = parseFloat(formPrice);
    const marginVal = parseFloat(formMargin) || 0;
    const finalPrice = priceVal * (1 + marginVal / 100);
    const { error } = await supabase.from("parts_new").update({
      admin_price: priceVal,
      admin_margin_percent: marginVal,
      price_locked: formLocked,
      price_without_vat: finalPrice,
      price_with_vat: Math.round(finalPrice * 1.21 * 100) / 100,
    } as any).eq("id", editPart.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Cena uložena" });
    setEditPart(null);
    searchParts();
  };

  const showHistory = async (p: Part) => {
    setHistoryPart(p);
    const { data } = await supabase.from("price_history" as any).select("*").eq("part_id", p.id).order("created_at", { ascending: false }).limit(20);
    setHistory((data as any as PriceHistoryEntry[]) || []);
  };

  const syncPrices = async () => {
    if (parts.length === 0) return;
    setSyncing(true);
    try {
      const partNumbers = parts.map(p => p.oem_number);
      const { data, error } = await supabase.functions.invoke("price-sync", {
        body: { partNumbers, mode: "force" },
      });
      if (error) throw error;
      toast({ title: "Ceny synchronizovány", description: `${data?.results?.length || 0} dílů aktualizováno` });
      searchParts();
    } catch (err: any) {
      toast({ title: "Chyba synchronizace", description: err.message, variant: "destructive" });
    }
    setSyncing(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Hledat díl (OEM nebo název)..." value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === "Enter" && searchParts()} />
        <Button onClick={searchParts} disabled={loading} size="icon">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
        </Button>
        <Button onClick={syncPrices} disabled={syncing || parts.length === 0} variant="outline" size="icon" title="Synchronizovat ceny">
          <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} />
        </Button>
      </div>

      {parts.length === 0 && !loading && <p className="text-sm text-muted-foreground text-center py-4">Zadejte OEM číslo nebo název dílu</p>}

      {parts.map(p => (
        <Card key={p.id} className={p.price_locked ? "border-primary/30" : ""}>
          <CardContent className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  {p.price_locked && <Lock className="w-3 h-3 text-primary shrink-0" />}
                  <p className="font-semibold text-sm truncate">{p.name}</p>
                </div>
                <p className="text-xs text-muted-foreground font-mono">OEM: {p.oem_number}</p>
                <div className="flex gap-3 mt-1 text-xs">
                  <span>Bez DPH: <strong>{p.price_without_vat.toLocaleString("cs")} Kč</strong></span>
                  <span>S DPH: <strong>{p.price_with_vat.toLocaleString("cs")} Kč</strong></span>
                </div>
                {p.last_price_update && <p className="text-[10px] text-muted-foreground mt-0.5">Aktualizace: {new Date(p.last_price_update).toLocaleString("cs-CZ")}</p>}
              </div>
              <div className="flex gap-1 shrink-0">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => showHistory(p)}>
                  <History className="w-3 h-3" />
                </Button>
                <Button size="sm" variant="outline" className="text-xs" onClick={() => openEdit(p)}>
                  <DollarSign className="w-3 h-3" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Edit price dialog */}
      <Dialog open={!!editPart} onOpenChange={() => setEditPart(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit cenu – {editPart?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground font-mono">OEM: {editPart?.oem_number}</p>
            <div>
              <label className="text-sm font-medium">Cena bez DPH (Kč)</label>
              <Input type="number" value={formPrice} onChange={e => setFormPrice(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Marže (%)</label>
              <Input type="number" value={formMargin} onChange={e => setFormMargin(e.target.value)} placeholder="0" />
              {parseFloat(formPrice) > 0 && parseFloat(formMargin) > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Výsledná cena: {(parseFloat(formPrice) * (1 + parseFloat(formMargin) / 100)).toLocaleString("cs")} Kč bez DPH
                </p>
              )}
            </div>
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                {formLocked ? <Lock className="w-4 h-4 text-primary" /> : <Unlock className="w-4 h-4" />}
                <span className="text-sm">Zamknout cenu (blokuje auto-aktualizaci)</span>
              </div>
              <Switch checked={formLocked} onCheckedChange={setFormLocked} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPart(null)}>Zrušit</Button>
            <Button onClick={savePart}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Price history dialog */}
      <Dialog open={!!historyPart} onOpenChange={() => setHistoryPart(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Historie cen – {historyPart?.oem_number}</DialogTitle></DialogHeader>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">Žádná historie změn</p>
          ) : (
            <div className="space-y-2">
              {history.map(h => (
                <Card key={h.id}>
                  <CardContent className="p-3 text-xs">
                    <div className="flex justify-between">
                      <span>{new Date(h.created_at).toLocaleString("cs-CZ")}</span>
                      <Badge variant="outline" className="text-[9px]">{h.source}</Badge>
                    </div>
                    <div className="mt-1">
                      <span className="text-muted-foreground">Bez DPH: </span>
                      <span className="line-through text-muted-foreground">{h.old_price_without_vat.toLocaleString("cs")}</span>
                      <span className="ml-1 font-semibold">{h.new_price_without_vat.toLocaleString("cs")} Kč</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPriceManagement;
