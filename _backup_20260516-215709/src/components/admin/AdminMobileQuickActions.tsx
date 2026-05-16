/**
 * AdminMobileQuickActions — mobilní zjednodušený view pro rychlé schvalování
 * objednávek a zakázek přes telefon. Velká tlačítka, swipe-friendly.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Check, X, RefreshCw, ShoppingCart, Wrench, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface QuickItem {
  id: string;
  type: "order" | "booking" | "fault";
  title: string;
  subtitle: string;
  meta: string;
  created_at: string;
  table: string;
}

const AdminMobileQuickActions = () => {
  const [items, setItems] = useState<QuickItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAll = async () => {
    setLoading(true);
    const [ordersR, bookingsR, faultsR] = await Promise.all([
      supabase.from("orders").select("id, part_name, oem_number, quantity, created_at, status, user_id").eq("status", "nova").order("created_at", { ascending: false }).limit(20),
      supabase.from("service_bookings").select("id, service_type, vehicle_brand, vehicle_model, preferred_date, created_at, status, user_id").eq("status", "pending").order("created_at", { ascending: false }).limit(20),
      supabase.from("fault_reports").select("id, vehicle_brand, vehicle_model, description, created_at, status, user_id").eq("status", "new").order("created_at", { ascending: false }).limit(20),
    ]);
    const all: QuickItem[] = [];
    (ordersR.data || []).forEach((o: any) =>
      all.push({
        id: o.id,
        type: "order",
        title: `🛒 ${o.part_name || "Díl"}`,
        subtitle: `OEM: ${o.oem_number || "—"} · ${o.quantity}×`,
        meta: "nová objednávka",
        created_at: o.created_at,
        table: "orders",
      }),
    );
    (bookingsR.data || []).forEach((b: any) =>
      all.push({
        id: b.id,
        type: "booking",
        title: `🛠️ ${b.service_type}`,
        subtitle: `${b.vehicle_brand || ""} ${b.vehicle_model || ""} · ${b.preferred_date}`,
        meta: "nová rezervace",
        created_at: b.created_at,
        table: "service_bookings",
      }),
    );
    (faultsR.data || []).forEach((f: any) =>
      all.push({
        id: f.id,
        type: "fault",
        title: `⚠️ ${f.vehicle_brand || ""} ${f.vehicle_model || ""}`,
        subtitle: (f.description || "").slice(0, 80),
        meta: "hlášení závady",
        created_at: f.created_at,
        table: "fault_reports",
      }),
    );
    all.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    setItems(all);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const approve = async (item: QuickItem) => {
    const newStatus =
      item.type === "order" ? "zpracovava_se" :
      item.type === "booking" ? "confirmed" : "in_progress";
    const { error } = await supabase.from(item.table as any).update({ status: newStatus }).eq("id", item.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "✅ Schváleno" });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  const reject = async (item: QuickItem) => {
    const newStatus = item.type === "order" ? "zrusena" : item.type === "booking" ? "cancelled" : "resolved";
    const { error } = await supabase.from(item.table as any).update({ status: newStatus }).eq("id", item.id);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({ title: "Zamítnuto" });
    setItems((prev) => prev.filter((i) => i.id !== item.id));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📱 Rychlé akce</h2>
        <Button size="sm" variant="outline" onClick={fetchAll}>
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Schvalování čekajících objednávek, rezervací a hlášení jedním tapem.
      </p>

      {!loading && items.length === 0 && (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            🎉 Žádné nové požadavky. Vše vyřízeno.
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {items.map((item) => (
          <Card key={`${item.type}-${item.id}`}>
            <CardContent className="p-3">
              <div className="flex items-start justify-between mb-2 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold">{item.title}</p>
                  <p className="text-xs text-muted-foreground line-clamp-2">{item.subtitle}</p>
                  <Badge variant="outline" className="text-[9px] mt-1">{item.meta}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button size="lg" variant="outline" className="border-destructive/40 hover:bg-destructive/10" onClick={() => reject(item)}>
                  <X className="w-4 h-4 mr-1" /> Zamítnout
                </Button>
                <Button size="lg" className="bg-success hover:bg-success/90" onClick={() => approve(item)}>
                  <Check className="w-4 h-4 mr-1" /> Schválit
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminMobileQuickActions;
