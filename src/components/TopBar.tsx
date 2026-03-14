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

  // Hide only on landing page for non-logged-in users
  if (location.pathname === "/" && !user) return null;

  const menuItems = [
    { path: "/shop", label: "Katalog dílů" },
    { path: "/service-book", label: "Servisní intervaly" },
    { path: "/vehicle-offer", label: "Nabídka vozu" },
  ];

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b border-border/40 bg-background/80 backdrop-blur-2xl safe-top">
      <div className="flex items-center gap-3">
        <button onClick={() => navigate("/")} className="flex items-center gap-2.5">
          <img src="/images/logo-cd-pardubice.png" alt="Chrysler&amp;Dodge Pardubice" className="h-11 object-contain" />
        </button>
        <nav className="hidden sm:flex items-center gap-1">
          {menuItems.map(item => (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition-colors ${
                location.pathname === item.path
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <DropdownMenu>
          <DropdownMenuTrigger className="sm:hidden flex items-center gap-1 px-2 py-1 rounded-xl text-sm text-muted-foreground hover:text-foreground">
            Menu <ChevronDown className="w-3.5 h-3.5" />
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
            className="p-2 rounded-xl hover:bg-secondary transition-colors"
            title="Admin panel"
          >
            <Shield className="w-5 h-5 text-primary" />
          </button>
        )}
        <button
          onClick={() => navigate("/cart")}
          className="relative p-2 rounded-xl hover:bg-secondary transition-colors"
        >
          <ShoppingCart className="w-5 h-5 text-foreground" />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full gradient-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
              {totalItems > 9 ? "9+" : totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
