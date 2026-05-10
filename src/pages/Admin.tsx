import { useEffect, useState, lazy, Suspense } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import {
  RefreshCw, Shield, ShoppingCart, Wrench, Car, Users, CheckCircle, XCircle,
  Bell, History, AlertTriangle, ArrowDownUp, ClipboardList, BarChart3,
  UserCog, Calendar, BookOpen, Star, TrendingUp, Settings2, Database,
  LayoutDashboard, Package, Activity, FileText, ScanLine, Smartphone,
  CloudOff, Loader2, Trash2, FileSpreadsheet,
} from "lucide-react";
import { sourceLabel } from "@/api/partsAPI";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import AdminShell, { AdminTreeNode } from "@/components/admin/AdminShell";

// Lazy admin moduly (zachované)
const AdminCatalogUnified = lazy(() => import("@/components/admin/AdminCatalogUnified"));
const AdminCatalogHub = lazy(() => import("@/components/admin/AdminCatalogHub"));
const AdminCompatibility = lazy(() => import("@/pages/AdminCompatibility"));
const AdminJmOrders = lazy(() => import("@/components/admin/AdminJmOrders"));
const CatalogImport = lazy(() => import("@/components/admin/CatalogImport"));
const AICatalogImport = lazy(() => import("@/components/admin/AICatalogImport"));
const EPCImport = lazy(() => import("@/components/admin/EPCImport"));
const Admin7zapScraper = lazy(() => import("@/components/admin/Admin7zapScraper"));

const AdminAutoPipeline = lazy(() => import("@/components/admin/AdminAutoPipeline"));
const AdminCompatMatcher = lazy(() => import("@/components/admin/AdminCompatMatcher"));
const AdminCatalogHealth = lazy(() => import("@/components/admin/AdminCatalogHealth"));
const AdminPhotoEnrichment = lazy(() => import("@/components/admin/AdminPhotoEnrichment"));
const AdminDataFixer = lazy(() => import("@/components/admin/AdminDataFixer"));
const AdminCatalogQualityExport = lazy(() => import("@/components/admin/AdminCatalogQualityExport"));
const AdminCatalogCommandCenter = lazy(() => import("@/components/admin/AdminCatalogCommandCenter"));
const AdminPriceSyncStats = lazy(() => import("@/components/admin/AdminPriceSyncStats"));
const AdminBulkPriceSyncRuns = lazy(() => import("@/components/admin/AdminBulkPriceSyncRuns"));
const AdminBulkPriceSync = lazy(() => import("@/components/admin/AdminBulkPriceSync"));
const AdminPriceManagement = lazy(() => import("@/components/admin/AdminPriceManagement"));
const AdminEPCDiagrams = lazy(() => import("@/components/admin/AdminEPCDiagrams"));
const AdminCatalogSettings = lazy(() => import("@/components/admin/AdminCatalogSettings"));

const AdminServiceOrders = lazy(() => import("@/components/admin/AdminServiceOrders"));
const AdminServiceScheduler = lazy(() => import("@/components/admin/AdminServiceScheduler"));
const AdminMechanics = lazy(() => import("@/components/admin/AdminMechanics"));
const AdminServiceStatistics = lazy(() => import("@/components/admin/AdminServiceStatistics"));
const AdminServicePlans = lazy(() => import("@/components/admin/AdminServicePlans"));
const AdminServiceProcedures = lazy(() => import("@/components/admin/AdminServiceProcedures"));
const AdminServiceHistory = lazy(() => import("@/components/admin/AdminServiceHistory"));
const AdminReviews = lazy(() => import("@/components/admin/AdminReviews"));

const AdminVehicleOffers = lazy(() => import("@/components/admin/AdminVehicleOffers"));
const AdminFaultReports = lazy(() => import("@/components/admin/AdminFaultReports"));

const AdminEmployees = lazy(() => import("@/components/admin/AdminEmployees"));

