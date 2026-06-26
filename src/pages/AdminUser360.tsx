**
 * AdminUser360 — kompletní pohled na zákazníka.
 *
 * Vyhledávání podle jména, e-mailu, telefonu, VIN nebo SPZ.
 * Detailní karta zákazníka s tabulkami všech vazeb:
 *   Kontakt · Vozy · Objednávky · Servisní zakázky · Rezervace
 *   Poptávky vozů · Hlášení závad · Notifikace · OBD aktivita
 *
 * Akce: poslat push, vystavit servisní záznam, upravit profil,
 *       schválit firmu, změnit slevu.
 *
 * Bezpečnost: stránka chráněna useAuth().isAdmin, všechna data
 * čtena přes Supabase JS — RLS zajistí přístup pouze adminům
 * (has_role(uid,'admin')).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search, User, Car, ShoppingCart, Wrench, Calendar, AlertTriangle,
  Bell, Activity, ArrowLeft, BookOpen, Loader2, Send, Pencil, History, UserPlus,
  ChevronLeft, ChevronRight, CheckCircle2, Clock, MailPlus, Settings,
} from "lucide-react";

type Profile = {
  id: string; user_id: string;
  full_name: string | null; email: string | null; phone: string | null;
  company_name: string | null; ico: string | null; dic: string | null;
  account_type: string; status: string; discount_percent: number;
  created_at: string;
};


type CustomerObdPermissions = {
  user_id: string;
  remote_obd_enabled: boolean;
  live_data: boolean;
  read_dtc: boolean;
  clear_dtc: boolean;
  gps_tracking: boolean;
  service_history: boolean;
  actuator_tests: boolean;
  adaptations: boolean;
  reset_service: boolean;
  dpf_regeneration: boolean;
  epb_service: boolean;
  sas_calibration: boolean;
  bms_reset: boolean;
  coding: boolean;
  ecu_flash: boolean;
  updated_by?: string | null;
  updated_at?: string | null;
};

const DEFAULT_OBD_PERMISSIONS: CustomerObdPermissions = {
  user_id: "",
  remote_obd_enabled: true,
  live_data: true,
  read_dtc: true,
  clear_dtc: false,
  gps_tracking: false,
  service_history: true,
  actuator_tests: false,
  adaptations: false,
  reset_service: false,
  dpf_regeneration: false,
  epb_service: false,
  sas_calibration: false,
  bms_reset: false,
  coding: false,
  ecu_flash: false,
  updated_by: null,
  updated_at: null,
};

const OBD_PERMISSION_GROUPS: Array<{
  title: string;
  description: string;
  items: Array<{ key: keyof CustomerObdPermissions; label: string; description: string; dangerous?: boolean }>;
}> = [
  {
    title: "Základní diagnostika",
    description: "Funkce, které admin používá nejčastěji při vzdálené kontrole vozidla.",
    items: [
      { key: "remote_obd_enabled", label: "Vzdálená OBD diagnostika", description: "Hlavní vypínač. Když je vypnutý, admin se k zákazníkově OBD relaci nepřipojí." },
      { key: "live_data", label: "Live Data", description: "Otáčky, rychlost, teploty, napětí, tlak, zatížení motoru a další živé hodnoty." },
      { key: "read_dtc", label: "Čtení DTC", description: "Zobrazení chybových kódů uložených v řídicí jednotce." },
      { key: "clear_dtc", label: "Mazání DTC", description: "Možnost mazat chybové kódy. Doporučeno zapínat jen při servisu.", dangerous: true },
    ],
  },
  {
    title: "Sdílení a servis",
    description: "Data navázaná na servisní podporu a lokalizaci zákazníka.",
    items: [
      { key: "gps_tracking", label: "GPS poloha", description: "Poloha zákazníka/vozidla během diagnostiky." },
      { key: "service_history", label: "Servisní historie", description: "Přístup k servisní historii zákazníka a vozidla." },
      { key: "reset_service", label: "Reset servisního intervalu", description: "Povolit servisní reset po provedené údržbě.", dangerous: true },
    ],
  },
  {
    title: "Servisní procedury",
    description: "Pokročilé funkce, které musí zůstat pod kontrolou admina.",
    items: [
      { key: "actuator_tests", label: "Test akčních členů", description: "Spouštění testů ventilátorů, relé, čerpadel a dalších akčních členů.", dangerous: true },
      { key: "adaptations", label: "Adaptace", description: "Resety/adaptace hodnot řídicích jednotek.", dangerous: true },
      { key: "dpf_regeneration", label: "DPF regenerace", description: "Spuštění servisní regenerace DPF.", dangerous: true },
      { key: "epb_service", label: "EPB servisní režim", description: "Servisní režim elektronické parkovací brzdy.", dangerous: true },
      { key: "sas_calibration", label: "SAS kalibrace", description: "Kalibrace snímače úhlu volantu.", dangerous: true },
      { key: "bms_reset", label: "BMS / baterie", description: "Registrace nebo reset baterie/BMS.", dangerous: true },
    ],
  },
  {
    title: "Profesionální funkce",
    description: "Nejrizikovější funkce. Nechávat vypnuté, pokud nejsou výslovně potřeba.",
    items: [
      { key: "coding", label: "Kódování", description: "Změny konfigurace modulů. Jen pro vyškolené osoby.", dangerous: true },
      { key: "ecu_flash", label: "Flash ECU", description: "Programování řídicí jednotky. Zapínat pouze výjimečně.", dangerous: true },
    ],
  },
];

const fmt = (d?: string | null) =>
  !d ? "—" : new Date(d).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });

const Loader = () => (
  <div className="flex items-center justify-center p-6">
    <Loader2 className="w-5 h-5 animate-spin text-primary" />
  </div>
);

