import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Minus, Plus, Trash2, ShoppingBag, ArrowLeft } from "lucide-react";

const Cart = () => {
  const navigate = useNavigate();
  const { items, updateQuantity, removeItem, totalPrice, discountPercent, clearCart } = useCart();

  const discountAmount = Math.round(totalPrice * (discountPercent / 100));
  const finalPrice = totalPrice - discountAmount;

  if (items.length === 0) {
    return (
      <div className="min-h-screen pb-20">
        <div className="flex flex-col items-center justify-center h-[60vh] px-6 text-center">
          <ShoppingBag className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h2 className="font-display text-xl font-semibold mb-2">Košík je prázdný</h2>
          <p className="text-sm text-muted-foreground mb-6">Přidejte díly z katalogu</p>
          <Button variant="hero" onClick={() => navigate("/shop")}>
            Procházet díly
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <div className="p-4 space-y-4 max-w-lg mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button onClick={() => navigate(-1)} className="p-1 text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="font-display text-xl font-bold">Košík</h1>
          <span className="text-sm text-muted-foreground">({items.length})</span>
        </div>

        {/* Items */}
        <div className="space-y-2">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass-card p-4 flex items-center gap-3"
            >
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold truncate">{item.name}</h3>
                <p className="text-xs text-muted-foreground">OEM: {item.oem}</p>
                <p className="text-sm font-display font-bold text-gradient mt-1">
                  {(item.price * item.quantity).toLocaleString("cs")} Kč
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => updateQuantity(item.id, item.quantity - 1)}
                  className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="w-8 text-center text-sm font-semibold">{item.quantity}</span>
                <button
                  onClick={() => updateQuantity(item.id, item.quantity + 1)}
                  className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center hover:bg-secondary/80"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeItem(item.id)}
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-destructive hover:bg-destructive/10 ml-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Summary */}
        <div className="glass-card p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Mezisoučet</span>
            <span>{totalPrice.toLocaleString("cs")} Kč</span>
          </div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-primary">Věrnostní sleva ({discountPercent} %)</span>
              <span className="text-primary">-{discountAmount.toLocaleString("cs")} Kč</span>
            </div>
          )}
          <div className="border-t border-border pt-2 flex justify-between">
            <span className="font-semibold">Celkem</span>
            <span className="text-xl font-display font-bold text-gradient">
              {finalPrice.toLocaleString("cs")} Kč
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <Button variant="hero" className="w-full h-12 text-base" onClick={() => navigate("/checkout")}>
            Pokračovat k objednávce
          </Button>
          <Button variant="ghost" className="w-full text-sm text-muted-foreground" onClick={clearCart}>
            Vysypat košík
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Cart;