const AdminNotifications = lazy(() => import("@/components/admin/AdminNotifications"));
const AdminNotificationToggle = lazy(() => import("@/components/admin/AdminNotificationToggle"));
const AdminFeatureSettings = lazy(() => import("@/components/admin/AdminFeatureSettings"));
const AdminActivityLog = lazy(() => import("@/components/admin/AdminActivityLog"));
const AdminBackups = lazy(() => import("@/components/admin/AdminBackups"));
const AdminDashboardStats = lazy(() => import("@/components/admin/AdminDashboardStats"));

// Nové moduly
const AdminRemoteOBD = lazy(() => import("@/components/admin/AdminRemoteOBD"));
const AdminDTCLibrary = lazy(() => import("@/components/admin/AdminDTCLibrary"));
const AdminTSBs = lazy(() => import("@/components/admin/AdminTSBs"));
const AdminDiagPDFs = lazy(() => import("@/components/admin/AdminDiagPDFs"));
const AdminMobileQuickActions = lazy(() => import("@/components/admin/AdminMobileQuickActions"));
const AdminVinScanner = lazy(() => import("@/components/admin/AdminVinScanner"));
const AdminPushSettings = lazy(() => import("@/components/admin/AdminPushSettings"));
const AdminOfflineQueue = lazy(() => import("@/components/admin/AdminOfflineQueue"));
const AdminAuditLog = lazy(() => import("@/components/admin/AdminAuditLog"));

type Profile = { id: string; user_id: string; full_name: string | null; email: string | null; company_name: string | null; ico: string | null; dic: string | null; account_type: string; status: string; discount_percent: number; created_at: string; };
type OrderRow = { id: string; user_id: string; part_id: string | null; part_name: string | null; oem_number: string | null; order_type: string; quantity: number; unit_price: number | null; discount_percent: number | null; discounted_price: number | null; price_with_vat: number | null; status: string; admin_note: string | null; customer_note: string | null; catalog_source: string | null; created_at: string; profile_name?: string | null; profile_email?: string | null; };
type Booking = { id: string; vehicle_brand: string | null; vehicle_model: string | null; service_type: string; preferred_date: string; confirmed_date: string | null; note: string | null; wants_replacement_vehicle: boolean; replacement_vehicle_confirmed: boolean | null; status: string; admin_note: string | null; estimated_price: number | null; discount_amount: number | null; final_price: number | null; user_id: string; created_at: string; profile_name?: string | null; profile_email?: string | null; profile_phone?: string | null; };
type Inquiry = { id: string; vehicle_id: string; name: string | null; email: string | null; phone: string | null; message: string | null; status: string; user_id: string | null; created_at: string; };

const statusColors: Record<string, string> = {
  pending: "bg-warning/15 text-warning border-warning/30", confirmed: "bg-primary/15 text-primary border-primary/30",
  in_progress: "bg-purple-500/15 text-purple-400 border-purple-500/30", completed: "bg-success/15 text-success border-success/30",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30", shipped: "bg-primary/15 text-primary border-primary/30",
  delivered: "bg-success/15 text-success border-success/30", quoted: "bg-primary/15 text-primary border-primary/30",
  accepted: "bg-success/15 text-success border-success/30", rejected: "bg-destructive/15 text-destructive border-destructive/30",
  fulfilled: "bg-success/15 text-success border-success/30", new: "bg-warning/15 text-warning border-warning/30",
  nova: "bg-warning/15 text-warning border-warning/30", zpracovava_se: "bg-primary/15 text-primary border-primary/30",
  vyrizena: "bg-success/15 text-success border-success/30", zrusena: "bg-destructive/15 text-destructive border-destructive/30",
  active: "bg-success/15 text-success border-success/30",
};
const statusLabel: Record<string, string> = {
  pending: "Čeká", confirmed: "Potvrzeno", in_progress: "Probíhá", completed: "Dokončeno", cancelled: "Zrušeno",
  shipped: "Odesláno", delivered: "Doručeno", quoted: "Naceneno", accepted: "Přijato", rejected: "Odmítnuto",
  fulfilled: "Splněno", new: "Nový", nova: "Nová", zpracovava_se: "Zpracovává se", vyrizena: "Vyřízena",
  zrusena: "Zrušena", active: "Aktivní",
};

const Loader = () => <div className="flex items-center justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

