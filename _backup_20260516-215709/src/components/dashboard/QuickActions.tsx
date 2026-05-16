import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, Wrench, Car, AlertTriangle, Activity } from "lucide-react";

const actions = [
  {
    icon: Search,
    label: "Díly",
    path: "/shop",
  },
  {
    icon: Wrench,
    label: "Servis",
    path: "/service",
  },
  {
    icon: Activity,
    label: "OBD",
    path: "/obd",
  },
  {
    icon: Car,
    label: "Vozy",
    path: "/my-vehicles",
  },
  {
    icon: AlertTriangle,
    label: "SOS",
    path: "/emergency",
  },
];

const QuickActions = () => {
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="flex justify-between gap-1"
    >
      {actions.map((action) => (
        <button
          key={action.path}
          onClick={() => navigate(action.path)}
          className="flex flex-col items-center gap-2 py-3 flex-1 rounded-lg hover:bg-card/50 transition-all duration-200 active:scale-[0.97] group"
        >
          <div className="w-11 h-11 rounded-lg border border-border/40 flex items-center justify-center group-hover:border-primary/30 transition-colors">
            <action.icon className="w-4.5 h-4.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
          <span className="text-[10px] font-medium tracking-wide uppercase text-muted-foreground group-hover:text-foreground transition-colors">
            {action.label}
          </span>
        </button>
      ))}
    </motion.div>
  );
};

export default QuickActions;
