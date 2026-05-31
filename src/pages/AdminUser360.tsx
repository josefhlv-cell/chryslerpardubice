/**
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Search, User, Car, ShoppingCart, Wrench, Calendar, AlertTriangle,
  Bell, Activity, ArrowLeft, BookOpen, Loader2, Send, Pencil, History, UserPlus,
} from "lucide-react";

type Profile = {
  id: string; user_id: string;
  full_name: string | null; email: string | null; phone: string | null;
  company_name: string | null; ico: string | null; dic: string | null;
  account_type: string; status: string; discount_percent: number;
  created_at: string;
};

const fmt = (d?: string | null) =>
  !d ? "—" : new Date(d).toLocaleString("cs-CZ", { dateStyle: "short", timeStyle: "short" });

const Loader = () => (
  <div className="flex items-center justify-center p-6">
    <Loader2 className="w-5 h-5 animate-spin text-primary" />
  </div>
);

/* ───────── SEARCH ───────── */
function SearchView({ onPick }: { onPick: (userId: string) => void }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    const term = q.trim();
    if (!term) return;
    setLoading(true);
    try {
      // 1) přímý fulltext na profiles
      const pat = `%${term}%`;
      const profQ = supabase
        .from("profiles")
        .select("*")
        .or(
          `full_name.ilike.${pat},email.ilike.${pat},phone.ilike.${pat},company_name.ilike.${pat},ico.ilike.${pat}`,
        )
        .limit(40);

      // 2) hledání podle VIN / SPZ v user_vehicles
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
        const { data } = await supabase
          .from("profiles")
          .select("*")
          .in("user_id", extraIds);
        extra = (data as Profile[]) || [];
      }
      setResults([...((profs as Profile[]) || []), ...extra]);
    } catch (e: any) {
      toast.error("Hledání selhalo: " + (e?.message || "neznámá chyba"));
    } finally {
      setLoading(false);
    }
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
          {results.map((p) => (
            <Card
              key={p.id}
              className="cursor-pointer hover:border-primary/40"
              onClick={() => onPick(p.user_id)}
            >
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold">
                    {p.full_name || p.company_name || "(bez jména)"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {p.email || "—"} · {p.phone || "—"}
                  </p>
                  {p.company_name && (
                    <p className="text-[11px] text-muted-foreground">
                      Firma: {p.company_name} · IČO {p.ico || "—"}
                    </p>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1">
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
          ))}
        </div>
      )}
    </div>
  );
}

/* ───────── DETAIL ───────── */
function UserDetail({ userId, onBack }: { userId: string; onBack: () => void }) {
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
    setLoading(false);
  };

  useEffect(() => { load(); }, [userId]);

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
