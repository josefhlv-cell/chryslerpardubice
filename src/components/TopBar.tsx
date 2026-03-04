import { useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, Shield } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { useAuth } from "@/contexts/AuthContext";

const TopBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();
  const { isAdmin } = useAuth();

  if (location.pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b border-border bg-background/95 backdrop-blur-xl safe-top">
      <button onClick={() => navigate("/shop")} className="flex items-center gap-2.5">
        <img src="/images/logo_chrysler.webp" alt="Chrysler CZ" className="h-8 object-contain" />
      </button>

      <div className="flex items-center gap-1">
        {isAdmin && (
          <button
            onClick={() => navigate("/admin")}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            title="Admin panel"
          >
            <Shield className="w-5 h-5 text-primary" />
          </button>
        )}
        <button
          onClick={() => navigate("/cart")}
          className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
        >
          <ShoppingCart className="w-5 h-5 text-foreground" />
          {totalItems > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full gradient-accent text-[10px] font-bold text-accent-foreground flex items-center justify-center">
              {totalItems > 9 ? "9+" : totalItems}
            </span>
          )}
        </button>
      </div>
    </header>
  );
};

export default TopBar;
