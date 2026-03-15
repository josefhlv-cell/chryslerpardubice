import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { ShoppingCart, Wrench, Car, Package, RefreshCw, Shield, FileSpreadsheet, Users, CheckCircle, XCircle, Bell, History, AlertTriangle, DollarSign, ArrowDownUp, LayoutGrid, Settings2, ClipboardList, BarChart3, UserCog, Calendar, BookOpen, Clock } from "lucide-react";
import { sourceLabel } from "@/api/partsAPI";
import CatalogImport from "@/components/admin/CatalogImport";
import EPCImport from "@/components/admin/EPCImport";
import AdminNotifications from "@/components/admin/AdminNotifications";
import AdminServiceHistory from "@/components/admin/AdminServiceHistory";
import AdminCatalogSettings from "@/components/admin/AdminCatalogSettings";
import AdminFaultReports from "@/components/admin/AdminFaultReports";
import AdminPriceManagement from "@/components/admin/AdminPriceManagement";
import AdminServicePlans from "@/components/admin/AdminServicePlans";
import AdminVehicleOffers from "@/components/admin/AdminVehicleOffers";
import AICatalogImport from "@/components/admin/AICatalogImport";
import AdminEPCDiagrams from "@/components/admin/AdminEPCDiagrams";
import AdminBulkPriceSync from "@/components/admin/AdminBulkPriceSync";
import AdminPriceSyncStats from "@/components/admin/AdminPriceSyncStats";
import AdminFeatureSettings from "@/components/admin/AdminFeatureSettings";
import AdminServiceOrders from "@/components/admin/AdminServiceOrders";
import AdminMechanics from "@/components/admin/AdminMechanics";
import AdminServiceStatistics from "@/components/admin/AdminServiceStatistics";
import AdminServiceScheduler from "@/components/admin/AdminServiceScheduler";
import AdminEmployees from "@/components/admin/AdminEmployees";
import AdminServiceProcedures from "@/components/admin/AdminServiceProcedures";
import AdminNotificationToggle from "@/components/admin/AdminNotificationToggle";
import AdminActivityLog from "@/components/admin/AdminActivityLog";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

// ---- Types ----

type Profile = {
  id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  company_name: string | null;
  ico: string | null;
  dic: string | null;
  account_type: string;
  status: string;
  discount_percent: number;
  created_at: string;
};

type OrderRow = {
  id: string;
  user_id: string;
  part_id: string | null;
  part_name: string | null;
  oem_number: string | null;
  order_type: string;
  quantity: number;
  unit_price: number | null;
  discount_percent: number | null;
  discounted_price: number | null;
  price_with_vat: number | null;
  status: string;
  admin_note: string | null;
  customer_note: string | null;
  catalog_source: string | null;
  created_at: string;
};

type Booking = {
  id: string;
  vehicle_brand: string | null;
  vehicle_model: string | null;
  service_type: string;
  preferred_date: string;
  confirmed_date: string | null;
  note: string | null;
  wants_replacement_vehicle: boolean;
  replacement_vehicle_confirmed: boolean | null;
  status: string;
  admin_note: string | null;
  estimated_price: number | null;
  discount_amount: number | null;
  final_price: number | null;
  user_id: string;
  created_at: string;
};

type Inquiry = {
  id: string;
  vehicle_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  message: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
};

const statusColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30",
  confirmed: "bg-primary/15 text-primary border-primary/30",
  in_progress: "bg-purple-500/15 text-purple-400 border-purple-500/30",
  completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
  shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-success/15 text-success border-success/30",
  quoted: "bg-primary/15 text-primary border-primary/30",
  accepted: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
  fulfilled: "bg-success/15 text-success border-success/30",
  new: "bg-warning/15 text-warning border-warning/30",
  nova: "bg-warning/15 text-warning border-warning/30",
  zpracovava_se: "bg-primary/15 text-primary border-primary/30",
  vyrizena: "bg-success/15 text-success border-success/30",
  zrusena: "bg-destructive/15 text-destructive border-destructive/30",
  active: "bg-success/15 text-success border-success/30",
};

