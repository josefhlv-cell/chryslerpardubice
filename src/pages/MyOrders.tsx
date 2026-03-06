import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import PageHeader from "@/components/PageHeader";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, ShoppingCart, Package } from "lucide-react";

interface Order {
  id: string;
  part_name: string | null;
  oem_number: string | null;
  order_type: string;
  quantity: number;
  unit_price: number | null;
  discounted_price: number | null;
  price_with_vat: number | null;
  discount_percent: number | null;
  status: string;
  customer_note: string | null;
  admin_note: string | null;
  created_at: string;
}

const statusColors: Record<string, string> = {
  nova: "bg-yellow-100 text-yellow-800 border-yellow-300",
  zpracovava_se: "bg-blue-100 text-blue-800 border-blue-300",
  vyrizena: "bg-green-100 text-green-800 border-green-300",
  zrusena: "bg-red-100 text-red-800 border-red-300",
};

const statusLabel: Record<string, string> = {
  nova: "Nová",
  zpracovava_se: "Zpracovává se",
  vyrizena: "Vyřízena",
  zrusena: "Zrušena",
};

const MyOrders = () => {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [authLoading, user, navigate]);

  useEffect(() => {
    if (!user) return;
    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
      setOrders((data as Order[]) || []);
      setLoading(false);
    };
    fetch();
  }, [user]);

  const fmtDate = (d: string) => new Date(d).toLocaleDateString("cs-CZ");

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Moje objednávky" />
      <div className="p-4 space-y-3 max-w-lg mx-auto">
        {orders.length === 0 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
            <ShoppingCart className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground text-sm">Zatím nemáte žádné objednávky</p>
          </motion.div>
        )}

        {orders.map((o, i) => (
          <motion.div
            key={o.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass-card p-4 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  {o.order_type === "new" ? (
                    <ShoppingCart className="w-3.5 h-3.5 text-primary shrink-0" />
                  ) : (
                    <Package className="w-3.5 h-3.5 text-accent shrink-0" />
                  )}
                  <h3 className="text-sm font-semibold truncate">{o.part_name || "–"}</h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  OEM: {o.oem_number || "–"} · {o.quantity}×
                </p>
                <p className="text-xs text-muted-foreground">{fmtDate(o.created_at)}</p>
              </div>
              <div className="text-right shrink-0">
                <Badge className={statusColors[o.status] || "bg-muted text-muted-foreground"}>
                  {statusLabel[o.status] || o.status}
                </Badge>
              </div>
            </div>

            {/* Pricing */}
            {o.order_type === "new" && o.unit_price != null && (
              <div className="space-y-0.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bez DPH:</span>
                  <span className="font-semibold">{o.unit_price.toLocaleString("cs")} Kč</span>
                </div>
                {o.discount_percent != null && o.discount_percent > 0 && o.discounted_price != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Po slevě ({o.discount_percent}%):</span>
                    <span className="font-semibold text-primary">{o.discounted_price.toLocaleString("cs")} Kč</span>
                  </div>
                )}
                {o.price_with_vat != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">S DPH:</span>
                    <span className="font-bold">{o.price_with_vat.toLocaleString("cs")} Kč</span>
                  </div>
                )}
              </div>
            )}

            {o.order_type === "used" && (
              <p className="text-xs text-muted-foreground italic">Poptávka – cena bude sdělena</p>
            )}

            {o.customer_note && (
              <p className="text-xs text-muted-foreground italic">"{o.customer_note}"</p>
            )}
            {o.admin_note && (
              <div className="text-xs bg-primary/10 rounded-lg p-2 border border-primary/20">
                <span className="font-medium">Odpověď:</span> {o.admin_note}
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default MyOrders;
