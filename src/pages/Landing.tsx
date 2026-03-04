import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { Car, Search, ShoppingCart } from "lucide-react";

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
        <div className="flex flex-col items-center gap-3">
          <div className="w-20 h-20 rounded-2xl gradient-primary flex items-center justify-center shadow-lg">
            <Car className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-gradient">Chrysler CZ</h1>
          <p className="text-muted-foreground text-sm text-center">
            Náhradní díly · Servis · Vozy k prodeji
          </p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="w-full glass-card p-6 space-y-4"
        >
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-primary" />
            <span className="text-sm">Tisíce originálních dílů skladem</span>
          </div>
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-5 h-5 text-primary" />
            <span className="text-sm">Objednávka na 2 kliknutí</span>
          </div>
        </motion.div>

        <div className="flex flex-col gap-3 w-full mt-2">
          <Button variant="hero" size="lg" className="w-full h-12 text-base" onClick={() => navigate("/auth")}>
            Přihlásit se
          </Button>
          <Button variant="outline-primary" size="lg" className="w-full h-12 text-base" onClick={() => navigate("/auth?mode=register")}>
            Registrace
          </Button>
          <button
            onClick={() => navigate("/shop")}
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
