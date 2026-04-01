import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, ShoppingCart, Wrench, Car, AlertTriangle, 
  MessageSquare, ArrowDownUp, Bot, CalendarCheck, TrendingUp
} from "lucide-react";

interface DailyStats {
  newUsers: number;
  newOrders: number;
  newBookings: number;
  newServiceOrders: number;
  completedServiceOrders: number;
  newFaultReports: number;
  newBuybackRequests: number;
  newImportRequests: number;
  newVehicleInquiries: number;
  newUsedPartRequests: number;
  aiConversations: number;
  revenue: number;
}

const STORAGE_KEY = "admin_daily_report_last_seen";

const AdminDailyReport = () => {
  const { user, isAdmin, isLoading } = useAuth();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState<DailyStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportDate, setReportDate] = useState("");

  useEffect(() => {
    if (isLoading || !user || !isAdmin) return;

    const today = new Date().toISOString().slice(0, 10);
    const lastSeen = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);

    if (lastSeen === today) return;

    fetchYesterdayStats();
  }, [user, isAdmin, isLoading]);

  const fetchYesterdayStats = async () => {
    setLoading(true);

    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yStart = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate()).toISOString();
    const yEnd = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate() + 1).toISOString();

    setReportDate(yesterday.toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" }));

    try {
      const [
        usersRes, ordersRes, bookingsRes, serviceOrdersRes,
        faultRes, buybackRes, importRes, inquiryRes, usedPartsRes, aiRes
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("orders").select("id, price_with_vat", { count: "exact" }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("service_bookings").select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("service_orders").select("id, status, total_price").gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("fault_reports").select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("vehicle_buyback_requests" as any).select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("vehicle_import_requests" as any).select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("vehicle_inquiries").select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("used_part_requests").select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
        supabase.from("ai_conversations" as any).select("id", { count: "exact", head: true }).gte("created_at", yStart).lt("created_at", yEnd),
      ]);

      const orders = ordersRes.data || [];
      const serviceOrders = serviceOrdersRes.data || [];
      const orderRevenue = orders.reduce((s: number, o: any) => s + (o.price_with_vat || 0), 0);
      const serviceRevenue = serviceOrders.reduce((s: number, o: any) => s + (o.total_price || 0), 0);

      setStats({
        newUsers: usersRes.count || 0,
        newOrders: ordersRes.count || orders.length,
        newBookings: bookingsRes.count || 0,
        newServiceOrders: serviceOrders.length,
        completedServiceOrders: serviceOrders.filter((o: any) => o.status === "completed").length,
        newFaultReports: faultRes.count || 0,
        newBuybackRequests: buybackRes.count || 0,
        newImportRequests: importRes.count || 0,
        newVehicleInquiries: inquiryRes.count || 0,
        newUsedPartRequests: usedPartsRes.count || 0,
        aiConversations: aiRes.count || 0,
        revenue: Math.round(orderRevenue + serviceRevenue),
      });

      setOpen(true);
    } catch (e) {
      console.error("[AdminDailyReport] fetch error", e);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    if (user) {
      const today = new Date().toISOString().slice(0, 10);
      localStorage.setItem(`${STORAGE_KEY}_${user.id}`, today);
    }
  };

  if (!stats) return null;

  const hasActivity = Object.values(stats).some(v => v > 0);

  const rows = [
    { icon: TrendingUp, label: "Tržby", value: `${stats.revenue.toLocaleString("cs-CZ")} Kč`, highlight: stats.revenue > 0 },
    { icon: Users, label: "Noví uživatelé", value: stats.newUsers, highlight: stats.newUsers > 0 },
    { icon: ShoppingCart, label: "Objednávky dílů", value: stats.newOrders, highlight: stats.newOrders > 0 },
    { icon: CalendarCheck, label: "Rezervace servisu", value: stats.newBookings, highlight: stats.newBookings > 0 },
    { icon: Wrench, label: "Servisní zakázky", value: `${stats.completedServiceOrders}/${stats.newServiceOrders}`, highlight: stats.newServiceOrders > 0 },
    { icon: ArrowDownUp, label: "Výkup vozů", value: stats.newBuybackRequests, highlight: stats.newBuybackRequests > 0 },
    { icon: Car, label: "Dovoz vozů", value: stats.newImportRequests, highlight: stats.newImportRequests > 0 },
    { icon: MessageSquare, label: "Zájem o vozy", value: stats.newVehicleInquiries, highlight: stats.newVehicleInquiries > 0 },
    { icon: MessageSquare, label: "Poptávky použitých dílů", value: stats.newUsedPartRequests, highlight: stats.newUsedPartRequests > 0 },
    { icon: AlertTriangle, label: "OBD hlášení", value: stats.newFaultReports, highlight: stats.newFaultReports > 0 },
  ];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Bot className="w-5 h-5 text-primary" />
            Denní report
          </DialogTitle>
          <p className="text-xs text-muted-foreground capitalize">{reportDate}</p>
        </DialogHeader>

        {!hasActivity ? (
          <p className="text-sm text-muted-foreground text-center py-4">Včera nebyla žádná aktivita.</p>
        ) : (
          <div className="space-y-1.5 max-h-[60vh] overflow-y-auto">
            {rows.map((row, i) => (
              <div
                key={i}
                className={`flex items-center justify-between py-2 px-3 rounded-lg text-sm ${
                  row.highlight ? "bg-primary/5" : ""
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <row.icon className={`w-4 h-4 shrink-0 ${row.highlight ? "text-primary" : "text-muted-foreground"}`} />
                  <span className={row.highlight ? "font-medium" : "text-muted-foreground"}>{row.label}</span>
                </div>
                {row.highlight ? (
                  <Badge variant="secondary" className="text-xs font-semibold">{row.value}</Badge>
                ) : (
                  <span className="text-xs text-muted-foreground">{row.value}</span>
                )}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">Rozumím</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdminDailyReport;
