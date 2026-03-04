import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Car, Wrench, Settings } from "lucide-react";

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 gradient-dark">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center gap-8 w-full max-w-sm"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
            <Car className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-gradient">Chrysler CZ</h1>
          <p className="text-muted-foreground text-sm text-center">
            Díly · Servis · Vozy k prodeji
          </p>
        </div>

        {/* Features preview */}
        <div className="grid grid-cols-3 gap-3 w-full">
          {[
            { icon: Settings, label: "Díly" },
            { icon: Wrench, label: "Servis" },
            { icon: Car, label: "Vozy" },
          ].map((item, i) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
              className="glass-card p-4 flex flex-col items-center gap-2"
            >
              <item.icon className="w-6 h-6 text-primary" />
              <span className="text-xs text-muted-foreground">{item.label}</span>
            </motion.div>
          ))}
        </div>

        {/* Auth Buttons */}
        <div className="flex flex-col gap-3 w-full mt-4">
          <Button variant="hero" size="lg" className="w-full h-12 text-base" onClick={() => navigate("/parts")}>
            Přihlásit se
          </Button>
          <Button variant="outline-primary" size="lg" className="w-full h-12 text-base" onClick={() => navigate("/parts")}>
            Registrace
          </Button>
          <button
            onClick={() => navigate("/parts")}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors mt-1"
          >
            Pokračovat jako host →
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default Landing;
