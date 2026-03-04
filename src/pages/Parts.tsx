import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Package, Search } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Button } from "@/components/ui/button";

const Parts = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Díly" />
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <h2 className="font-display text-xl font-semibold mb-4">Co hledáte?</h2>
        </motion.div>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          onClick={() => navigate("/parts/new")}
          className="w-full glass-card p-5 flex items-center gap-4 text-left hover:border-primary/50 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl gradient-primary flex items-center justify-center shrink-0">
            <Search className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-display font-semibold">Nový díl</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Vyhledávejte v katalogu nových dílů</p>
          </div>
        </motion.button>

        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          onClick={() => navigate("/parts/used")}
          className="w-full glass-card p-5 flex items-center gap-4 text-left hover:border-primary/50 transition-colors"
        >
          <div className="w-12 h-12 rounded-xl bg-secondary flex items-center justify-center shrink-0">
            <Package className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h3 className="font-display font-semibold">Použitý díl</h3>
            <p className="text-sm text-muted-foreground mt-0.5">Vytvořte poptávku na použitý díl</p>
          </div>
        </motion.button>
      </div>
    </div>
  );
};

export default Parts;
