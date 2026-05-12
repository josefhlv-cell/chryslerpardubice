import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { RefreshCw, ExternalLink, Pencil, Loader2, Search, Trash2, EyeOff, Eye, Car } from "lucide-react";

type Vehicle = {
  id: string;
  brand: string;
  model: string;
  year: number;
  price: number;
  mileage: number | null;
  fuel: string | null;
  power: string | null;
  engine: string | null;
  transmission: string | null;
  color: string | null;
  vin: string | null;
  condition: string | null;
  description: string | null;
  images: string[] | null;
  is_active: boolean;
  listing_url: string | null;
  updated_at: string;
};

type SyncStatus = {
  status?: string;
  phase?: string;
  progress?: number;
  message?: string;
  vehicles?: number;
  updated?: number;
  created?: number;
  removed?: number;
  error?: string;
};

const fmtPrice = (n: number) =>
  new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: 0 }).format(n) + " Kč";
const fmtKm = (n: number | null) =>
  n == null ? "—" : new Intl.NumberFormat("cs-CZ").format(n) + " km";

export default function AdminVehicleListings() {
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [edit, setEdit] = useState<Vehicle | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const missingFields = (v: Vehicle): string[] => {
    const m: string[] = [];
    if (!v.engine) m.push("motor");
    if (!v.power) m.push("výkon");
    if (!v.transmission) m.push("převodovka");
    if (!v.color) m.push("barva");
    if (!v.fuel) m.push("palivo");
    if (!v.description || v.description.length < 30) m.push("popis");
    if (!v.images || v.images.length === 0) m.push("foto");
    if (!v.vin) m.push("VIN");
    if (!v.listing_url) m.push("zdroj");
    return m;
  };

  const refreshOne = async (v: Vehicle) => {
    setRefreshingId(v.id);
    try {
      const { data, error } = await supabase.functions.invoke("scrape-vehicles", { body: { refreshOne: v.id } });
      if (error || !(data as any)?.success) throw new Error(error?.message || (data as any)?.error || "Refresh selhal");
      toast({ title: "Vůz aktualizován", description: `Doplněna pole: ${((data as any).fields || []).join(", ")}` });
      await load();
    } catch (e: any) {
      toast({ title: "Chyba", description: e?.message, variant: "destructive" });
    } finally {
      setRefreshingId(null);
    }
  };


  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("vehicles")
      .select("*")
      .order("is_active", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) toast({ title: "Chyba", description: error.message, variant: "destructive" });
    setVehicles((data as any) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Sync from chrysler.cz
  const startSync = async () => {
    setSyncing(true);
    setSyncStatus({ status: "running", phase: "queued", progress: 5, message: "Spouštím synchronizaci…" });
    try {
      const { data, error } = await supabase.functions.invoke("scrape-vehicles", { body: {} });
      if (error) throw error;
      const jobId = (data as any)?.jobId;
      setSyncStatus(data as any);
      if (!jobId) throw new Error("Chybí jobId.");
      // Poll
      const start = Date.now();
      while (Date.now() - start < 10 * 60 * 1000) {
        await new Promise((r) => setTimeout(r, 2500));
        const { data: poll } = await supabase.functions.invoke("scrape-vehicles", { body: { jobId } });
        if (poll) setSyncStatus(poll as any);
        const st = (poll as any)?.status;
        if (st === "completed" || st === "failed") break;
      }
      await load();
      const final = syncStatus;
      toast({
        title: "Synchronizace dokončena",
        description: (final?.message || "Hotovo"),
      });
    } catch (e: any) {
      setSyncStatus({ status: "failed", message: e?.message, error: e?.message });
      toast({ title: "Chyba synchronizace", description: e?.message || "Neznámá chyba", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  };

  const toggleActive = async (v: Vehicle) => {
    const { error } = await supabase.from("vehicles").update({ is_active: !v.is_active }).eq("id", v.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: v.is_active ? "Skryto z nabídky" : "Publikováno" });
    load();
  };

  const removeVehicle = async (v: Vehicle) => {
    if (!confirm(`Smazat ${v.brand} ${v.model} (${v.year})?`)) return;
    const { error } = await supabase.from("vehicles").delete().eq("id", v.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Smazáno" });
    load();
  };

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    const { id, ...updates } = edit;
    const { error } = await supabase.from("vehicles").update(updates).eq("id", id);
    setSaving(false);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Uloženo" });
    setEdit(null);
    load();
  };

  const filtered = vehicles.filter((v) => {
    if (!showInactive && !v.is_active) return false;
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (
      v.brand.toLowerCase().includes(q) ||
      v.model.toLowerCase().includes(q) ||
      String(v.year).includes(q) ||
      (v.vin || "").toLowerCase().includes(q)
    );
  });

  const stats = {
    active: vehicles.filter((v) => v.is_active).length,
    inactive: vehicles.filter((v) => !v.is_active).length,
    incomplete: vehicles.filter((v) => v.is_active && missingFields(v).length > 0).length,
  };


  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Car className="w-5 h-5 text-primary" /> Nabídka vozů
          </h2>
          <p className="text-xs text-muted-foreground">
            Aktivních: <strong>{stats.active}</strong> · Skrytých: {stats.inactive} · Neúplných: {stats.incomplete}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={startSync} disabled={syncing} className="gap-2">
            {syncing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            Aktualizovat z chrysler.cz
          </Button>
          <Button variant="outline" size="sm" onClick={load}>Obnovit</Button>
        </div>
      </div>

      {syncStatus && (syncing || syncStatus.status !== "completed") && (
        <Card className="border-primary/30">
          <CardContent className="p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span>{syncStatus.message || "—"}</span>
              <Badge variant="outline">{syncStatus.phase || syncStatus.status}</Badge>
            </div>
            <div className="h-2 rounded bg-muted overflow-hidden">
              <div className="h-full bg-primary transition-all" style={{ width: `${syncStatus.progress ?? 0}%` }} />
            </div>
            {(syncStatus.created != null || syncStatus.updated != null || syncStatus.removed != null) && (
              <p className="text-xs text-muted-foreground">
                Nových: {syncStatus.created ?? 0} · Aktualizováno: {syncStatus.updated ?? 0} · Deaktivováno: {syncStatus.removed ?? 0}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Hledat značku, model, VIN…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-inactive" checked={showInactive} onCheckedChange={setShowInactive} />
          <Label htmlFor="show-inactive" className="text-sm">Zobrazit skryté</Label>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">Žádné vozy</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => {
            const img = v.images?.[0];
            const incomplete = !v.engine || !v.transmission || !v.color;
            return (
              <Card key={v.id} className={!v.is_active ? "opacity-60" : ""}>
                <CardContent className="p-3 space-y-2">
                  {img ? (
                    <img src={img} alt={`${v.brand} ${v.model}`} loading="lazy" className="w-full h-36 object-cover rounded" />
                  ) : (
                    <div className="w-full h-36 rounded bg-muted flex items-center justify-center text-muted-foreground text-xs">
                      Bez fotky
                    </div>
                  )}
                  <div>
                    <p className="font-semibold text-sm leading-tight">{v.brand} {v.model}</p>
                    <p className="text-xs text-muted-foreground">{v.year} · {fmtKm(v.mileage)} · {v.fuel || "—"}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-primary">{fmtPrice(Number(v.price))}</span>
                    <div className="flex gap-1">
                      {!v.is_active && <Badge variant="outline">Skryto</Badge>}
                      {incomplete && v.is_active && <Badge variant="outline" className="border-warning/50 text-warning">Neúplné</Badge>}
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">VIN: {v.vin || "—"}</p>
                  <div className="grid grid-cols-2 gap-1 pt-1">
                    <Button size="sm" variant="outline" onClick={() => setEdit(v)} className="gap-1">
                      <Pencil className="w-3.5 h-3.5" /> Upravit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => toggleActive(v)} className="gap-1">
                      {v.is_active ? <><EyeOff className="w-3.5 h-3.5" />Skrýt</> : <><Eye className="w-3.5 h-3.5" />Publikovat</>}
                    </Button>
                    {v.listing_url && (
                      <Button size="sm" variant="ghost" asChild className="gap-1">
                        <a href={v.listing_url} target="_blank" rel="noreferrer"><ExternalLink className="w-3.5 h-3.5" /> Zdroj</a>
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => removeVehicle(v)} className="gap-1 text-destructive">
                      <Trash2 className="w-3.5 h-3.5" /> Smazat
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Upravit vůz</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div><Label>Značka</Label><Input value={edit.brand} onChange={(e) => setEdit({ ...edit, brand: e.target.value })} /></div>
                <div><Label>Model</Label><Input value={edit.model} onChange={(e) => setEdit({ ...edit, model: e.target.value })} /></div>
                <div><Label>Rok</Label><Input type="number" value={edit.year} onChange={(e) => setEdit({ ...edit, year: Number(e.target.value) })} /></div>
                <div><Label>Cena (Kč)</Label><Input type="number" value={edit.price} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></div>
                <div><Label>Nájezd (km)</Label><Input type="number" value={edit.mileage ?? ""} onChange={(e) => setEdit({ ...edit, mileage: e.target.value ? Number(e.target.value) : null })} /></div>
                <div><Label>Palivo</Label><Input value={edit.fuel ?? ""} onChange={(e) => setEdit({ ...edit, fuel: e.target.value })} /></div>
                <div><Label>Motor</Label><Input value={edit.engine ?? ""} onChange={(e) => setEdit({ ...edit, engine: e.target.value })} /></div>
                <div><Label>Výkon</Label><Input value={edit.power ?? ""} onChange={(e) => setEdit({ ...edit, power: e.target.value })} /></div>
                <div><Label>Převodovka</Label><Input value={edit.transmission ?? ""} onChange={(e) => setEdit({ ...edit, transmission: e.target.value })} /></div>
                <div><Label>Barva</Label><Input value={edit.color ?? ""} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></div>
                <div className="col-span-2"><Label>VIN</Label><Input value={edit.vin ?? ""} onChange={(e) => setEdit({ ...edit, vin: e.target.value })} /></div>
                <div className="col-span-2"><Label>Stav</Label><Input value={edit.condition ?? ""} onChange={(e) => setEdit({ ...edit, condition: e.target.value })} /></div>
                <div className="col-span-2"><Label>Odkaz na chrysler.cz</Label><Input value={edit.listing_url ?? ""} onChange={(e) => setEdit({ ...edit, listing_url: e.target.value })} /></div>
                <div className="col-span-2"><Label>Hlavní foto (URL)</Label><Input value={edit.images?.[0] ?? ""} onChange={(e) => setEdit({ ...edit, images: [e.target.value].filter(Boolean) })} /></div>
              </div>
              <div><Label>Popis</Label><Textarea rows={5} value={edit.description ?? ""} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
              <div className="flex items-center gap-2">
                <Switch id="active" checked={edit.is_active} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} />
                <Label htmlFor="active">Publikováno</Label>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdit(null)}>Zrušit</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
