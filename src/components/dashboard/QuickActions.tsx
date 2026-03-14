import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Wrench, Car, AlertTriangle } from "lucide-react";

const actions = [
  {
    icon: Search,
    label: "Katalog dílů",
    desc: "Hledat originální díly",
    path: "/shop",
    gradient: "from-primary to-primary/70",
  },
  {
    icon: Wrench,
    label: "Servis",
    desc: "Objednat servis",
    path: "/service",
    gradient: "from-accent to-accent/70",
  },
  {
    icon: Car,
    label: "Moje vozy",
    desc: "Správa vozidel",
    path: "/my-vehicles",
    gradient: "from-success to-success/70",
  },
  {
    icon: AlertTriangle,
    label: "SOS",
    desc: "Porucha na cestě",
    path: "/emergency",
    gradient: "from-destructive to-destructive/70",
  },
];

const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 gap-3">
      {actions.map((action, i) => (
        <motion.button
          key={action.path}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.07 }}
          onClick={() => navigate(action.path)}
          className="glass-card p-4 flex flex-col items-start gap-3 text-left hover:border-primary/30 transition-all duration-200 active:scale-[0.98] group"
        >
          <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${action.gradient} flex items-center justify-center shadow-lg`}>
            <action.icon className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <p className="font-display font-semibold text-sm">{action.label}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">{action.desc}</p>
          </div>
        </motion.button>
      ))}
    </div>
  );
};

export default QuickActions;