/* ───────── SEARCH + LIST ───────── */
function SearchView({ onPick }: { onPick: (userId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  // Browsable list of all customers
  const [all, setAll] = useState<Profile[]>([]);
  const [stats, setStats] = useState<Record<string, { orders: number; spend: number; lastOrder?: string }>>({});
  const [listLoading, setListLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "private" | "business" | "pending">("all");
  const [sortBy, setSortBy] = useState<"recent" | "spend" | "orders" | "name">("name");

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Bulk selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNotifyOpen, setBulkNotifyOpen] = useState(false);
  const [bulkTitle, setBulkTitle] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");

  const loadAll = async () => {
    setListLoading(true);
    try {
      // Stránkovaný fetch (Supabase má limit 1000/dotaz) — vezmeme až 5000 nejnovějších.
      const PAGE = 1000;
      const MAX_PAGES = 5;
      let list: Profile[] = [];
      for (let i = 0; i < MAX_PAGES; i++) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .order("created_at", { ascending: false })
          .range(i * PAGE, i * PAGE + PAGE - 1);
        if (error) break;
        const chunk = (data as Profile[]) || [];
        list = list.concat(chunk);
        if (chunk.length < PAGE) break;
      }
      setAll(list);

      const ids = list.map((p) => p.user_id);
      if (ids.length) {
        // Také batchovat IN, kdyby seznam byl velký
        const map: Record<string, { orders: number; spend: number; lastOrder?: string }> = {};
        const STEP = 500;
        for (let i = 0; i < ids.length; i += STEP) {
          const batch = ids.slice(i, i + STEP);
          const { data: ords } = await supabase
            .from("orders")
            .select("user_id, price_with_vat, quantity, created_at")
            .in("user_id", batch);
          (ords || []).forEach((o: any) => {
            const k = o.user_id;
            if (!map[k]) map[k] = { orders: 0, spend: 0 };
            map[k].orders += 1;
            map[k].spend += Number(o.price_with_vat || 0) * Number(o.quantity || 1);
            if (!map[k].lastOrder || o.created_at > map[k].lastOrder) map[k].lastOrder = o.created_at;
          });
        }
        setStats(map);
      }
    } catch (e: any) {
      toast.error("Načítání zákazníků selhalo: " + (e?.message || ""));
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const search = async () => {
    const term = q.trim();
    if (!term) { setResults([]); return; }
    setLoading(true);
    try {
      const pat = `%${term}%`;
      const profQ = supabase
        .from("profiles")
        .select("*")
        .or(
          `full_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},company_name.ilike.${pat},ico.ilike.${pat}`,
        )
        .limit(40);
      const vehQ = supabase
        .from("user_vehicles")
        .select("user_id")
        .or(`vin.ilike.${pat},license_plate.ilike.${pat}`)
        .limit(40);

      const [{ data: profs }, { data: vehs }] = await Promise.all([profQ, vehQ]);
      const idSet = new Set<string>((profs || []).map((p) => p.user_id));
      const extraIds = (vehs || []).map((v: any) => v.user_id).filter((id: string) => id && !idSet.has(id));

      let extra: Profile[] = [];
      if (extraIds.length) {
        const { data } = await supabase.from("profiles").select("*").in("user_id", extraIds);
        extra = (data as Profile[]) || [];
      }
      setResults([...((profs as Profile[]) || []), ...extra]);
    } catch (e: any) {
      toast.error("Hledání selhalo: " + (e?.message || "neznámá chyba"));
    } finally {
      setLoading(false);
    }
  };

  const filtered = useMemo(() => {
    let arr = [...all];
    if (filter === "private") arr = arr.filter((p) => p.account_type !== "business");
    else if (filter === "business") arr = arr.filter((p) => p.account_type === "business");
    else if (filter === "pending") arr = arr.filter((p) => p.status === "pending");

    arr.sort((a, b) => {
      if (sortBy === "spend") return (stats[b.user_id]?.spend || 0) - (stats[a.user_id]?.spend || 0);
      if (sortBy === "orders") return (stats[b.user_id]?.orders || 0) - (stats[a.user_id]?.orders || 0);
      if (sortBy === "name") return (a.full_name || a.company_name || "").localeCompare(b.full_name || b.company_name || "");
      return (b.created_at || "").localeCompare(a.created_at || "");
    });
    return arr;
  }, [all, stats, filter, sortBy]);

  // Reset stránky když se změní filtr / řazení
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filter, sortBy, pageSize]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageItems = useMemo(
    () => filtered.slice((page - 1) * pageSize, page * pageSize),
    [filtered, page, pageSize],
  );

  const totals = useMemo(() => ({
    total: all.length,
    business: all.filter((p) => p.account_type === "business").length,
    pending: all.filter((p) => p.status === "pending").length,
    revenue: Object.values(stats).reduce((s, x) => s + (x.spend || 0), 0),
  }), [all, stats]);

  const toggleOne = (uid: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(uid)) n.delete(uid); else n.add(uid);
      return n;
    });
  };

  const allOnPageSelected = pageItems.length > 0 && pageItems.every((p) => selected.has(p.user_id));
  const togglePage = () => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (allOnPageSelected) pageItems.forEach((p) => n.delete(p.user_id));
      else pageItems.forEach((p) => n.add(p.user_id));
      return n;
    });
  };

  const bulkSetStatus = async (status: "active" | "pending") => {
    if (selected.size === 0) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("profiles").update({ status }).in("user_id", ids);
      if (error) throw error;

      // Notifikace každému zákazníkovi
      const title = status === "active" ? "✅ Účet schválen" : "⏳ Účet čeká na schválení";
      const message = status === "active"
        ? "Váš účet byl schválen. Nyní můžete plně využívat aplikaci a vytvářet objednávky."
        : "Váš účet byl přepnut do stavu „čeká na schválení“. O dalším postupu vás budeme informovat.";
      await supabase.from("notifications").insert(
        ids.map((uid) => ({ user_id: uid, title, message })),
      );

      toast.success(`Upraveno ${ids.length} účtů (${status === "active" ? "schválené" : "čekající"})`);
      setSelected(new Set());
      await loadAll();
    } catch (e: any) {
      toast.error("Hromadná akce selhala: " + (e?.message || ""));
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkNotify = async () => {
    if (selected.size === 0 || !bulkTitle.trim()) return;
    setBulkBusy(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("notifications").insert(
        ids.map((uid) => ({ user_id: uid, title: bulkTitle, message: bulkMsg })),
      );
      if (error) throw error;
      toast.success(`Notifikace odeslána ${ids.length} zákazníkům`);
      setBulkNotifyOpen(false); setBulkTitle(""); setBulkMsg("");
      setSelected(new Set());
    } catch (e: any) {
      toast.error("Odeslání selhalo: " + (e?.message || ""));
    } finally {
      setBulkBusy(false);
    }
  };

  const renderRow = (p: Profile, withCheckbox = false) => {
    const s = stats[p.user_id];
    const isSel = selected.has(p.user_id);
    return (
      <Card key={p.id} className={`hover:border-primary/40 ${isSel ? "border-primary/60 bg-primary/5" : ""}`}>
        <CardContent className="p-3 flex items-center gap-3">
          {withCheckbox && (
            <Checkbox
              checked={isSel}
              onCheckedChange={() => toggleOne(p.user_id)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="min-w-0 flex-1 cursor-pointer" onClick={() => onPick(p.user_id)}>
            <p className="text-sm font-semibold truncate">
              {p.full_name || p.company_name || "(bez jména)"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {p.email || "—"} · {p.phone || "—"}
            </p>
            {p.company_name && (
              <p className="text-[11px] text-muted-foreground truncate">
                Firma: {p.company_name} · IČO {p.ico || "—"}
              </p>
            )}
            <p className="text-[11px] text-amber-300 mt-0.5">
              {s?.orders || 0} obj. · {Math.round(s?.spend || 0).toLocaleString("cs-CZ")} Kč
              {s?.lastOrder && <span className="text-muted-foreground"> · poslední {fmt(s.lastOrder)}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Badge variant="outline" className="text-[10px]">
              {p.account_type === "business" ? "Firma" : "Soukromá"}
            </Badge>
            <Badge
              className={
                p.status === "active"
                  ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                  : p.status === "pending"
                  ? "bg-amber-500/15 text-amber-300 border-amber-500/30"
                  : "bg-red-500/15 text-red-300 border-red-500/30"
              }
            >
              {p.status}
            </Badge>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4 text-amber-400" /> Hledat zákazníka
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Jméno, e-mail, telefon, IČO, VIN nebo SPZ"
              onKeyDown={(e) => e.key === "Enter" && search()}
            />
            <Button onClick={search} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Tip: pro vyhledání podle vozu zadej VIN (např. 1C3CDXBG) nebo SPZ.
          </p>
        </CardContent>
      </Card>

      {results.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-muted-foreground">Výsledky hledání ({results.length})</h3>
          {results.map((p) => renderRow(p, false))}
        </div>
      )}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between flex-wrap gap-2">
            <span className="flex items-center gap-2">
              <User className="w-4 h-4 text-amber-400" /> Všichni zákazníci
              <Badge variant="outline" className="text-[10px]">{totals.total}</Badge>
            </span>
            <span className="text-[11px] text-muted-foreground font-normal">
              {totals.business} firem · {totals.pending} čeká · obrat {Math.round(totals.revenue).toLocaleString("cs-CZ")} Kč
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([
              ["all", "Vše"], ["private", "Soukromí"], ["business", "Firmy"], ["pending", "Čekající"],
            ] as const).map(([k, lbl]) => (
              <Button key={k} size="sm" variant={filter === k ? "default" : "outline"} onClick={() => setFilter(k)}>
                {lbl}
              </Button>
            ))}
            <div className="ml-auto flex gap-1 flex-wrap">
              {([
                ["recent", "Nejnovější"], ["spend", "Útrata"], ["orders", "Objednávky"], ["name", "Jméno"],
              ] as const).map(([k, lbl]) => (
                <Button key={k} size="sm" variant={sortBy === k ? "default" : "ghost"} onClick={() => setSortBy(k)}>
                  {lbl}
                </Button>
              ))}
            </div>
          </div>

          {/* A-Z rychlý skok (jen při řazení podle jména) */}
          {sortBy === "name" && filtered.length > 0 && (
            <div className="flex flex-wrap gap-1 p-2 rounded-md border border-border/40 bg-card/30">
              <span className="text-[10px] text-muted-foreground mr-1 self-center">A–Z:</span>
              {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((ch) => {
                const idx = filtered.findIndex((p) => {
                  const n = (p.full_name || p.company_name || "").trim().toUpperCase();
                  // normalize diacritics
                  const base = n.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                  return base.startsWith(ch);
                });
                const disabled = idx < 0;
                return (
                  <button
                    key={ch}
                    disabled={disabled}
                    onClick={() => setPage(Math.floor(idx / pageSize) + 1)}
                    className={`w-6 h-6 text-[11px] font-semibold rounded ${
                      disabled
                        ? "text-muted-foreground/30 cursor-not-allowed"
                        : "text-amber-300 hover:bg-amber-500/15 cursor-pointer"
                    }`}
                  >
                    {ch}
                  </button>
                );
              })}
            </div>
          )}

          {/* Hromadné akce */}
          <div className="flex flex-wrap items-center gap-2 p-2 rounded-md border border-border/40 bg-card/40">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox checked={allOnPageSelected} onCheckedChange={togglePage} />
              Označit stránku
            </label>
            <Badge variant="outline" className="text-[10px]">
              Vybráno: {selected.size}
            </Badge>
            {selected.size > 0 && (
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} className="text-xs h-7">
                Zrušit výběr
              </Button>
            )}
            <div className="ml-auto flex flex-wrap gap-2">
              <Button
                size="sm" variant="outline" disabled={selected.size === 0 || bulkBusy}
                onClick={() => bulkSetStatus("active")} className="gap-1"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Schválit
              </Button>
              <Button
                size="sm" variant="outline" disabled={selected.size === 0 || bulkBusy}
                onClick={() => bulkSetStatus("pending")} className="gap-1"
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" /> Označit jako čekající
              </Button>
              <Button
                size="sm" variant="default" disabled={selected.size === 0 || bulkBusy}
                onClick={() => setBulkNotifyOpen(true)} className="gap-1"
              >
                <MailPlus className="w-3.5 h-3.5" /> Poslat notifikaci
              </Button>
            </div>
          </div>

          {listLoading ? <Loader /> : (
            <div className="space-y-2">
              {filtered.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Žádní zákazníci.</p>
              )}
              {pageItems.map((p) => renderRow(p, true))}
            </div>
          )}

          {/* Stránkování */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between flex-wrap gap-2 pt-2 border-t border-border/40">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Na stránku:</span>
                {[25, 50, 100, 200].map((n) => (
                  <Button
                    key={n} size="sm" variant={pageSize === n ? "default" : "ghost"}
                    className="h-7 px-2 text-xs" onClick={() => setPageSize(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" className="h-7 px-2"
                  disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span className="text-xs px-2 tabular-nums">
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filtered.length)} / {filtered.length}
                  <span className="text-muted-foreground"> · str. {page}/{totalPages}</span>
                </span>
                <Button size="sm" variant="outline" className="h-7 px-2"
                  disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog: hromadná notifikace */}
      <Dialog open={bulkNotifyOpen} onOpenChange={setBulkNotifyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hromadná notifikace — {selected.size} zákazníků</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input placeholder="Titulek" value={bulkTitle} onChange={(e) => setBulkTitle(e.target.value)} />
            <Textarea placeholder="Text zprávy" rows={4} value={bulkMsg} onChange={(e) => setBulkMsg(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Notifikace se zobrazí v aplikaci a (pokud je povoleno) odešle i jako push.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setBulkNotifyOpen(false)}>Zrušit</Button>
            <Button onClick={bulkNotify} disabled={!bulkTitle.trim() || bulkBusy}>
              {bulkBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Odeslat"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



function ObdPermissionsPanel({
  permissions,
  loading,
  savingKey,
  onToggle,
}: {
  permissions: CustomerObdPermissions;
  loading: boolean;
  savingKey: keyof CustomerObdPermissions | null;
  onToggle: (key: keyof CustomerObdPermissions, value: boolean) => void;
}) {
  if (loading) return <Loader />;

  return (
    <div className="space-y-3">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <Settings className="w-4 h-4 text-primary" />
                OBD oprávnění zákazníka
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Tady admin zapíná nebo vypíná konkrétní OBD funkce pro tohoto zákazníka.
                Zákazník pouze jednou odsouhlasí vzdálenou diagnostiku; jednotlivé funkce řídí servis.
              </p>
            </div>
            <Badge className={permissions.remote_obd_enabled ? "bg-success/15 text-success border-success/30" : "bg-destructive/15 text-destructive border-destructive/30"}>
              {permissions.remote_obd_enabled ? "OBD povoleno" : "OBD vypnuto"}
            </Badge>
          </div>
          {permissions.updated_at && (
            <p className="text-[10px] text-muted-foreground">
              Poslední změna: {fmt(permissions.updated_at)}
            </p>
          )}
        </CardContent>
      </Card>

      {OBD_PERMISSION_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{group.title}</CardTitle>
            <p className="text-xs text-muted-foreground">{group.description}</p>
          </CardHeader>
          <CardContent className="divide-y divide-border/20 p-0">
            {group.items.map((item) => {
              const checked = Boolean(permissions[item.key]);
              const disabled =
                item.key !== "remote_obd_enabled" && !permissions.remote_obd_enabled;

              return (
                <div key={String(item.key)} className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 pr-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-medium">{item.label}</p>
                      {item.dangerous && (
                        <Badge variant="outline" className="text-[10px] text-warning border-warning/30">
                          rizikové
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{item.description}</p>
                    {disabled && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        Neaktivní, protože hlavní vzdálená OBD diagnostika je vypnutá.
                      </p>
                    )}
                  </div>
                  <Switch
                    checked={checked}
                    disabled={disabled || savingKey === item.key}
                    onCheckedChange={(value) => onToggle(item.key, value)}
                  />
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

/* ───────── DETAIL ───────── */
function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
  const { user: adminUser } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [serviceOrders, setServiceOrders] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [faults, setFaults] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [obdSessions, setObdSessions] = useState<any[]>([]);
  const [serviceHistory, setServiceHistory] = useState<any[]>([]);
  const [permissions, setPermissions] = useState<CustomerObdPermissions>({ ...DEFAULT_OBD_PERMISSIONS, user_id: userId });
  const [permissionsLoading, setPermissionsLoading] = useState(true);
  const [permissionSavingKey, setPermissionSavingKey] = useState<keyof CustomerObdPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  // dialogs
  const [editProfile, setEditProfile] = useState(false);
  const [editDiscount, setEditDiscount] = useState("0");
  const [editStatus, setEditStatus] = useState("active");

  const [pushOpen, setPushOpen] = useState(false);
  const [pushTitle, setPushTitle] = useState("");
  const [pushMsg, setPushMsg] = useState("");

  const [bookOpen, setBookOpen] = useState(false);
  const [bookText, setBookText] = useState("");
  const [bookKm, setBookKm] = useState("");
  const [bookVehicle, setBookVehicle] = useState<string>("");

  const load = async () => {
    setLoading(true);
    const [
      profRes, vehRes, ordRes, bookRes, soRes, inqRes, faultRes, notiRes, obdRes, shRes,
    ] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("service_bookings").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("service_orders").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("vehicle_inquiries").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("fault_reports").select("*").eq("user_id", userId).order("created_at", { ascending: false }),
      supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false }).limit(50),
      supabase.from("obd_live_sessions").select("*").eq("user_id", userId).order("started_at", { ascending: false }).limit(20),
      supabase.from("service_history").select("*").eq("user_id", userId).order("service_date", { ascending: false }),
    ]);
    const p = (profRes.data as Profile) || null;
    setProfile(p);
    if (p) { setEditDiscount(String(p.discount_percent || 0)); setEditStatus(p.status); }
    setVehicles(vehRes.data || []);
    setOrders(ordRes.data || []);
    setBookings(bookRes.data || []);
    setServiceOrders(soRes.data || []);
    setInquiries(inqRes.data || []);
    setFaults(faultRes.data || []);
    setNotifications(notiRes.data || []);
    setObdSessions(obdRes.data || []);
    setServiceHistory(shRes.data || []);
    if (vehRes.data?.[0]) setBookVehicle(vehRes.data[0].id);

    setPermissionsLoading(true);
    const { data: permissionData, error: permissionError } = await (supabase as any)
      .from("customer_obd_permissions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (permissionError) {
      console.warn("customer_obd_permissions load error", permissionError);
    }

    setPermissions({
      ...DEFAULT_OBD_PERMISSIONS,
      user_id: userId,
      ...(permissionData || {}),
    });
    setPermissionsLoading(false);
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

  const updatePermission = async (key: keyof CustomerObdPermissions, value: boolean) => {
    if (key === "user_id" || key === "updated_by" || key === "updated_at") return;

    const nextPermissions: CustomerObdPermissions = {
      ...permissions,
      user_id: userId,
      [key]: value,
      updated_by: adminUser?.id || null,
      updated_at: new Date().toISOString(),
    };

    if (key === "remote_obd_enabled" && !value) {
      nextPermissions.live_data = false;
      nextPermissions.read_dtc = false;
      nextPermissions.clear_dtc = false;
      nextPermissions.gps_tracking = false;
      nextPermissions.actuator_tests = false;
      nextPermissions.adaptations = false;
      nextPermissions.reset_service = false;
      nextPermissions.dpf_regeneration = false;
      nextPermissions.epb_service = false;
      nextPermissions.sas_calibration = false;
      nextPermissions.bms_reset = false;
      nextPermissions.coding = false;
      nextPermissions.ecu_flash = false;
    }

    setPermissionSavingKey(key);
    setPermissions(nextPermissions);

    const { error } = await (supabase as any)
      .from("customer_obd_permissions")
      .upsert(nextPermissions, { onConflict: "user_id" });

    setPermissionSavingKey(null);

    if (error) {
      toast.error("Nepodařilo se uložit OBD oprávnění: " + error.message);
      load();
      return;
    }

    toast.success("OBD oprávnění uloženo");
  };

  const sendPush = async () => {
    if (!pushTitle.trim()) return;
    const { error } = await supabase.from("notifications").insert({
      user_id: userId,
      title: pushTitle,
      message: pushMsg,
    });
    if (error) return toast.error(error.message);
    toast.success("Notifikace odeslána (trigger zajistí push)");
    setPushOpen(false); setPushTitle(""); setPushMsg("");
    load();
  };

  const addServiceBookEntry = async () => {
    if (!bookText.trim() || !bookVehicle) return toast.error("Vyber vůz a popis");
    const v = vehicles.find((x) => x.id === bookVehicle);
    const { error } = await supabase.from("service_history").insert({
      user_id: userId,
      vehicle_id: bookVehicle,
      vin: v?.vin || null,
      service_date: new Date().toISOString().slice(0, 10),
      mileage: bookKm ? Number(bookKm) : null,
      description: bookText,
      source: "admin",
    } as any);
    if (error) return toast.error(error.message);
    toast.success("Zápis přidán do servisní knížky");
    setBookOpen(false); setBookText(""); setBookKm("");
    load();
  };

  const saveProfile = async () => {
    if (!profile) return;
    const { error } = await supabase.from("profiles").update({
      discount_percent: Number(editDiscount) || 0,
      status: editStatus as any,
    }).eq("id", profile.id);
    if (error) return toast.error(error.message);
    toast.success("Profil aktualizován");
    setEditProfile(false);
    load();
  };

  if (loading) return <Loader />;
  if (!profile) return (
    <div className="space-y-3">
      <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Zpět</Button>
      <p className="text-sm text-muted-foreground">Zákazník nenalezen.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={onBack}><ArrowLeft className="w-4 h-4 mr-1" />Zpět</Button>
        <Button size="sm" variant="outline" onClick={() => setPushOpen(true)}><Bell className="w-4 h-4 mr-1" />Push</Button>
        <Button size="sm" variant="outline" onClick={() => setBookOpen(true)}><BookOpen className="w-4 h-4 mr-1" />Zápis do knížky</Button>
        <Button size="sm" variant="outline" onClick={() => setEditProfile(true)}><Pencil className="w-4 h-4 mr-1" />Upravit profil</Button>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <User className="w-4 h-4 text-amber-400" />
            {profile.full_name || profile.company_name || "(bez jména)"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">{profile.email} · {profile.phone || "—"}</p>
        </CardHeader>
        <CardContent className="text-xs grid grid-cols-2 md:grid-cols-4 gap-2">
          <Stat label="Typ účtu" value={profile.account_type === "business" ? "Firma" : "Soukromá"} />
          <Stat label="Stav" value={profile.status} />
          <Stat label="Sleva" value={`${profile.discount_percent || 0} %`} />
          <Stat label="Registrace" value={fmt(profile.created_at)} />
          {profile.company_name && <Stat label="Firma" value={profile.company_name} />}
          {profile.ico && <Stat label="IČO" value={profile.ico} />}
          {profile.dic && <Stat label="DIČ" value={profile.dic} />}
        </CardContent>
      </Card>

      <Tabs defaultValue="history">
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start gap-1 h-auto p-1">
          <TabsTrigger value="history"><History className="w-3 h-3 mr-1" />Historie</TabsTrigger>
          <TabsTrigger value="vehicles"><Car className="w-3 h-3 mr-1" />Vozy ({vehicles.length})</TabsTrigger>
          <TabsTrigger value="orders"><ShoppingCart className="w-3 h-3 mr-1" />Objednávky ({orders.length})</TabsTrigger>
          <TabsTrigger value="service"><Wrench className="w-3 h-3 mr-1" />Servis ({serviceOrders.length})</TabsTrigger>
          <TabsTrigger value="bookings"><Calendar className="w-3 h-3 mr-1" />Rezervace ({bookings.length})</TabsTrigger>
          <TabsTrigger value="book"><BookOpen className="w-3 h-3 mr-1" />Knížka ({serviceHistory.length})</TabsTrigger>
          <TabsTrigger value="inquiries">Poptávky ({inquiries.length})</TabsTrigger>
          <TabsTrigger value="faults"><AlertTriangle className="w-3 h-3 mr-1" />Závady ({faults.length})</TabsTrigger>
          <TabsTrigger value="notif"><Bell className="w-3 h-3 mr-1" />Push ({notifications.length})</TabsTrigger>
          <TabsTrigger value="permissions"><Settings className="w-3 h-3 mr-1" />Oprávnění</TabsTrigger>
          <TabsTrigger value="obd"><Activity className="w-3 h-3 mr-1" />OBD ({obdSessions.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="history" className="mt-3">
          <HistoryTimeline
            profile={profile}
            vehicles={vehicles}
            orders={orders}
            bookings={bookings}
            serviceOrders={serviceOrders}
            faults={faults}
            notifications={notifications}
            obdSessions={obdSessions}
          />
        </TabsContent>


        <TabsContent value="vehicles" className="mt-3 space-y-2">
          {vehicles.length === 0 && <p className="text-xs text-muted-foreground">Žádné vozy</p>}
          {vehicles.map((v) => (
            <Card key={v.id}><CardContent className="p-3 text-xs">
              <p className="font-semibold">{v.brand} {v.model} {v.year || ""}</p>
              <p className="text-muted-foreground">VIN: {v.vin || "—"} · SPZ: {v.license_plate || "—"}</p>
              <p className="text-muted-foreground">Motor: {v.engine || "—"} · {v.current_mileage ? `${v.current_mileage.toLocaleString("cs")} km` : "—"}</p>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="orders" className="mt-3 space-y-2">
          {orders.length === 0 && <p className="text-xs text-muted-foreground">Žádné objednávky</p>}
          {orders.map((o) => (
            <Card key={o.id}><CardContent className="p-3 text-xs flex justify-between">
              <div>
                <p className="font-semibold">{o.part_name || "—"} <span className="text-muted-foreground">× {o.quantity}</span></p>
                <p className="text-muted-foreground">OEM: {o.oem_number || "—"} · {fmt(o.created_at)}</p>
              </div>
              <div className="text-right">
                <Badge variant="outline">{o.status}</Badge>
                {o.price_with_vat != null && <p className="text-sm font-semibold mt-1">{Number(o.price_with_vat).toLocaleString("cs")} Kč</p>}
              </div>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="service" className="mt-3 space-y-2">
          {serviceOrders.length === 0 && <p className="text-xs text-muted-foreground">Žádné zakázky</p>}
          {serviceOrders.map((s) => (
            <Card key={s.id}><CardContent className="p-3 text-xs flex justify-between">
              <div>
                <p className="font-semibold">{s.title || s.service_type || "Zakázka"}</p>
                <p className="text-muted-foreground">{fmt(s.created_at)}</p>
              </div>
              <Badge variant="outline">{s.status}</Badge>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="bookings" className="mt-3 space-y-2">
          {bookings.length === 0 && <p className="text-xs text-muted-foreground">Žádné rezervace</p>}
          {bookings.map((b) => (
            <Card key={b.id}><CardContent className="p-3 text-xs flex justify-between">
              <div>
                <p className="font-semibold">{b.service_type}</p>
                <p className="text-muted-foreground">{b.vehicle_brand} {b.vehicle_model} · {fmt(b.preferred_date)}</p>
              </div>
              <Badge variant="outline">{b.status}</Badge>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="book" className="mt-3 space-y-2">
          {serviceHistory.length === 0 && <p className="text-xs text-muted-foreground">Servisní knížka prázdná</p>}
          {serviceHistory.map((h) => (
            <Card key={h.id}><CardContent className="p-3 text-xs">
              <p className="font-semibold">{h.service_date} · {h.mileage ? `${h.mileage.toLocaleString("cs")} km` : "—"}</p>
              <p className="text-muted-foreground">{h.description}</p>
              {h.source && <Badge variant="outline" className="mt-1 text-[10px]">{h.source}</Badge>}
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="inquiries" className="mt-3 space-y-2">
          {inquiries.length === 0 && <p className="text-xs text-muted-foreground">Žádné poptávky</p>}
          {inquiries.map((i) => (
            <Card key={i.id}><CardContent className="p-3 text-xs">
              <p className="font-semibold">{i.name || "—"}</p>
              <p className="text-muted-foreground">{i.message || "—"}</p>
              <p className="text-muted-foreground">{fmt(i.created_at)}</p>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="faults" className="mt-3 space-y-2">
          {faults.length === 0 && <p className="text-xs text-muted-foreground">Žádná hlášení závad</p>}
          {faults.map((f) => (
            <Card key={f.id}><CardContent className="p-3 text-xs flex justify-between">
              <div>
                <p className="font-semibold">{f.vehicle_brand} {f.vehicle_model}</p>
                <p className="text-muted-foreground">{f.description}</p>
                <p className="text-muted-foreground">{fmt(f.created_at)}</p>
              </div>
              <Badge variant="outline">{f.status}</Badge>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="notif" className="mt-3 space-y-2">
          {notifications.length === 0 && <p className="text-xs text-muted-foreground">Žádné notifikace</p>}
          {notifications.map((n) => (
            <Card key={n.id}><CardContent className="p-3 text-xs">
              <p className="font-semibold">{n.title}</p>
              <p className="text-muted-foreground">{n.message}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{fmt(n.created_at)}</p>
            </CardContent></Card>
          ))}
        </TabsContent>

        <TabsContent value="permissions" className="mt-3">
          <ObdPermissionsPanel
            permissions={permissions}
            loading={permissionsLoading}
            savingKey={permissionSavingKey}
            onToggle={updatePermission}
          />
        </TabsContent>

        <TabsContent value="obd" className="mt-3 space-y-2">
          {obdSessions.length === 0 && <p className="text-xs text-muted-foreground">Žádné OBD relace</p>}
          {obdSessions.map((o) => (
            <Card key={o.id}><CardContent className="p-3 text-xs">
              <p className="font-semibold">{o.vehicle_brand || "—"} {o.vehicle_model || ""}</p>
              <p className="text-muted-foreground">Start: {fmt(o.started_at)} · {o.status}</p>
            </CardContent></Card>
          ))}
        </TabsContent>
      </Tabs>

      {/* Edit profile dialog */}
      <Dialog open={editProfile} onOpenChange={setEditProfile}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit profil</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs">Sleva (%)</label>
              <Input type="number" value={editDiscount} onChange={(e) => setEditDiscount(e.target.value)} />
            </div>
            <div>
              <label className="text-xs">Stav</label>
              <select className="w-full bg-background border rounded p-2 text-sm"
                value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                <option value="active">active</option>
                <option value="pending">pending</option>
                <option value="rejected">rejected</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(false)}>Zrušit</Button>
            <Button onClick={saveProfile}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push dialog */}
      <Dialog open={pushOpen} onOpenChange={setPushOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Poslat push notifikaci</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Input placeholder="Titulek" value={pushTitle} onChange={(e) => setPushTitle(e.target.value)} />
            <Textarea placeholder="Zpráva" value={pushMsg} onChange={(e) => setPushMsg(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Notifikace se uloží do schránky a databázový trigger ji odešle jako push.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPushOpen(false)}>Zrušit</Button>
            <Button onClick={sendPush}><Send className="w-4 h-4 mr-1" />Odeslat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Service-book dialog */}
      <Dialog open={bookOpen} onOpenChange={setBookOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Zápis do servisní knížky</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs">Vůz</label>
              <select className="w-full bg-background border rounded p-2 text-sm"
                value={bookVehicle} onChange={(e) => setBookVehicle(e.target.value)}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.brand} {v.model} {v.license_plate ? `(${v.license_plate})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <Input type="number" placeholder="Stav km (volitelné)" value={bookKm} onChange={(e) => setBookKm(e.target.value)} />
            <Textarea placeholder="Popis úkonu" value={bookText} onChange={(e) => setBookText(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBookOpen(false)}>Zrušit</Button>
            <Button onClick={addServiceBookEntry}>Přidat zápis</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const Stat = ({ label, value }: { label: string; value: any }) => (
  <div>
    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className="text-foreground">{value}</p>
  </div>
);

/* ───────── HISTORY TIMELINE ───────── */
type TimelineEvent = {
  id: string;
  date: string;
  kind: "register" | "vehicle" | "order" | "service" | "booking" | "fault" | "obd" | "notification";
  title: string;
  description: string;
  link?: string;
  badge?: string;
};

function HistoryTimeline({
  profile, vehicles, orders, bookings, serviceOrders, faults, notifications, obdSessions,
}: {
  profile: Profile;
  vehicles: any[]; orders: any[]; bookings: any[]; serviceOrders: any[];
  faults: any[]; notifications: any[]; obdSessions: any[];
}) {
  const navigate = useNavigate();
  const events: TimelineEvent[] = [];

  // Registrace
  if (profile.created_at) {
    events.push({
      id: `reg-${profile.id}`,
      date: profile.created_at,
      kind: "register",
      title: "Registrace",
      description: `Vytvořen účet (${profile.account_type === "business" ? "firma" : "soukromá osoba"})`,
    });
  }
  // Vozidla
  vehicles.forEach((v) => {
    if (!v.created_at) return;
    events.push({
      id: `veh-${v.id}`,
      date: v.created_at,
      kind: "vehicle",
      title: "Přidáno vozidlo",
      description: `${v.brand || ""} ${v.model || ""} ${v.year || ""}${v.engine ? " · " + v.engine : ""}`.trim(),
    });
  });
  // Objednávky
  orders.forEach((o) => {
    if (!o.created_at) return;
    const price = o.price_with_vat != null ? ` · ${Number(o.price_with_vat).toLocaleString("cs")} Kč` : "";
    events.push({
      id: `ord-${o.id}`,
      date: o.created_at,
      kind: "order",
      title: `Objednávka #${String(o.id).slice(0, 8)}`,
      description: `${o.part_name || o.oem_number || "—"} × ${o.quantity || 1}${price}`,
      badge: o.status,
      link: `/admin?tab=orders&id=${o.id}`,
    });
  });
  // Servisní zakázky
  serviceOrders.forEach((s) => {
    if (!s.created_at) return;
    events.push({
      id: `so-${s.id}`,
      date: s.created_at,
      kind: "service",
      title: "Servisní zakázka",
      description: s.title || s.service_type || "Zakázka",
      badge: s.status,
    });
  });
  // Rezervace
  bookings.forEach((b) => {
    if (!b.created_at) return;
    events.push({
      id: `bk-${b.id}`,
      date: b.created_at,
      kind: "booking",
      title: "Rezervace servisu",
      description: `${b.service_type || "—"}${b.preferred_date ? " · " + b.preferred_date : ""}`,
      badge: b.status,
    });
  });
  // Závady
  faults.forEach((f) => {
    if (!f.created_at) return;
    events.push({
      id: `flt-${f.id}`,
      date: f.created_at,
      kind: "fault",
      title: "Hlášení závady",
      description: `${f.vehicle_brand || ""} ${f.vehicle_model || ""} · ${String(f.description || "").slice(0, 80)}`,
      badge: f.status,
    });
  });
  // OBD
  obdSessions.forEach((o) => {
    if (!o.started_at) return;
    events.push({
      id: `obd-${o.id}`,
      date: o.started_at,
      kind: "obd",
      title: "OBD diagnostika",
      description: `${o.vehicle_brand || "—"} ${o.vehicle_model || ""} · ${o.status || ""}`,
    });
  });
  // Notifikace
  notifications.forEach((n) => {
    if (!n.created_at) return;
    events.push({
      id: `not-${n.id}`,
      date: n.created_at,
      kind: "notification",
      title: n.title || "Notifikace",
      description: String(n.message || "").slice(0, 100),
    });
  });

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const iconFor = (k: TimelineEvent["kind"]) => {
    switch (k) {
      case "register": return <UserPlus className="w-3.5 h-3.5" />;
      case "vehicle": return <Car className="w-3.5 h-3.5" />;
      case "order": return <ShoppingCart className="w-3.5 h-3.5" />;
      case "service": return <Wrench className="w-3.5 h-3.5" />;
      case "booking": return <Calendar className="w-3.5 h-3.5" />;
      case "fault": return <AlertTriangle className="w-3.5 h-3.5" />;
      case "obd": return <Activity className="w-3.5 h-3.5" />;
      case "notification": return <Bell className="w-3.5 h-3.5" />;
    }
  };
  const colorFor = (k: TimelineEvent["kind"]) => ({
    register: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    vehicle: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    order: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    service: "bg-purple-500/15 text-purple-300 border-purple-500/30",
    booking: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30",
    fault: "bg-red-500/15 text-red-300 border-red-500/30",
    obd: "bg-orange-500/15 text-orange-300 border-orange-500/30",
    notification: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  }[k]);

  if (events.length === 0) {
    return <p className="text-xs text-muted-foreground">Žádné události.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">{events.length} událostí celkem · řazeno od nejnovějších</p>
      {events.map((e) => (
        <Card
          key={e.id}
          className={e.link ? "cursor-pointer hover:border-primary/40" : ""}
          onClick={() => e.link && navigate(e.link)}
        >
          <CardContent className="p-3 text-xs flex items-start gap-3">
            <Badge variant="outline" className={`${colorFor(e.kind)} shrink-0 mt-0.5`}>
              {iconFor(e.kind)}
            </Badge>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="font-semibold">{e.title}</p>
                <span className="text-[10px] text-muted-foreground">{fmt(e.date)}</span>
              </div>
              <p className="text-muted-foreground mt-0.5 break-words">{e.description}</p>
              {e.badge && <Badge variant="outline" className="mt-1 text-[10px]">{e.badge}</Badge>}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}



/* ───────── ROOT ───────── */
const AdminUser360 = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const { userId } = useParams();
  const [activeUserId, setActiveUserId] = useState<string | null>(userId || null);

  useEffect(() => { setActiveUserId(userId || null); }, [userId]);

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) navigate("/auth");
  }, [isLoading, user, isAdmin, navigate]);

  if (isLoading || !isAdmin) return <Loader />;

  return (
    <div className="max-w-5xl mx-auto p-3 space-y-3">
      <h1 className="text-xl font-display font-semibold flex items-center gap-2">
        <User className="w-5 h-5 text-amber-400" /> Zákazník 360°
      </h1>
      {activeUserId ? (
        <UserDetail userId={activeUserId} onBack={() => { setActiveUserId(null); navigate("/admin/users"); }} />
      ) : (
        <SearchView onPick={(id) => { setActiveUserId(id); navigate(`/admin/users/${id}`); }} />
      )}
    </div>
  );
};

export default AdminUser360;