const Admin = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const navigate = useNavigate();
  const { isEnabled } = useFeatureFlags();

  const [section, setSection] = useState<string>(() => {
    const hash = window.location.hash.replace("#", "");
    return hash || "overview";
  });

  useEffect(() => {
    const onHash = () => setSection(window.location.hash.replace("#", "") || "overview");
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const goto = (key: string) => {
    setSection(key);
    window.location.hash = key;
  };

  // Inline data pro firmy/objednávky/servis/poptávky (zachovaná původní logika)
  const [pendingProfiles, setPendingProfiles] = useState<Profile[]>([]);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [orderTypeFilter, setOrderTypeFilter] = useState<"all" | "new" | "used">("all");
  const [editOrder, setEditOrder] = useState<OrderRow | null>(null);
  const [editBooking, setEditBooking] = useState<Booking | null>(null);
  const [editProfile, setEditProfile] = useState<Profile | null>(null);
  const [formNote, setFormNote] = useState("");
  const [formStatus, setFormStatus] = useState("");
  const [formDiscount, setFormDiscount] = useState("");
  const [formConfirmedDate, setFormConfirmedDate] = useState("");
  const [formEstimatedPrice, setFormEstimatedPrice] = useState("");
  const [formFinalPrice, setFormFinalPrice] = useState("");
  const [formReplacementConfirmed, setFormReplacementConfirmed] = useState("");

  useEffect(() => {
    if (!isLoading && (!user || !isAdmin)) navigate("/auth");
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
    const rawOrders = (ordersRes.data as OrderRow[]) || [];
    setInquiries((inquiriesRes.data as Inquiry[]) || []);
    const rawBookings = (bookingsRes.data as Booking[]) || [];
    const allUserIds = [...new Set([...rawOrders.map((o) => o.user_id), ...rawBookings.map((b) => b.user_id)])];
    const profileMap = new Map<string, any>();
    if (allUserIds.length > 0) {
      const { data: allProfiles } = await supabase.from("profiles").select("user_id, full_name, email, phone").in("user_id", allUserIds);
      (allProfiles || []).forEach((p) => profileMap.set(p.user_id, p));
    }
    setOrders(rawOrders.map((o) => ({ ...o, profile_name: profileMap.get(o.user_id)?.full_name || null, profile_email: profileMap.get(o.user_id)?.email || null })));
    setBookings(rawBookings.map((b) => ({ ...b, profile_name: profileMap.get(b.user_id)?.full_name || null, profile_email: profileMap.get(b.user_id)?.email || null, profile_phone: profileMap.get(b.user_id)?.phone || null })));
    setLoading(false);
  };

  useEffect(() => { if (isAdmin) fetchAll(); }, [isAdmin]);

  const approveProfile = async (id: string, discount: number) => {
    const { error } = await supabase.from("profiles").update({ status: "active", discount_percent: discount }).eq("id", id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Firma schválena" }); setEditProfile(null); fetchAll();
  };
  const rejectProfile = async (id: string) => {
    const { error } = await supabase.from("profiles").update({ status: "rejected" }).eq("id", id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Firma zamítnuta" }); setEditProfile(null); fetchAll();
  };
  const openProfileEdit = (p: Profile) => { setEditProfile(p); setFormDiscount(p.discount_percent.toString()); };
  const openOrderEdit = (o: OrderRow) => { setEditOrder(o); setFormStatus(o.status); setFormNote(o.admin_note || ""); };
  const saveOrder = async () => {
    if (!editOrder) return;
    const { error } = await supabase.from("orders").update({ status: formStatus as any, admin_note: formNote }).eq("id", editOrder.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Uloženo" }); setEditOrder(null); fetchAll();
  };
  const openBookingEdit = (b: Booking) => {
    setEditBooking(b); setFormStatus(b.status); setFormNote(b.admin_note || "");
    setFormConfirmedDate(b.confirmed_date || ""); setFormEstimatedPrice(b.estimated_price?.toString() || "");
    setFormFinalPrice(b.final_price?.toString() || "");
    setFormReplacementConfirmed(b.replacement_vehicle_confirmed === null ? "" : b.replacement_vehicle_confirmed ? "yes" : "no");
  };
  const saveBooking = async () => {
    if (!editBooking) return;
    const { error } = await supabase.from("service_bookings").update({
      status: formStatus as any, admin_note: formNote, confirmed_date: formConfirmedDate || null,
      estimated_price: formEstimatedPrice ? parseFloat(formEstimatedPrice) : null,
      final_price: formFinalPrice ? parseFloat(formFinalPrice) : null,
      replacement_vehicle_confirmed: formReplacementConfirmed === "" ? null : formReplacementConfirmed === "yes",
    }).eq("id", editBooking.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Uloženo" }); setEditBooking(null); fetchAll();
  };

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("cs-CZ");
  const pendingOnly = pendingProfiles.filter((p) => p.status === "pending");
  const allBusiness = pendingProfiles;
  const filteredOrders = orderTypeFilter === "all" ? orders : orders.filter((o) => o.order_type === orderTypeFilter);

  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><RefreshCw className="w-6 h-6 animate-spin text-primary" /></div>;
  if (!isAdmin) return null;

  // === Strom navigace ===
  const tree: AdminTreeNode[] = [
    { key: "overview", label: "Přehled", icon: LayoutDashboard },
    {
      key: "catalog", label: "Katalog (J+M)", icon: Package, children: [
        { key: "catalog-overview", label: "Přehled", icon: LayoutDashboard },
        { key: "catalog-engine-id", label: "Engine ID / K-type", icon: Database },
        { key: "catalog-settings", label: "J+M sync & nastavení", icon: Settings2 },
        { key: "catalog-health", label: "Zdraví katalogu", icon: Activity },
        { key: "catalog-repair", label: "Diagnostika & opravy" },
        { key: "catalog-import", label: "Import OEM/CSV" },
        ...(isEnabled("price_management") ? [{ key: "catalog-prices", label: "Ceny" }] : []),
        ...(isEnabled("epc_diagrams") ? [{ key: "catalog-epc", label: "OEM EPC nákresy" }] : []),
      ],
    },
    {
      key: "service", label: "Servis", icon: Wrench, children: [
        { key: "service-bookings", label: "Rezervace", badge: bookings.filter((b) => b.status === "pending").length },
        ...(isEnabled("service_orders") ? [{ key: "service-orders", label: "Zakázky", icon: ClipboardList }] : []),
        ...(isEnabled("service_scheduler") ? [{ key: "service-scheduler", label: "Plánovač", icon: Calendar }] : []),
        { key: "service-plans", label: "Plány údržby" },
        { key: "service-procedures", label: "Postupy", icon: BookOpen },
        ...(isEnabled("service_history") ? [{ key: "service-history", label: "Servisní knížka", icon: History }] : []),
        ...(isEnabled("service_reviews") ? [{ key: "service-reviews", label: "Hodnocení", icon: Star }] : []),
        ...(isEnabled("service_statistics") ? [{ key: "service-stats", label: "Statistiky", icon: BarChart3 }] : []),
      ],
    },
    {
      key: "orders", label: "Objednávky", icon: ShoppingCart, children: [
        { key: "orders-list", label: "Seznam objednávek", badge: orders.filter((o) => o.status === "nova").length },
        { key: "orders-jm", label: "Odeslané do J+M" },
      ],
    },
    {
      key: "vehicles", label: "Vozy", icon: Car, children: [
        ...(isEnabled("vehicle_offers") ? [
          { key: "vehicles-inquiries", label: "Poptávky" },
          { key: "vehicles-offers", label: "Výkup / Dovoz", icon: ArrowDownUp },
        ] : []),
        ...(isEnabled("fault_reports") ? [{ key: "vehicles-faults", label: "Hlášení závad", icon: AlertTriangle }] : []),
      ],
    },
    {
      key: "users", label: "Zákazníci & role", icon: Users, children: [
        { key: "users-firms", label: "Firmy", badge: pendingOnly.length },
        ...(isEnabled("employees") ? [{ key: "users-employees", label: "Zaměstnanci", icon: UserCog }] : []),
        ...(isEnabled("mechanics_management") ? [{ key: "users-mechanics", label: "Mechanici" }] : []),
      ],
    },
    {
      key: "diag", label: "Diagnostika", icon: Activity, children: [
        { key: "diag-remote", label: "Vzdálené OBD live" },
        { key: "diag-dtc", label: "DTC knihovna", icon: BookOpen },
        { key: "diag-tsb", label: "TSB databáze", icon: FileText },
        { key: "diag-pdf", label: "Protokoly (PDF)", icon: FileSpreadsheet },
      ],
    },
    {
      key: "mobile", label: "Mobil & nástroje", icon: Smartphone, children: [
        { key: "mobile-quick", label: "Rychlé akce" },
        { key: "mobile-vin", label: "VIN/QR scanner", icon: ScanLine },
        { key: "mobile-push", label: "Push notifikace", icon: Bell },
        { key: "mobile-offline", label: "Offline fronta", icon: CloudOff },
      ],
    },
    {
      key: "system", label: "Systém", icon: Settings2, children: [
        { key: "sys-features", label: "Feature flags" },
        { key: "sys-notifications", label: "Notifikace", icon: Bell },
        ...(isEnabled("push_notifications") ? [{ key: "sys-push", label: "Push (zákazníci)" }] : []),
        { key: "sys-activity", label: "Aktivita" },
        { key: "sys-audit", label: "Audit log", icon: History },
        { key: "sys-backups", label: "Zálohy", icon: Database },
        ...(isEnabled("admin_statistics") ? [{ key: "sys-stats", label: "KPI dashboard", icon: TrendingUp }] : []),
      ],
    },
  ];

  // === Render obsahu ===
  const renderSection = () => {
    switch (section) {
      // ----- OVERVIEW -----
      case "overview":
      case "":
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-lg gradient-bronze flex items-center justify-center"><Shield className="w-5 h-5 text-white" /></div>
              <div className="flex-1">
                <h1 className="text-xl font-display font-semibold">Admin panel</h1>
                <p className="text-xs text-muted-foreground">Vyber sekci v levém menu</p>
              </div>
              <Button size="sm" variant="outline" onClick={fetchAll}><RefreshCw className="w-3.5 h-3.5 mr-1" />Obnovit</Button>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {[
                { label: "Čekající firmy", value: pendingOnly.length, color: "text-destructive", action: () => goto("users-firms") },
                { label: "Nové objednávky", value: orders.filter((o) => o.status === "nova").length, color: "text-primary", action: () => goto("orders-list") },
                { label: "Čekající rezervace", value: bookings.filter((b) => b.status === "pending").length, color: "text-warning", action: () => goto("service-bookings") },
                { label: "Poptávky vozidel", value: inquiries.filter((i) => i.status === "new").length, color: "text-success", action: () => goto("vehicles-inquiries") },
              ].map((s) => (
                <Card key={s.label} className="cursor-pointer hover:border-primary/40" onClick={s.action}>
                  <CardContent className="p-3">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.label}</p>
                    <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Suspense fallback={<Loader />}>{isEnabled("admin_statistics") && <AdminDashboardStats />}</Suspense>
          </div>
        );

      // ----- CATALOG -----
      case "catalog":
      case "catalog-overview": return <Suspense fallback={<Loader />}><AdminCatalogHub /></Suspense>;
      case "catalog-engine-id": return <Suspense fallback={<Loader />}><AdminCompatibility /></Suspense>;
      case "catalog-import": return <Suspense fallback={<Loader />}><div className="space-y-4"><AICatalogImport /><CatalogImport /></div></Suspense>;
      case "catalog-7zap": return <Suspense fallback={<Loader />}><Admin7zapScraper /></Suspense>;
      case "catalog-health": return <Suspense fallback={<Loader />}><AdminCatalogHealth /></Suspense>;
      case "catalog-pipeline": return <Suspense fallback={<Loader />}><div className="space-y-4"><AdminAutoPipeline /><AdminCompatMatcher /></div></Suspense>;
      case "catalog-repair": return <Suspense fallback={<Loader />}><div className="space-y-4"><AdminPhotoEnrichment /><AdminDataFixer /><AdminCatalogQualityExport /><AdminCatalogCommandCenter /></div></Suspense>;
      case "catalog-prices": return <Suspense fallback={<Loader />}><div className="space-y-4"><AdminPriceSyncStats /><AdminBulkPriceSyncRuns /><AdminBulkPriceSync /><AdminPriceManagement /></div></Suspense>;
      case "catalog-epc": return <Suspense fallback={<Loader />}><AdminEPCDiagrams /></Suspense>;
      case "catalog-settings": return <Suspense fallback={<Loader />}><AdminCatalogSettings /></Suspense>;

      // ----- SERVICE -----
      case "service":
      case "service-bookings":
        return (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Rezervace servisu</h2>
            {bookings.length === 0 && <p className="text-sm text-muted-foreground">Žádné rezervace</p>}
            {bookings.map((b) => (
              <Card key={b.id} className="cursor-pointer hover:border-primary/40" onClick={() => openBookingEdit(b)}>
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{b.service_type}</p>
                    <p className="text-xs text-primary">{b.profile_name || "—"} · {b.profile_email || b.profile_phone || "—"}</p>
                    <p className="text-xs text-muted-foreground">{b.vehicle_brand || "—"} {b.vehicle_model || ""}</p>
                    <p className="text-xs text-muted-foreground mt-1">Požadováno: {fmtDate(b.preferred_date)}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={statusColors[b.status] || ""}>{statusLabel[b.status] || b.status}</Badge>
                    {b.final_price && <p className="text-sm font-semibold mt-1">{b.final_price.toLocaleString("cs")} Kč</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      case "service-orders": return <Suspense fallback={<Loader />}><AdminServiceOrders /></Suspense>;
      case "service-scheduler": return <Suspense fallback={<Loader />}><AdminServiceScheduler /></Suspense>;
      case "service-plans": return <Suspense fallback={<Loader />}><AdminServicePlans /></Suspense>;
      case "service-procedures": return <Suspense fallback={<Loader />}><AdminServiceProcedures /></Suspense>;
      case "service-history": return <Suspense fallback={<Loader />}><AdminServiceHistory /></Suspense>;
      case "service-reviews": return <Suspense fallback={<Loader />}><AdminReviews /></Suspense>;
      case "service-stats": return <Suspense fallback={<Loader />}><AdminServiceStatistics /></Suspense>;

      case "orders-jm": return <Suspense fallback={<Loader />}><AdminJmOrders /></Suspense>;

      // ----- ORDERS -----
      case "orders":
      case "orders-list":
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-lg font-semibold">Objednávky</h2>
              <div className="flex gap-1">
                {(["all", "new", "used"] as const).map((t) => (
                  <Button key={t} size="sm" variant={orderTypeFilter === t ? "default" : "outline"} onClick={() => setOrderTypeFilter(t)} className="text-xs">
                    {t === "all" ? "Vše" : t === "new" ? "Nové" : "Použité"}
                  </Button>
                ))}
              </div>
            </div>
            {filteredOrders.map((o) => (
              <Card key={o.id} className="cursor-pointer hover:border-primary/40" onClick={() => openOrderEdit(o)}>
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-sm">{o.part_name || "—"}</p>
                      <Badge variant="outline" className="text-[10px]">{o.order_type === "new" ? "Nový" : "Použitý"}</Badge>
                    </div>
                    <p className="text-xs text-primary">{o.profile_name || "—"} · {o.profile_email || "—"}</p>
                    <p className="text-xs text-muted-foreground">OEM: {o.oem_number || "—"} · {o.quantity}×</p>
                    {o.catalog_source && <Badge variant="outline" className="text-[10px] mt-0.5">Zdroj: {sourceLabel[o.catalog_source] || o.catalog_source}</Badge>}
                    <p className="text-xs text-muted-foreground mt-1">{fmtDate(o.created_at)}</p>
                  </div>
                  <div className="text-right">
                    <Badge className={statusColors[o.status] || ""}>{statusLabel[o.status] || o.status}</Badge>
                    {o.price_with_vat != null && <p className="text-sm font-semibold mt-1">{o.price_with_vat.toLocaleString("cs")} Kč</p>}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        );

      // ----- VEHICLES -----
      case "vehicles":
      case "vehicles-inquiries":
        return (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Poptávky vozidel</h2>
            {inquiries.length === 0 && <p className="text-sm text-muted-foreground">Žádné poptávky</p>}
            {inquiries.map((i) => (
              <Card key={i.id}>
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{i.name || "Bez jména"}</p>
                    <p className="text-xs text-muted-foreground">{i.email} · {i.phone}</p>
                    {i.message && <p className="text-xs italic mt-1">"{i.message}"</p>}
                    <p className="text-xs text-muted-foreground mt-1">{fmtDate(i.created_at)}</p>
                  </div>
                  <Badge className={statusColors[i.status] || ""}>{statusLabel[i.status] || i.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      case "vehicles-offers": return <Suspense fallback={<Loader />}><AdminVehicleOffers /></Suspense>;
      case "vehicles-faults": return <Suspense fallback={<Loader />}><AdminFaultReports /></Suspense>;

      // ----- USERS -----
      case "users":
      case "users-firms":
        return (
          <div className="space-y-3">
            <h2 className="text-lg font-semibold">Firemní účty</h2>
            {pendingOnly.length > 0 && <h3 className="text-sm font-semibold text-destructive">Čeká na schválení ({pendingOnly.length})</h3>}
            {pendingOnly.map((p) => (
              <Card key={p.id} className="border-warning/30">
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{p.company_name || "Bez názvu"}</p>
                    <p className="text-xs text-muted-foreground">{p.full_name} · {p.email}</p>
                    <p className="text-xs text-muted-foreground">IČO: {p.ico || "—"} · DIČ: {p.dic || "—"}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="outline" onClick={() => openProfileEdit(p)}><CheckCircle className="w-4 h-4 mr-1 text-success" />Schválit</Button>
                    <Button size="sm" variant="outline" onClick={() => rejectProfile(p.id)}><XCircle className="w-4 h-4 text-destructive" /></Button>
                  </div>
                </CardContent>
              </Card>
            ))}
            {allBusiness.filter((p) => p.status !== "pending").length > 0 && <h3 className="text-sm font-semibold text-muted-foreground mt-4">Schválené / zamítnuté</h3>}
            {allBusiness.filter((p) => p.status !== "pending").map((p) => (
              <Card key={p.id} className="cursor-pointer hover:border-primary/40" onClick={() => openProfileEdit(p)}>
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-sm">{p.company_name || "Bez názvu"}</p>
                    <p className="text-xs text-muted-foreground">{p.full_name} · {p.email}</p>
                    <p className="text-xs text-muted-foreground">Sleva: {p.discount_percent}%</p>
                  </div>
                  <Badge className={statusColors[p.status] || ""}>{statusLabel[p.status] || p.status}</Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        );
      case "users-employees": return <Suspense fallback={<Loader />}><AdminEmployees /></Suspense>;
      case "users-mechanics": return <Suspense fallback={<Loader />}><AdminMechanics /></Suspense>;

      // ----- DIAGNOSTIKA -----
      case "diag":
      case "diag-remote": return <Suspense fallback={<Loader />}><AdminRemoteOBD /></Suspense>;
      case "diag-dtc": return <Suspense fallback={<Loader />}><AdminDTCLibrary /></Suspense>;
      case "diag-tsb": return <Suspense fallback={<Loader />}><AdminTSBs /></Suspense>;
      case "diag-pdf": return <Suspense fallback={<Loader />}><AdminDiagPDFs /></Suspense>;

      // ----- MOBILE -----
      case "mobile":
      case "mobile-quick": return <Suspense fallback={<Loader />}><AdminMobileQuickActions /></Suspense>;
      case "mobile-vin": return <Suspense fallback={<Loader />}><AdminVinScanner /></Suspense>;
      case "mobile-push": return <Suspense fallback={<Loader />}><AdminPushSettings /></Suspense>;
      case "mobile-offline": return <Suspense fallback={<Loader />}><AdminOfflineQueue /></Suspense>;

      // ----- SYSTÉM -----
      case "system":
      case "sys-features": return <Suspense fallback={<Loader />}><AdminFeatureSettings /></Suspense>;
      case "sys-notifications": return <Suspense fallback={<Loader />}><AdminNotifications /></Suspense>;
      case "sys-push": return <Suspense fallback={<Loader />}><AdminNotificationToggle /></Suspense>;
      case "sys-activity": return <Suspense fallback={<Loader />}><AdminActivityLog /></Suspense>;
      case "sys-audit": return <Suspense fallback={<Loader />}><AdminAuditLog /></Suspense>;
      case "sys-backups": return <Suspense fallback={<Loader />}><AdminBackups /></Suspense>;
      case "sys-stats": return <Suspense fallback={<Loader />}><AdminDashboardStats /></Suspense>;

      default:
        return <p className="text-muted-foreground">Sekce nenalezena: {section}</p>;
    }
  };

  return (
    <>
      <AdminShell tree={tree} activeKey={section} onSelect={goto}>
        {loading && section === "overview" ? <Loader /> : renderSection()}
      </AdminShell>

      {/* === Dialogy (zachované) === */}
      <Dialog open={!!editProfile} onOpenChange={() => setEditProfile(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Správa firemního účtu</DialogTitle></DialogHeader>
          {editProfile && (
            <div className="space-y-3">
              <div className="space-y-1 text-sm">
                <p><strong>Firma:</strong> {editProfile.company_name}</p>
                <p><strong>Kontakt:</strong> {editProfile.full_name} · {editProfile.email}</p>
                <p><strong>IČO:</strong> {editProfile.ico || "—"} · <strong>DIČ:</strong> {editProfile.dic || "—"}</p>
              </div>
              <div>
                <label className="text-sm font-medium">Sleva (%)</label>
                <Input type="number" min={0} max={100} value={formDiscount} onChange={(e) => setFormDiscount(e.target.value)} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditProfile(null)}>Zavřít</Button>
            {editProfile?.status === "pending" && (
              <Button variant="destructive" onClick={() => editProfile && rejectProfile(editProfile.id)}>
                <XCircle className="w-4 h-4 mr-1" />Zamítnout
              </Button>
            )}
            <Button onClick={() => editProfile && approveProfile(editProfile.id, parseFloat(formDiscount) || 0)}>
              <CheckCircle className="w-4 h-4 mr-1" />{editProfile?.status === "pending" ? "Schválit" : "Uložit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editOrder} onOpenChange={() => setEditOrder(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit objednávku</DialogTitle></DialogHeader>
          {editOrder && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{editOrder.part_name}</p>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nova">Nová</SelectItem>
                  <SelectItem value="zpracovava_se">Zpracovává se</SelectItem>
                  <SelectItem value="vyrizena">Vyřízena</SelectItem>
                  <SelectItem value="zrusena">Zrušena</SelectItem>
                </SelectContent>
              </Select>
              <Textarea placeholder="Admin poznámka" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOrder(null)}>Zrušit</Button>
            <Button onClick={saveOrder}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editBooking} onOpenChange={() => setEditBooking(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Upravit rezervaci</DialogTitle></DialogHeader>
          {editBooking && (
            <div className="space-y-3">
              <p className="text-sm font-medium">{editBooking.service_type}</p>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Čeká</SelectItem>
                  <SelectItem value="confirmed">Potvrzeno</SelectItem>
                  <SelectItem value="in_progress">Probíhá</SelectItem>
                  <SelectItem value="completed">Dokončeno</SelectItem>
                  <SelectItem value="cancelled">Zrušeno</SelectItem>
                </SelectContent>
              </Select>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs">Potvrzené datum</label>
                  <Input type="date" value={formConfirmedDate} onChange={(e) => setFormConfirmedDate(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs">Finální cena</label>
                  <Input type="number" value={formFinalPrice} onChange={(e) => setFormFinalPrice(e.target.value)} />
                </div>
              </div>
              <Textarea placeholder="Admin poznámka" value={formNote} onChange={(e) => setFormNote(e.target.value)} />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditBooking(null)}>Zrušit</Button>
            <Button onClick={saveBooking}>Uložit</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Admin;
