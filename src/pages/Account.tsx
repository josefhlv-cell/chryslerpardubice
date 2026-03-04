import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { User, ShoppingCart, Wrench, Percent, LogOut, ChevronRight } from "lucide-react";

const mockOrders = [
  { id: "ORD-001", item: "Brzdové destičky přední", date: "2025-02-15", status: "Doručeno", price: 2450, discount: 122 },
  { id: "ORD-002", item: "Olejový filtr", date: "2025-03-01", status: "Odesláno", price: 380, discount: 19 },
];

const mockReservations = [
  { id: "SRV-001", type: "Výměna oleje", date: "2025-03-15", status: "Potvrzeno", price: 2800, discount: 280 },
];

const Account = () => {
  const isLoggedIn = true; // mock
  const loyaltyActive = true;

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Můj účet" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        {/* Profile card */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-card p-5">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center">
              <User className="w-7 h-7 text-primary-foreground" />
            </div>
            <div className="flex-1">
              <h2 className="font-display font-semibold text-lg">Jan Novák</h2>
              <p className="text-sm text-muted-foreground">jan.novak@email.cz</p>
            </div>
          </div>
          {loyaltyActive && (
            <div className="mt-4 p-3 rounded-lg bg-primary/10 border border-primary/20">
              <div className="flex items-center gap-2">
                <Percent className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-primary">Věrnostní program aktivní</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">5 % sleva na díly · 10 % sleva na servis</p>
            </div>
          )}
        </motion.div>

        {/* Orders */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="flex items-center gap-2 mb-3">
            <ShoppingCart className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold">Historie objednávek</h3>
          </div>
          <div className="space-y-2">
            {mockOrders.map((order) => (
              <div key={order.id} className="glass-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{order.item}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{order.id} · {order.date}</p>
                  </div>
                  <Badge variant={order.status === "Doručeno" ? "default" : "secondary"} className="text-xs">
                    {order.status}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span>{order.price.toLocaleString("cs")} Kč</span>
                  {order.discount > 0 && (
                    <span className="text-xs text-primary">-{order.discount} Kč sleva</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Reservations */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <div className="flex items-center gap-2 mb-3">
            <Wrench className="w-4 h-4 text-primary" />
            <h3 className="font-display font-semibold">Aktivní rezervace</h3>
          </div>
          <div className="space-y-2">
            {mockReservations.map((res) => (
              <div key={res.id} className="glass-card p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{res.type}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{res.id} · {res.date}</p>
                  </div>
                  <Badge className="text-xs">{res.status}</Badge>
                </div>
                <div className="flex items-center justify-between mt-2 text-sm">
                  <span>{res.price.toLocaleString("cs")} Kč</span>
                  {res.discount > 0 && (
                    <span className="text-xs text-primary">-{res.discount} Kč sleva</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Logout */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Button variant="ghost" className="w-full justify-between text-muted-foreground">
            <span className="flex items-center gap-2"><LogOut className="w-4 h-4" />Odhlásit se</span>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </motion.div>
      </div>
    </div>
  );
};

export default Account;
