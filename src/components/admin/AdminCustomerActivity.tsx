/**
 * AdminCustomerActivity — sjednocená časová osa všech zákaznických událostí.
 * Agreguje: objednávky, rezervace, poptávky vozů, hlášení závad,
 * výkup/dovoz, žádosti o náhradní díly. Seřazeno podle času, s proklikem.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Activity, ShoppingCart, Wrench, Car, AlertTriangle, ArrowDownUp,
  Package, Loader2, ExternalLink, RefreshCw, User,
} from "lucide-react";

type EventKind =
  | "order" | "booking" | "inquiry" | "fault"
  | "buyback" | "import" | "used_request" | "user";

type Evt = {
  id: string;
  kind: EventKind;
  created_at: string;
  user_id: string | null;
  title: string;
  detail: string;
  status?: string | null;
  link: string;        // /admin?tab=...&id=...
  detailLink?: string; // /admin/users/:uid
};

const KIND_META: Record<EventKind, { label: string; icon: any; color: string }> = {
  order:        { label: "Objednávka",       icon: ShoppingCart,  color: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  booking:      { label: "Servisní rezervace", icon: Wrench,      color: "bg-blue-500/15 text-blue-300 border-blue-500/30" },
  inquiry:      { label: "Poptávka vozu",    icon: Car,           color: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  fault:        { label: "Hlášení závady",   icon: AlertTriangle, color: "bg-red-500/15 text-red-300 border-red-500/30" },
  buyback:      { label: "Výkup vozu",       icon: ArrowDownUp,   color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  import:       { label: "Dovoz vozu",       icon: ArrowDownUp,   color: "bg-purple-500/15 text-purple-300 border-purple-500/30" },
  used_request: { label: "Žádost o náhradní díl", icon: Package,  color: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30" },
  user:         { label: "Nová registrace",  icon: User,          color: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
};

const fmt = (d: string) => new Date(d).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });

const PAGE_SIZE = 50;

const AdminCustomerActivity = () => {
  const navigate = useNavigate();
  const [events, setEvents] = useState<Evt[]>([]);
  const [profiles, setProfiles] = useState<Record<string, { name: string; email: string | null; phone: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | EventKind>("all");
  const [period, setPeriod] = useState<"today" | "week" | "month" | "all">("week");
  const [search, setSearch] = useState("");
  const [shown, setShown] = useState(PAGE_SIZE);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const from = (() => {
        const now = new Date();
        if (period === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        if (period === "week")  return new Date(now.getTime() - 7  * 86400000).toISOString();
        if (period === "month") return new Date(now.getTime() - 30 * 86400000).toISOString();
        return new Date(now.getTime() - 365 * 86400000).toISOString();
      })();

      const LIMIT = 500;
      const q = (t: string, sel: string) =>
        supabase.from(t as any).select(sel).gte("created_at", from).order("created_at", { ascending: false }).limit(LIMIT);

      const [
        ordersR, bookingsR, inquiriesR, faultsR,
        buybacksR, importsR, usedReqR, usersR,
      ] = await Promise.all([
        q("orders", "id,user_id,part_name,oem_number,quantity,price_with_vat,status,catalog_source,created_at"),
        q("service_bookings", "id,user_id,vehicle_brand,vehicle_model,service_type,preferred_date,status,created_at"),
        q("vehicle_inquiries", "id,user_id,vehicle_id,name,email,phone,message,status,created_at"),
        q("fault_reports", "id,user_id,vehicle_brand,vehicle_model,description,status,created_at"),
        q("vehicle_buyback_requests", "id,user_id,brand,model,year,name,phone,email,created_at"),
        q("vehicle_import_requests", "id,user_id,brand,model,name,phone,email,created_at"),
        q("used_part_requests", "id,user_id,brand,model,part_name,status,created_at"),
        q("profiles", "user_id,full_name,email,phone,company_name,account_type,created_at"),
      ]);

      const evts: Evt[] = [];

      (ordersR.data || []).forEach((o: any) => evts.push({
        id: `order-${o.id}`, kind: "order", created_at: o.created_at, user_id: o.user_id,
        title: `${o.quantity || 1}× ${o.part_name || o.oem_number || "díl"}`,
        detail: `${o.oem_number || "—"} · ${o.price_with_vat ? Math.round(o.price_with_vat) + " Kč" : "—"} · ${o.catalog_source || "—"}`,
        status: o.status, link: `/admin#orders-list?id=${o.id}`,
      }));

      (bookingsR.data || []).forEach((b: any) => evts.push({
        id: `booking-${b.id}`, kind: "booking", created_at: b.created_at, user_id: b.user_id,
        title: `${b.vehicle_brand || ""} ${b.vehicle_model || ""} · ${b.service_type}`.trim(),
        detail: `Preferováno: ${b.preferred_date ? new Date(b.preferred_date).toLocaleDateString("cs-CZ") : "—"}`,
        status: b.status, link: `/admin#service-bookings?id=${b.id}`,
      }));

      (inquiriesR.data || []).forEach((i: any) => evts.push({
        id: `inquiry-${i.id}`, kind: "inquiry", created_at: i.created_at, user_id: i.user_id,
        title: `Poptávka ${i.name || i.email || "anonymní"}`,
        detail: `${i.message ? i.message.slice(0, 100) : "—"} · ${i.phone || i.email || "—"}`,
        status: i.status, link: `/admin#vehicles-inquiries?id=${i.id}`,
      }));

      (faultsR.data || []).forEach((f: any) => evts.push({
        id: `fault-${f.id}`, kind: "fault", created_at: f.created_at, user_id: f.user_id,
        title: `${f.vehicle_brand || ""} ${f.vehicle_model || ""}`.trim() || "Závada",
        detail: (f.description || "").slice(0, 140),
        status: f.status, link: `/admin#vehicles-faults?id=${f.id}`,
      }));

      (buybacksR.data || []).forEach((b: any) => evts.push({
        id: `buyback-${b.id}`, kind: "buyback", created_at: b.created_at, user_id: b.user_id,
        title: `${b.brand || ""} ${b.model || ""} (${b.year || "—"})`,
        detail: `${b.name || "—"} · ${b.phone || b.email || "—"}`,
        link: `/admin#vehicles-offers?id=${b.id}`,
      }));

      (importsR.data || []).forEach((b: any) => evts.push({
        id: `import-${b.id}`, kind: "import", created_at: b.created_at, user_id: b.user_id,
        title: `${b.brand || ""} ${b.model || ""}`,
        detail: `${b.name || "—"} · ${b.phone || b.email || "—"}`,
        link: `/admin#vehicles-offers?id=${b.id}`,
      }));

      (usedReqR.data || []).forEach((u: any) => evts.push({
        id: `used-${u.id}`, kind: "used_request", created_at: u.created_at, user_id: u.user_id,
        title: u.part_name || "Náhradní díl",
        detail: `${u.brand || ""} ${u.model || ""}`.trim() || "—",
        status: u.status, link: `/admin#orders-list?id=${u.id}`,
      }));

      // profile map + user-registration events
      const pmap: Record<string, { name: string; email: string | null; phone: string | null }> = {};
      (usersR.data || []).forEach((p: any) => {
        pmap[p.user_id] = {
          name: p.full_name || p.company_name || "(bez jména)",
          email: p.email, phone: p.phone,
        };
        evts.push({
          id: `user-${p.user_id}`, kind: "user", created_at: p.created_at, user_id: p.user_id,
          title: p.full_name || p.company_name || "Nový účet",
          detail: `${p.email || "—"} · ${p.account_type || "private"}`,
          link: `/admin/users/${p.user_id}`,
        });
      });

      // doplň profily pro user_id, které nebyly v poslední dávce
      const missing = Array.from(new Set(
        evts.map((e) => e.user_id).filter((u): u is string => !!u && !pmap[u]),
      ));
      if (missing.length) {
        for (let i = 0; i < missing.length; i += 500) {
          const batch = missing.slice(i, i + 500);
          const { data } = await supabase
            .from("profiles").select("user_id,full_name,email,phone,company_name")
            .in("user_id", batch);
          (data || []).forEach((p: any) => {
            pmap[p.user_id] = {
              name: p.full_name || p.company_name || "(bez jména)",
              email: p.email, phone: p.phone,
            };
          });
        }
      }

      evts.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setProfiles(pmap);
      setEvents(evts);
      setShown(PAGE_SIZE);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); /* eslint-disable-next-line */ }, [period]);

  // realtime — nově příchozí
  useEffect(() => {
    const ch = supabase.channel("admin-customer-activity")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "orders" }, () => fetchAll())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "service_bookings" }, () => fetchAll())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "vehicle_inquiries" }, () => fetchAll())
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "fault_reports" }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line
  }, []);

  const filtered = useMemo(() => {
    let arr = events;
    if (filter !== "all") arr = arr.filter((e) => e.kind === filter);
    const term = search.trim().toLowerCase();
    if (term) {
      arr = arr.filter((e) => {
        const p = e.user_id ? profiles[e.user_id] : null;
        return (
          e.title.toLowerCase().includes(term) ||
          e.detail.toLowerCase().includes(term) ||
          (p?.name || "").toLowerCase().includes(term) ||
          (p?.email || "").toLowerCase().includes(term) ||
          (p?.phone || "").toLowerCase().includes(term)
        );
      });
    }
    return arr;
  }, [events, filter, search, profiles]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: events.length };
    events.forEach((e) => { c[e.kind] = (c[e.kind] || 0) + 1; });
    return c;
  }, [events]);

  const goEvent = (e: Evt) => navigate(e.link);
  const goUser  = (uid: string | null) => uid && navigate(`/admin/users/${uid}`);

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center justify-between gap-2 flex-wrap">
            <span className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" />
              Aktivita zákazníků
              <Badge variant="outline" className="text-[10px]">{filtered.length}</Badge>
            </span>
            <Button size="sm" variant="outline" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${loading ? "animate-spin" : ""}`} /> Obnovit
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Hledat (zákazník, e-mail, díl, VIN, popis…)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <div className="flex flex-wrap gap-1">
            {(["today", "week", "month", "all"] as const).map((p) => (
              <Button key={p} size="sm" variant={period === p ? "default" : "ghost"}
                className="h-7 px-2 text-xs" onClick={() => setPeriod(p)}>
                {p === "today" ? "Dnes" : p === "week" ? "Týden" : p === "month" ? "Měsíc" : "Rok"}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant={filter === "all" ? "default" : "outline"} className="h-7 px-2 text-xs"
              onClick={() => setFilter("all")}>
              Vše <Badge variant="secondary" className="ml-1 text-[10px]">{counts.all || 0}</Badge>
            </Button>
            {(Object.keys(KIND_META) as EventKind[]).map((k) => {
              const M = KIND_META[k];
              const Icon = M.icon;
              return (
                <Button key={k} size="sm" variant={filter === k ? "default" : "outline"}
                  className="h-7 px-2 text-xs gap-1" onClick={() => setFilter(k)}>
                  <Icon className="w-3 h-3" /> {M.label}
                  <Badge variant="secondary" className="ml-1 text-[10px]">{counts[k] || 0}</Badge>
                </Button>
              );
            })}
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Žádné události v daném období.</p>
          ) : (
            <div className="space-y-2">
              {filtered.slice(0, shown).map((e) => {
                const M = KIND_META[e.kind];
                const Icon = M.icon;
                const p = e.user_id ? profiles[e.user_id] : null;
                return (
                  <Card key={e.id} className="hover:border-primary/40">
                    <CardContent className="p-3">
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-md border flex items-center justify-center shrink-0 ${M.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline" className="text-[10px]">{M.label}</Badge>
                            {e.status && <Badge variant="secondary" className="text-[10px]">{e.status}</Badge>}
                            <span className="text-[11px] text-muted-foreground">{fmt(e.created_at)}</span>
                          </div>
                          <p className="text-sm font-semibold truncate mt-0.5">{e.title}</p>
                          <p className="text-xs text-muted-foreground truncate">{e.detail}</p>
                          {p && (
                            <button
                              className="text-[11px] text-amber-300 hover:underline truncate text-left mt-1"
                              onClick={() => goUser(e.user_id)}
                            >
                              👤 {p.name} · {p.email || p.phone || "—"}
                            </button>
                          )}
                        </div>
                        <div className="flex flex-col gap-1 shrink-0">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] gap-1"
                            onClick={() => goEvent(e)}>
                            <ExternalLink className="w-3 h-3" /> Detail
                          </Button>
                          {e.user_id && (
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px] gap-1"
                              onClick={() => goUser(e.user_id)}>
                              <User className="w-3 h-3" /> 360°
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {shown < filtered.length && (
                <div className="flex justify-center pt-2">
                  <Button size="sm" variant="outline" onClick={() => setShown((n) => n + PAGE_SIZE)}>
                    Načíst další ({filtered.length - shown})
                  </Button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCustomerActivity;
