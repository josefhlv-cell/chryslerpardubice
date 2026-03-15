import { useLocation, useNavigate } from "react-router-dom";
import { Home, CircleDot, Search, Bell, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const navItems = [
  { path: "/", icon: Home },
  { path: "/my-service-orders", icon: CircleDot },
  { path: "/shop", icon: Search },
  { path: "/notifications", icon: Bell },
  { path: "/account", icon: Settings },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { employee, user } = useAuth();

  if (location.pathname === "/" && !user) return null;
  if (location.pathname.startsWith("/checkout")) return null;
  if (employee && employee.role !== "admin") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/20 bg-background/95 backdrop-blur-xl safe-bottom">
      <div className="flex items-center justify-around h-[56px] max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = item.path === "/"
            ? location.pathname === "/" || location.pathname === "/index"
            : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "relative flex items-center justify-center w-12 h-10 transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
