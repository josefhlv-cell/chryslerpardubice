import { useLocation, useNavigate } from "react-router-dom";
import { Search, Wrench, Car, User, Phone } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { path: "/shop", label: "Díly", icon: Search },
  { path: "/service", label: "Servis", icon: Wrench },
  { path: "/vehicles", label: "Vozy", icon: Car },
  { path: "/contact", label: "Kontakt", icon: Phone },
  { path: "/account", label: "Účet", icon: User },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  if (location.pathname === "/" || location.pathname.startsWith("/checkout")) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-xl safe-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto">
        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.path);
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={cn(
                "flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all duration-200",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <item.icon className={cn("w-5 h-5 transition-all", isActive && "drop-shadow-[0_0_6px_hsl(213,70%,45%)]")} />
              <span className="text-[10px] font-medium tracking-wide">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
