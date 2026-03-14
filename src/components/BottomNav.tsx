import { useLocation, useNavigate } from "react-router-dom";
import { Home, Wrench, Car, User } from "lucide-react";
import { cn } from "@/lib/utils";
import TondaAvatar from "@/components/TondaAvatar";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const navItems = [
  { path: "/", label: "Domů", icon: Home },
  { path: "/my-service-orders", label: "Servis", icon: Wrench },
  { path: "/ai-mechanic", label: "Tonda", icon: null },
  { path: "/vehicles", label: "Vozy", icon: Car },
  { path: "/account", label: "Účet", icon: User },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { employee } = useAuth();

  // Hide for landing, checkout, and employee roles (mechanics, parts_sales, car_sales)
  if (location.pathname === "/" && !user) return null;
  if (location.pathname.startsWith("/checkout")) return null;
  if (employee && employee.role !== "admin") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/50 bg-background/90 backdrop-blur-2xl safe-bottom">
      <div className="flex items-center justify-around h-[68px] max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = item.path === "/shop"
            ? location.pathname === "/shop" || location.pathname === "/index"
            : location.pathname.startsWith(item.path);
          const isTonda = !item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "relative flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              {isTonda ? (
                <div className={cn(
                  "w-10 h-10 -mt-4 rounded-full border-2 flex items-center justify-center transition-all",
                  isActive
                    ? "border-primary bg-primary/10 glow-primary"
                    : "border-border bg-card"
                )}>
                  <TondaAvatar size="nav" />
                </div>
              ) : (
                <item.icon className={cn(
                  "w-5 h-5 transition-all",
                  isActive && "drop-shadow-[0_0_8px_hsl(347,77%,50%)]"
                )} />
              )}
              <span className={cn(
                "text-[10px] font-medium tracking-wide",
                isTonda && "-mt-0.5"
              )}>{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
