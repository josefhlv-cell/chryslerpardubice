import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Search, ShoppingCart, Wrench } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import Dashboard from "@/components/dashboard/Dashboard";

const Landing = () => {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  // Show dashboard for logged-in users
  if (!isLoading && user) {
    return <Dashboard />;
  }

  return (
    <div className="min-h-screen flex flex-col gradient-dark overflow-hidden">
      {/* Hero */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 relative">
        {/* Background glow */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-3xl" />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex flex-col items-center gap-6 w-full max-w-sm relative z-10"
        >
          {/* Logo */}
          <motion.img
            src="/images/logo-cd-pardubice.png"
            alt="Chrysler&amp;Dodge Pardubice"
            className="w-[60vw] max-w-xs md:max-w-[280px] object-contain drop-shadow-2xl"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
          />

          <div className="text-center">
            <p className="text-muted-foreground text-sm tracking-widest uppercase">
              Originální díly · Servis · Prodej vozů
            </p>
          </div>

          {/* Feature cards */}
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="w-full space-y-2"
          >
            {[
              { icon: Search, text: "Nové i použité originální díly" },
              { icon: ShoppingCart, text: "Online objednávka na 2 kliknutí" },
              { icon: Wrench, text: "Značkový autoservis" },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
                className="glass-card px-4 py-3 flex items-center gap-3"
              >
                <item.icon className="w-4 h-4 text-primary shrink-0" />
                <span className="text-sm">{item.text}</span>
              </motion.div>
            ))}
          </motion.div>

          {/* Brand logos */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center gap-6 py-2"
          >
            {["/images/chrysler-wings.webp", "/images/dodge-logo.webp", "/images/ram-logo.webp"].map((src, i) => (
              <img key={i} src={src} alt="" className="h-8 object-contain opacity-40" />
            ))}
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="flex flex-col gap-3 w-full"
          >
            <Button variant="hero" size="lg" className="w-full h-12 text-base" onClick={() => navigate("/auth")}>
              Přihlásit se
            </Button>
            <Button variant="outline-primary" size="lg" className="w-full h-12 text-base" onClick={() => navigate("/auth?mode=register")}>
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
