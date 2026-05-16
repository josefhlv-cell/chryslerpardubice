import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, TrendingUp, ShoppingCart, Wrench, Car, Star } from "lucide-react";

const AdminDashboardStats = () => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetch = async () => {
      const now = new Date();
      const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString();

      const [ordersRes, bookingsRes, serviceOrdersRes, reviewsRes, usersRes] = await Promise.all([
        supabase.from("orders").select("id, created_at, price_with_vat, status").gte("created_at", monthAgo),
        supabase.from("service_bookings").select("id, created_at, status").gte("created_at", monthAgo),
        supabase.from("service_orders").select("id, created_at, status, total_price").gte("created_at", monthAgo),
        supabase.from("service_reviews" as any).select("rating"),
        supabase.from("profiles").select("id"),
      ]);

      const orders = ordersRes.data || [];
      const bookings = bookingsRes.data || [];
      const serviceOrders = serviceOrdersRes.data || [];
      const reviews = (reviewsRes.data as any[]) || [];
      const users = usersRes.data || [];

      const totalRevenue = orders.reduce((s: number, o: any) => s + (o.price_with_vat || 0), 0)
        + serviceOrders.reduce((s: number, o: any) => s + (o.total_price || 0), 0);

      const avgRating = reviews.length > 0 ? (reviews.reduce((s: number, r: any) => s + r.rating, 0) / reviews.length) : 0;

      setStats({
        totalOrders: orders.length,
        totalBookings: bookings.length,
        totalServiceOrders: serviceOrders.length,
        completedServiceOrders: serviceOrders.filter((o: any) => o.status === "completed").length,
        totalRevenue: Math.round(totalRevenue),
        totalUsers: users.length,
        avgRating: avgRating.toFixed(1),
        reviewCount: reviews.length,
      });
      setLoading(false);
    };
    fetch();
  }, []);

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;

  const cards = [
    { label: "Tržby (30 dní)", value: `${stats.totalRevenue.toLocaleString("cs-CZ")} Kč`, icon: TrendingUp, color: "text-success" },
    { label: "Objednávky dílů", value: stats.totalOrders, icon: ShoppingCart, color: "text-primary" },
    { label: "Servisní zakázky", value: `${stats.completedServiceOrders}/${stats.totalServiceOrders}`, icon: Wrench, color: "text-blue-400" },
    { label: "Rezervace servisu", value: stats.totalBookings, icon: Car, color: "text-purple-400" },
    { label: "Hodnocení servisu", value: `${stats.avgRating} ⭐ (${stats.reviewCount})`, icon: Star, color: "text-primary" },
    { label: "Registrovaní uživatelé", value: stats.totalUsers, icon: Car, color: "text-cyan-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {cards.map((c, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <c.icon className={`w-4 h-4 ${c.color}`} />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{c.label}</span>
            </div>
            <p className="text-xl font-display font-bold">{c.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminDashboardStats;
