import { forwardRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Search, Wrench, Car, Warehouse, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { motion } from "framer-motion";

const navItems = [
  { path: "/", icon: Search, label: "Díly" },
  { path: "/service", icon: Wrench, label: "Servis" },
  { path: "/vehicles", icon: Car, label: "Vozy" },
  { path: "/garage", icon: Warehouse, label: "Garáž" },
  { path: "/account", icon: User, label: "Účet" },
];

const BottomNav = forwardRef<HTMLElement>((_, ref) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { employee, user } = useAuth();

  if (location.pathname === "/" && !user) return null;
  if (location.pathname.startsWith("/checkout")) return null;
  if (employee && employee.role !== "admin") return null;

  const isActive = (path: string) => {
    if (path === "/") {
      return location.pathname === "/" || location.pathname === "/index" || location.pathname === "/shop";
    }
    if (path === "/garage") {
      return ["/garage", "/my-vehicles", "/my-service-orders", "/service-book", "/service-plan", "/obd", "/epc", "/emergency", "/ai-mechanic", "/orders", "/notifications"].some(p => location.pathname.startsWith(p));
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav ref={ref} className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/20 bg-background/95 backdrop-blur-xl safe-bottom lg:hidden">
      <div className="flex items-center justify-around h-[60px] max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path === "/" ? "/shop" : item.path)}
              aria-label={item.label}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex flex-col items-center justify-center gap-0.5 w-14 h-12 transition-all duration-200",
                active
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {active && (
                <motion.div
                  layoutId="nav-indicator"
                  className="absolute -top-px left-1/2 -translate-x-1/2 w-5 h-[2px] rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 380, damping: 30 }}
                />
              )}
              <Icon className="w-5 h-5" />
              <span className="text-[9px] font-medium tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
});

BottomNav.displayName = "BottomNav";

export default BottomNav;
