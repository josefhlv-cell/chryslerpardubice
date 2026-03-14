import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Wrench, Car, AlertTriangle, Activity } from "lucide-react";

const actions = [
  {
    icon: Search,
    label: "Katalog dílů",
    desc: "Originální díly",
    path: "/shop",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    icon: Wrench,
    label: "Servis",
    desc: "Objednat servis",
    path: "/service",
    color: "text-warning",
    bg: "bg-warning/10",
  },
  {
    icon: Activity,
    label: "OBD",
    desc: "Diagnostika",
    path: "/obd",
    color: "text-success",
    bg: "bg-success/10",
  },
  {
    icon: Car,
    label: "Moje vozy",
    desc: "Správa vozidel",
    path: "/my-vehicles",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    icon: AlertTriangle,
    label: "SOS",
    desc: "Porucha na cestě",
    path: "/emergency",
    color: "text-destructive",
    bg: "bg-destructive/10",
  },
];

const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-5 gap-2">
      {actions.map((action, i) => (
        <motion.button
          key={action.path}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.05 }}
          onClick={() => navigate(action.path)}
          className="flex flex-col items-center gap-2 py-3 rounded-2xl hover:bg-card/60 transition-all duration-200 active:scale-[0.96] group"
        >
          <div className={`w-12 h-12 rounded-2xl ${action.bg} flex items-center justify-center transition-all group-hover:scale-105`}>
            <action.icon className={`w-5 h-5 ${action.color}`} />
          </div>
          <span className="font-display font-medium text-[11px] text-center leading-tight">{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
};

export default QuickActions;
