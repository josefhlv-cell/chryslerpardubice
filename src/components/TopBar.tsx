import { useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, Shield, ChevronDown } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const TopBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const { isAdmin, user } = useAuth();

  if (location.pathname === "/" && !user) return null;

  const menuItems = [
    { path: "/shop", label: "Katalog dílů" },
    { path: "/vehicles", label: "Vozy k prodeji" },
    { path: "/service", label: "Servis" },
    { path: "/vehicle-offer", label: "Výkup / Dovoz" },
  ];

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b border-border/20 bg-background/95 backdrop-blur-xl safe-top">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
          <img src="/images/logo-cd-pardubice.png" alt="Chrysler&amp;Dodge Pardubice" className="h-10 object-contain" />
        </button>
        <nav className="hidden sm:flex items-center gap-1">
          {menuItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium tracking-wide transition-colors ${
                location.pathname === item.path
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-lg text-xs text-muted-foreground hover:text-foreground">
            Menu <ChevronDown className="w-3 h-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {menuItems.map(item => (
              <DropdownMenuItem key={item.path} onClick={() => navigate(item.path)}>
                {item.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-1">
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="p-2 rounded-lg hover:bg-card/50 transition-colors"
            title="Admin panel"
          >
            <Shield className="w-4.5 h-4.5 text-primary" />
          </button>
        )}
        <button
          onClick={() => navigate("/cart")}
          className="relative p-2 rounded-lg hover:bg-card/50 transition-colors"
        >
          <ShoppingCart className="w-4.5 h-4.5 text-foreground" />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4.5 h-4.5 rounded-full gradient-bronze text-[9px] font-bold text-white flex items-center justify-center">
              {totalItems > 9 ? "9+" : totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