const statusLabel: Record<string, string> = {
  pending: "Čeká",
  confirmed: "Potvrzeno",
  in_progress: "Probíhá",
  completed: "Dokončeno",
  cancelled: "Zrušeno",
  shipped: "Odesláno",
  delivered: "Doručeno",
  quoted: "Naceneno",
  accepted: "Přijato",
  rejected: "Odmítnuto",
  fulfilled: "Splněno",
  new: "Nový",
  nova: "Nová",
  zpracovava_se: "Zpracovává se",
  vyrizena: "Vyřízena",
  zrusena: "Zrušena",
  active: "Aktivní",
};

const Admin = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const { isEnabled } = useFeatureFlags();

  // Data
  const [pendingProfiles, setPendingProfiles] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [orderTypeFilter, setOrderTypeFilter] = useState<"all" | "new" | "used">("all");

  // Edit dialogs
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);

  // Form state
  const [formNote, setFormNote] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [formDiscount, setFormDiscount] = useState("");
  const [formConfirmedDate, setFormConfirmedDate] = useState("");
  const [formEstimatedPrice, setFormEstimatedPrice] = useState("");
  const [formFinalPrice, setFormFinalPrice] = useState("");
  const [formReplacementConfirmed, setFormReplacementConfirmed] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) {
      navigate("/auth");
    }
  }, [isLoading, user, isAdmin, navigate]);

  const fetchAll = async () => {
    setLoading(true);
    const [profilesRes, ordersRes, bookingsRes, inquiriesRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("account_type", "business").order("created_at", { ascending: false }),
      supabase.from("orders").select("*").order("created_at", { ascending: false }),
      supabase.from("service_bookings").select("*").order("created_at", { ascending: false }),
      supabase.from("vehicle_inquiries").select("*").order("created_at", { ascending: false }),
    ]);
    setPendingProfiles((profilesRes.data as Profile[]) || []);
    setOrders((ordersRes.data as OrderRow[]) || []);
    setBookings((bookingsRes.data as Booking[]) || []);
    setInquiries((inquiriesRes.data as Inquiry[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) fetchAll();
  }, [isAdmin]);

  // ---- Profile approval ----
  const approveProfile = async (profileId: string, discount: number) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "active", discount_percent: discount })
      .eq("id", profileId);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Firma schválena" });
    setEditProfile(null);
    fetchAll();
  };

  const rejectProfile = async (profileId: string) => {
    const { error } = await supabase
      .from("profiles")
      .update({ status: "rejected" })
      .eq("id", profileId);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Firma zamítnuta" });
    setEditProfile(null);
    fetchAll();
  };

  const openProfileEdit = (p: Profile) => {
    setEditProfile(p);
    setFormDiscount(p.discount_percent.toString());
  };

  // ---- Order edit ----
  const openOrderEdit = (o: OrderRow) => {
    setEditOrder(o);
    setFormStatus(o.status);
    setFormNote(o.admin_note || "");
  };

  const saveOrder = async () => {
    if (!editOrder) return;
    const { error } = await supabase
      .from("orders")
      .update({ status: formStatus as any, admin_note: formNote })
      .eq("id", editOrder.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditOrder(null);
    fetchAll();
  };

  // ---- Booking edit ----
  const openBookingEdit = (b: Booking) => {
    setEditBooking(b);
    setFormStatus(b.status);
    setFormNote(b.admin_note || "");
    setFormConfirmedDate(b.confirmed_date || "");
    setFormEstimatedPrice(b.estimated_price?.toString() || "");
    setFormFinalPrice(b.final_price?.toString() || "");
    setFormReplacementConfirmed(b.replacement_vehicle_confirmed === null ? "" : b.replacement_vehicle_confirmed ? "yes" : "no");
  };

  const saveBooking = async () => {
    if (!editBooking) return;
    const { error } = await supabase
      .from("service_bookings")
      .update({
        status: formStatus as any,
        admin_note: formNote,
        confirmed_date: formConfirmedDate || null,
        estimated_price: formEstimatedPrice ? parseFloat(formEstimatedPrice) : null,
        final_price: formFinalPrice ? parseFloat(formFinalPrice) : null,
        replacement_vehicle_confirmed: formReplacementConfirmed === "" ? null : formReplacementConfirmed === "yes",
      })
      .eq("id", editBooking.id);
    if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Uloženo" });
    setEditBooking(null);
    fetchAll();
  };

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) return null;

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("cs-CZ");

  const pendingOnly = pendingProfiles.filter(p => p.status === "pending");
  const allBusiness = pendingProfiles;

  const filteredOrders = orderTypeFilter === "all"
    ? orders
    : orders.filter(o => o.order_type === orderTypeFilter);

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Admin panel" subtitle="Správa systému" />
      <div className="p-4 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg gradient-bronze flex items-center justify-center">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <span className="text-sm font-display font-semibold">Řídící centrum</span>
            <p className="text-[10px] text-muted-foreground">Firmy · Objednávky · Servis · Katalog</p>
          </div>
          <Button size="sm" variant="outline" className="border-border/30 h-8" onClick={fetchAll}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Obnovit
          </Button>
        </div>

        <Tabs defaultValue="firms">
          <TabsList className="w-full flex overflow-x-auto scrollbar-hide bg-secondary/40 border border-border/20 p-0.5">
            <TabsTrigger value="firms" className="text-[11px] gap-1 shrink-0">
              <Users className="w-3 h-3" />
              Firmy
              {pendingOnly.length > 0 && (
                <span className="ml-1 w-4 h-4 rounded-full bg-destructive text-destructive-foreground text-[9px] flex items-center justify-center font-bold">
                  {pendingOnly.length}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="orders" className="text-[11px] gap-1 shrink-0"><ShoppingCart className="w-3 h-3" />Obj.</TabsTrigger>
            {isEnabled("bookings") && <TabsTrigger value="service" className="text-[11px] gap-1 shrink-0"><Wrench className="w-3 h-3" />Servis</TabsTrigger>}
            {isEnabled("vehicle_offers") && <TabsTrigger value="inquiries" className="text-[11px] gap-1 shrink-0"><Car className="w-3 h-3" />Vozy</TabsTrigger>}
            {isEnabled("catalog") && <TabsTrigger value="catalog" className="text-[11px] gap-1 shrink-0"><FileSpreadsheet className="w-3 h-3" />Ceník</TabsTrigger>}
            {isEnabled("catalog") && <TabsTrigger value="settings" className="text-[11px] gap-1 shrink-0"><Shield className="w-3 h-3" />Katalogy</TabsTrigger>}
            {isEnabled("service_history") && <TabsTrigger value="history" className="text-[11px] gap-1 shrink-0"><History className="w-3 h-3" />Knížka</TabsTrigger>}
            {isEnabled("notifications") && <TabsTrigger value="notifications" className="text-[11px] gap-1 shrink-0"><Bell className="w-3 h-3" />Zprávy</TabsTrigger>}
            {isEnabled("fault_reports") && <TabsTrigger value="faults" className="text-[11px] gap-1 shrink-0"><AlertTriangle className="w-3 h-3" />Poruchy</TabsTrigger>}
            {isEnabled("price_management") && <TabsTrigger value="prices" className="text-[11px] gap-1 shrink-0"><DollarSign className="w-3 h-3" />Ceny</TabsTrigger>}
            <TabsTrigger value="service-plans" className="text-[11px] gap-1 shrink-0"><Wrench className="w-3 h-3" />Plány</TabsTrigger>
            {isEnabled("vehicle_offers") && <TabsTrigger value="vehicle-offers" className="text-[11px] gap-1 shrink-0"><ArrowDownUp className="w-3 h-3" />Výkup/Dovoz</TabsTrigger>}
            {isEnabled("epc_diagrams") && <TabsTrigger value="epc-diagrams" className="text-[11px] gap-1 shrink-0"><LayoutGrid className="w-3 h-3" />Nákresy</TabsTrigger>}
            {isEnabled("service_orders") && <TabsTrigger value="service-orders" className="text-[11px] gap-1 shrink-0"><ClipboardList className="w-3 h-3" />Zakázky</TabsTrigger>}
            {isEnabled("service_scheduler") && <TabsTrigger value="scheduler" className="text-[11px] gap-1 shrink-0"><Calendar className="w-3 h-3" />Plánování</TabsTrigger>}
            {isEnabled("mechanics_management") && <TabsTrigger value="mechanics" className="text-[11px] gap-1 shrink-0"><UserCog className="w-3 h-3" />Mechanici</TabsTrigger>}
            {isEnabled("employees") && <TabsTrigger value="employees" className="text-[11px] gap-1 shrink-0"><Users className="w-3 h-3" />Zaměstnanci</TabsTrigger>}
            {isEnabled("service_statistics") && <TabsTrigger value="statistics" className="text-[11px] gap-1 shrink-0"><BarChart3 className="w-3 h-3" />Statistiky</TabsTrigger>}
            <TabsTrigger value="procedures" className="text-[11px] gap-1 shrink-0"><BookOpen className="w-3 h-3" />Postupy</TabsTrigger>
            {isEnabled("push_notifications") && <TabsTrigger value="push-notif" className="text-[11px] gap-1 shrink-0"><Bell className="w-3 h-3" />Push</TabsTrigger>}
            <TabsTrigger value="features" className="text-[11px] gap-1 shrink-0"><Settings2 className="w-3 h-3" />Moduly</TabsTrigger>
            {user?.email === "josefhlv@gmail.com" && <TabsTrigger value="activity" className="text-[11px] gap-1 shrink-0"><Clock className="w-3 h-3" />Aktivita</TabsTrigger>}
          </TabsList>

          {/* FIRMS / PENDING BUSINESS */}
          <TabsContent value="firms">
            <div className="space-y-3 mt-2">
              {pendingOnly.length > 0 && (
                <h3 className="text-sm font-semibold text-destructive">Čeká na schválení ({pendingOnly.length})</h3>
              )}
              {pendingOnly.map((p) => (
                <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="border-warning/30">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{p.company_name || "Bez názvu"}</p>
                          <p className="text-xs text-muted-foreground">{p.full_name} · {p.email}</p>
                          <p className="text-xs text-muted-foreground">IČO: {p.ico || "–"} · DIČ: {p.dic || "–"}</p>
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(p.created_at)}</p>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => openProfileEdit(p)}>
                            <CheckCircle className="w-4 h-4 mr-1 text-success" />
                            Schválit
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => rejectProfile(p.id)}>
                            <XCircle className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}

              {allBusiness.filter(p => p.status !== "pending").length > 0 && (
                <>
                  <h3 className="text-sm font-semibold text-muted-foreground mt-4">Schválené / zamítnuté firmy</h3>
                  {allBusiness.filter(p => p.status !== "pending").map((p) => (
                    <motion.div key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openProfileEdit(p)}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between">
                            <div>
                              <p className="font-semibold text-sm">{p.company_name || "Bez názvu"}</p>
                              <p className="text-xs text-muted-foreground">{p.full_name} · {p.email}</p>
                              <p className="text-xs text-muted-foreground">Sleva: {p.discount_percent}%</p>
                            </div>
                            <Badge className={statusColors[p.status] || ""}>{statusLabel[p.status] || p.status}</Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </>
              )}

              {allBusiness.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-8">Žádné firemní účty</p>
              )}
            </div>
          </TabsContent>

          {/* ORDERS */}
          <TabsContent value="orders">
            <div className="space-y-3 mt-2">
              {/* Type filter */}
              <div className="flex gap-1">
                {(["all", "new", "used"] as const).map((t) => (
                  <Button
                    key={t}
                    size="sm"
                    variant={orderTypeFilter === t ? "default" : "outline"}
                    onClick={() => setOrderTypeFilter(t)}
                    className="text-xs"
                  >
                    {t === "all" ? "Vše" : t === "new" ? "Nové díly" : "Použité díly"}
                  </Button>
                ))}
              </div>

              {filteredOrders.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné objednávky</p>}
              {filteredOrders.map((o) => (
                <motion.div key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openOrderEdit(o)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-sm">{o.part_name || "–"}</p>
                            <Badge variant="outline" className="text-[10px]">
                              {o.order_type === "new" ? "Nový" : "Použitý"}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">OEM: {o.oem_number || "–"} · {o.quantity}×</p>
                          {o.catalog_source && (
                            <Badge variant="outline" className="text-[10px] mt-0.5 bg-secondary/50">
                              Zdroj: {sourceLabel[o.catalog_source] || o.catalog_source}
                            </Badge>
                          )}
                          {o.customer_note && <p className="text-xs text-muted-foreground italic mt-1">"{o.customer_note}"</p>}
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(o.created_at)} · {o.id.slice(0, 8)}</p>
                        </div>
                        <div className="text-right">
                          <Badge className={statusColors[o.status] || ""}>{statusLabel[o.status] || o.status}</Badge>
                          {o.price_with_vat != null && <p className="text-sm font-semibold mt-1">{o.price_with_vat.toLocaleString("cs")} Kč</p>}
                          {o.discount_percent != null && o.discount_percent > 0 && (
                            <p className="text-[10px] text-muted-foreground">sleva {o.discount_percent}%</p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* SERVICE */}
          <TabsContent value="service">
            <div className="space-y-3 mt-2">
              {bookings.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné rezervace</p>}
              {bookings.map((b) => (
                <motion.div key={b.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card className="cursor-pointer hover:border-primary/40 transition-colors" onClick={() => openBookingEdit(b)}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{b.service_type}</p>
                          <p className="text-xs text-muted-foreground">{b.vehicle_brand} {b.vehicle_model}</p>
                          <p className="text-xs text-muted-foreground mt-1">Požadováno: {fmtDate(b.preferred_date)}</p>
                          {b.wants_replacement_vehicle && <Badge variant="outline" className="text-xs mt-1">Náhradní vůz</Badge>}
                        </div>
                        <div className="text-right">
                          <Badge className={statusColors[b.status] || ""}>{statusLabel[b.status] || b.status}</Badge>
                          {b.final_price && <p className="text-sm font-semibold mt-1">{b.final_price.toLocaleString("cs")} Kč</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* INQUIRIES */}
          <TabsContent value="inquiries">
            <div className="space-y-3 mt-2">
              {inquiries.length === 0 && <p className="text-muted-foreground text-sm text-center py-8">Žádné poptávky vozidel</p>}
              {inquiries.map((i) => (
                <motion.div key={i.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <Card>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="font-semibold text-sm">{i.name || "Bez jména"}</p>
                          <p className="text-xs text-muted-foreground">{i.email} · {i.phone}</p>
                          {i.message && <p className="text-xs text-muted-foreground mt-1 italic">"{i.message}"</p>}
                          <p className="text-xs text-muted-foreground mt-1">{fmtDate(i.created_at)}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <Badge className={statusColors[i.status] || ""}>{statusLabel[i.status] || i.status}</Badge>
                          <Select
                            value={i.status}
                            onValueChange={async (newStatus) => {
                              const { error } = await supabase.from("vehicle_inquiries").update({ status: newStatus }).eq("id", i.id);
                              if (error) { toast({ title: "Chyba", description: error.message, variant: "destructive" }); return; }
                              toast({ title: "Stav aktualizován" });
                              fetchAll();
                            }}
                          >
                            <SelectTrigger className="h-7 text-[10px] w-28"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="new">Nový</SelectItem>
                              <SelectItem value="contacted">Kontaktován</SelectItem>
                              <SelectItem value="completed">Dokončeno</SelectItem>
                              <SelectItem value="cancelled">Zrušeno</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* CATALOG IMPORT */}
          <TabsContent value="catalog">
            <div className="mt-2 space-y-4">
              <AICatalogImport />
              <CatalogImport />
              <EPCImport />
            </div>
          </TabsContent>

          <TabsContent value="settings">
            <div className="mt-2">
              <AdminCatalogSettings />
            </div>
          </TabsContent>

          <TabsContent value="history">
            <div className="mt-2">
              <AdminServiceHistory />
            </div>
          </TabsContent>

          {isEnabled("notifications") && (
            <TabsContent value="notifications">
              <div className="mt-2"><AdminNotifications /></div>
            </TabsContent>
          )}

          {isEnabled("fault_reports") && (
            <TabsContent value="faults">
              <div className="mt-2"><AdminFaultReports /></div>
            </TabsContent>
          )}

          {isEnabled("price_management") && (
            <TabsContent value="prices">
              <div className="mt-2 space-y-4">
                <AdminPriceSyncStats />
                <AdminBulkPriceSync />
                <AdminPriceManagement />
              </div>
            </TabsContent>
          )}

          <TabsContent value="service-plans">
            <div className="mt-2"><AdminServicePlans /></div>
          </TabsContent>

          {isEnabled("vehicle_offers") && (
            <TabsContent value="vehicle-offers">
              <div className="mt-2"><AdminVehicleOffers /></div>
            </TabsContent>
          )}

          {isEnabled("epc_diagrams") && (
            <TabsContent value="epc-diagrams">
              <div className="mt-2"><AdminEPCDiagrams /></div>
            </TabsContent>
          )}

          {isEnabled("service_orders") && (
            <TabsContent value="service-orders">
              <div className="mt-2"><AdminServiceOrders /></div>
            </TabsContent>
          )}

          {isEnabled("mechanics_management") && (
            <TabsContent value="mechanics">
              <div className="mt-2"><AdminMechanics /></div>
            </TabsContent>
          )}

          {isEnabled("service_statistics") && (
            <TabsContent value="statistics">
              <div className="mt-2"><AdminServiceStatistics /></div>
            </TabsContent>
          )}

          {isEnabled("service_scheduler") && (
            <TabsContent value="scheduler">
              <div className="mt-2"><AdminServiceScheduler /></div>
            </TabsContent>
          )}

          {isEnabled("employees") && (
            <TabsContent value="employees">
              <div className="mt-2"><AdminEmployees /></div>
            </TabsContent>
          )}

          <TabsContent value="procedures">
            <AdminServiceProcedures />
          </TabsContent>

          {isEnabled("push_notifications") && (
            <TabsContent value="push-notif">
              <div className="mt-2"><AdminNotificationToggle /></div>
            </TabsContent>
          )}

          <TabsContent value="features">
            <div className="mt-2"><AdminFeatureSettings /></div>
          </TabsContent>

          <TabsContent value="activity">
            <div className="mt-2"><AdminActivityLog /></div>
          </TabsContent>
        </Tabs>
      </div>

      {/* PROFILE APPROVAL DIALOG */}
      <Dialog open={!!editProfile} onOpenChange={() => setEditProfile(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Správa firemního účtu</DialogTitle></DialogHeader>
          {editProfile && (
            <div className="space-y-3">
              <div className="space-y-1">
                <p className="text-sm"><span className="font-medium">Firma:</span> {editProfile.company_name}</p>
                <p className="text-sm"><span className="font-medium">Kontakt:</span> {editProfile.full_name} · {editProfile.email}</p>
                <p className="text-sm"><span className="font-medium">IČO:</span> {editProfile.ico || "–"}</p>
                <p className="text-sm"><span className="font-medium">DIČ:</span> {editProfile.dic || "–"}</p>
                <p className="text-sm"><span className="font-medium">Status:</span> {statusLabel[editProfile.status] || editProfile.status}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Sleva (%)</label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={formDiscount}
                  onChange={(e) => setFormDiscount(e.target.value)}
                  placeholder="0"
                />
              </div>
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setEditProfile(null)}>Zavřít</Button>
            {editProfile?.status === "pending" && (
              <Button variant="destructive" onClick={() => editProfile && rejectProfile(editProfile.id)}>
                <XCircle className="w-4 h-4 mr-1" />Zamítnout
              </Button>
            )}
            <Button onClick={() => editProfile && approveProfile(editProfile.id, parseFloat(formDiscount) || 0)}>
              <CheckCircle className="w-4 h-4 mr-1" />
              {editProfile?.status === "pending" ? "Schválit" : "Uložit slevu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ORDER EDIT DIALOG */}
      <Dialog open={!!editOrder} onOpenChange={() => setEditOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit objednávku</DialogTitle></DialogHeader>
          {editOrder && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Díl:</span> {editOrder.part_name}</p>
                <p><span className="font-medium">OEM:</span> {editOrder.oem_number || "–"}</p>
                <p><span className="font-medium">Typ:</span> {editOrder.order_type === "new" ? "Nový" : "Použitý"}</p>
                {editOrder.unit_price != null && <p><span className="font-medium">Cena bez DPH:</span> {editOrder.unit_price.toLocaleString("cs")} Kč</p>}
                {editOrder.price_with_vat != null && <p><span className="font-medium">Cena s DPH:</span> {editOrder.price_with_vat.toLocaleString("cs")} Kč</p>}
                {editOrder.customer_note && <p><span className="font-medium">Poznámka zákazníka:</span> {editOrder.customer_note}</p>}
              </div>
              <div>
                <label className="text-sm font-medium">Status</label>
                <Select value={formStatus} onValueChange={setFormStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["nova", "zpracovava_se", "vyrizena", "zrusena"].map(s => (
                      <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Poznámka admina</label>
                <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Zrušit</Button>
            <Button onClick={saveOrder}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* BOOKING EDIT DIALOG */}
      <Dialog open={!!editBooking} onOpenChange={() => setEditBooking(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit servisní rezervaci</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Status</label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending", "confirmed", "in_progress", "completed", "cancelled"].map(s => (
                    <SelectItem key={s} value={s}>{statusLabel[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium">Potvrzený datum</label>
              <Input type="date" value={formConfirmedDate} onChange={e => setFormConfirmedDate(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Odhadovaná cena (Kč)</label>
              <Input type="number" value={formEstimatedPrice} onChange={e => setFormEstimatedPrice(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium">Finální cena (Kč)</label>
              <Input type="number" value={formFinalPrice} onChange={e => setFormFinalPrice(e.target.value)} />
            </div>
            {editBooking?.wants_replacement_vehicle && (
              <div>
                <label className="text-sm font-medium">Náhradní vůz potvrzen?</label>
                <Select value={formReplacementConfirmed} onValueChange={setFormReplacementConfirmed}>
                  <SelectTrigger><SelectValue placeholder="Vyberte" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Ano</SelectItem>
                    <SelectItem value="no">Ne</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <label className="text-sm font-medium">Poznámka admina</label>
              <Textarea value={formNote} onChange={e => setFormNote(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBooking(null)}>Zrušit</Button>
            <Button onClick={saveBooking}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Admin;
