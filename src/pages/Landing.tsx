import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Search, ShoppingCart, Wrench, ChevronRight } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Shop from "@/pages/Shop";

const Landing = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  // Show parts catalog directly for logged-in users
  if (!isLoading && user) {
    return <Shop />;
  }

  return (
    <div className="min-h-screen flex flex-col gradient-dark overflow-hidden">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-primary/4 rounded-full blur-[120px]" />
          <div className="absolute bottom-1/4 left-1/3 w-[300px] h-[300px] bg-primary/3 rounded-full blur-[80px]" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col items-center gap-8 w-full max-w-sm relative z-10"
        >
          {/* Logo */}
          <motion.img
            src="/images/logo-cd-pardubice.png"
            alt="Chrysler&amp;Dodge Pardubice"
            className="w-[55vw] max-w-[260px] object-contain drop-shadow-2xl"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.6 }}
          />

          <div className="text-center space-y-2">
            <h1 className="font-display font-bold text-2xl">
              Váš prémiový autoservis
            </h1>
            <p className="text-muted-foreground text-sm">
              Originální díly · Servis · Prodej vozů
            </p>
          </div>

          {/* Feature cards */}
          <div className="w-full space-y-2.5">
            {[
              { icon: Search, text: "Nové i použité originální díly", sub: "Přes 10 000 dílů skladem" },
              { icon: ShoppingCart, text: "Online objednávka", sub: "Rychle a jednoduše" },
              { icon: Wrench, text: "Značkový autoservis", sub: "Certifikovaní mechanici" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="glass-card px-4 py-3.5 flex items-center gap-3.5"
              >
                <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <item.icon className="w-4 h-4 text-primary" />
                </div>
                <div className="flex-1">
                  <span className="text-sm font-medium">{item.text}</span>
                  <p className="text-[11px] text-muted-foreground">{item.sub}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
              </motion.div>
            ))}
          </div>

          {/* Brand logos */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-8 py-2"
          >
            {["/images/chrysler-wings.webp", "/images/dodge-logo.webp", "/images/ram-logo.webp"].map((src, i) => (
              <img key={i} src={src} alt="" className="h-7 object-contain opacity-30 hover:opacity-50 transition-opacity" />
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="flex flex-col gap-3 w-full"
          >
            <Button size="lg" className="w-full h-13 text-base font-display font-semibold rounded-2xl" onClick={() => navigate("/auth")}>
              Přihlásit se
            </Button>
            <Button variant="outline" size="lg" className="w-full h-13 text-base font-display font-semibold rounded-2xl border-border/60" onClick={() => navigate("/auth?mode=register")}>
              Registrace
            </Button>
            <button
              onClick={() => navigate("/shop")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1 text-center"
            >
              Pokračovat jako host →
            </button>
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
};

export default Landing;
