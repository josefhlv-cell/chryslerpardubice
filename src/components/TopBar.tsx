import { useLocation, useNavigate } from "react-router-dom";
import { ShoppingCart, Car } from "lucide-react";
import { useCart } from "@/contexts/CartContext";
import { cn } from "@/lib/utils";

const TopBar = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { totalItems } = useCart();

  if (location.pathname === "/") return null;

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between h-14 px-4 border-b border-border bg-background/95 backdrop-blur-xl safe-top">
      <button onClick={() => navigate("/shop")} className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
          <Car className="w-4 h-4 text-primary-foreground" />
        </div>
        <span className="font-display font-bold text-sm">Chrysler CZ</span>
      </button>

      <button
        onClick={() => navigate("/cart")}
        className="relative p-2 rounded-lg hover:bg-secondary transition-colors"
      >
        <ShoppingCart className="w-5 h-5 text-foreground" />
        {totalItems > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full gradient-primary text-[10px] font-bold text-primary-foreground flex items-center justify-center">
            {totalItems > 9 ? "9+" : totalItems}
          </span>
        )}
      </button>
    </header>
  );
};

export default TopBar;
