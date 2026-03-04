import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useCart } from "@/contexts/CartContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft, ArrowRight, Check, Truck, MapPin, Package } from "lucide-react";
import { toast } from "sonner";

const Checkout = () => {
  const navigate = useNavigate();
  const { items, totalPrice, discountPercent, clearCart } = useCart();
  const [step, setStep] = useState<1 | 2>(1);

  // Form state
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [shipping, setShipping] = useState("pickup");

  const discountAmount = Math.round(totalPrice * (discountPercent / 100));
  const shippingCost = shipping === "pickup" ? 0 : shipping === "dpd" ? 149 : 129;
  const finalPrice = totalPrice - discountAmount + shippingCost;

  if (items.length === 0) {
    navigate("/shop");
    return null;
  }

  const validateStep1 = () => {
    if (!name.trim() || !email.trim() || !phone.trim()) {
      toast.error("Vyplňte jméno, email a telefon");
      return false;
    }
    if (shipping !== "pickup" && (!street.trim() || !city.trim() || !zip.trim())) {
      toast.error("Vyplňte doručovací adresu");
      return false;
    }
    return true;
  };

  const handleConfirm = () => {
    toast.success("Objednávka odeslána! Potvrzení obdržíte na email.");
    clearCart();
    navigate("/shop");
  };

  return (
    <div className="min-h-screen gradient-dark">
      <div className="sticky top-0 z-50 flex items-center gap-3 h-14 px-4 border-b border-border bg-background/95 backdrop-blur-xl safe-top">
        <button
          onClick={() => (step === 1 ? navigate("/cart") : setStep(1))}
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="font-display font-semibold">Objednávka</h1>
        <div className="flex-1" />
        {/* Progress */}
        <div className="flex items-center gap-1.5">
          <div className="w-8 h-1.5 rounded-full gradient-primary" />
          <div className={`w-8 h-1.5 rounded-full transition-all ${step === 2 ? "gradient-primary" : "bg-secondary"}`} />
        </div>
      </div>

      <div className="p-4 max-w-lg mx-auto">
        {step === 1 ? (
          <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
            {/* Contact */}
            <div className="space-y-3">
              <h2 className="font-display font-semibold text-lg">Kontaktní údaje</h2>
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Jméno a příjmení *</Label>
                  <Input placeholder="Jan Novák" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Email *</Label>
                    <Input type="email" placeholder="jan@email.cz" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Telefon *</Label>
                    <Input type="tel" placeholder="+420..." value={phone} onChange={(e) => setPhone(e.target.value)} />
                  </div>
                </div>
              </div>
            </div>

            {/* Shipping */}
            <div className="space-y-3">
              <h2 className="font-display font-semibold text-lg">Doprava</h2>
              <RadioGroup value={shipping} onValueChange={setShipping} className="space-y-2">
                {[
                  { value: "pickup", label: "Osobní odběr", desc: "Chrysler CZ, Praha", price: "Zdarma", icon: MapPin },
                  { value: "dpd", label: "DPD", desc: "Doručení 1–2 dny", price: "149 Kč", icon: Truck },
                  { value: "zasilkovna", label: "Zásilkovna", desc: "Výdejní místo", price: "129 Kč", icon: Package },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`glass-card p-4 flex items-center gap-3 cursor-pointer transition-colors ${
                      shipping === opt.value ? "border-primary/50" : ""
                    }`}
                  >
                    <RadioGroupItem value={opt.value} />
                    <opt.icon className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1">
                      <p className="text-sm font-semibold">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                    <span className="text-sm font-semibold">{opt.price}</span>
                  </label>
                ))}
              </RadioGroup>

              {shipping !== "pickup" && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="space-y-2 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Ulice a č.p. *</Label>
                    <Input placeholder="Hlavní 123" value={street} onChange={(e) => setStreet(e.target.value)} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
                      <Label className="text-xs text-muted-foreground">Město *</Label>
                      <Input placeholder="Praha" value={city} onChange={(e) => setCity(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">PSČ *</Label>
                      <Input placeholder="11000" value={zip} onChange={(e) => setZip(e.target.value)} />
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            <Button
              variant="hero"
              className="w-full h-12 text-base"
              onClick={() => {
                if (validateStep1()) setStep(2);
              }}
            >
              Pokračovat ke shrnutí
              <ArrowRight className="w-4 h-4" />
            </Button>
          </motion.div>
        ) : (
          <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-5">
            <h2 className="font-display font-semibold text-lg">Shrnutí objednávky</h2>

            {/* Contact summary */}
            <div className="glass-card p-4 space-y-1 text-sm">
              <p className="font-semibold">{name}</p>
              <p className="text-muted-foreground">{email} · {phone}</p>
              {shipping !== "pickup" && (
                <p className="text-muted-foreground">{street}, {city} {zip}</p>
              )}
              <p className="text-xs text-primary mt-1">
                {shipping === "pickup" ? "Osobní odběr" : shipping === "dpd" ? "DPD" : "Zásilkovna"}
              </p>
            </div>

            {/* Items */}
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="glass-card p-3 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-xs text-muted-foreground">{item.quantity}× {item.price.toLocaleString("cs")} Kč</p>
                  </div>
                  <span className="text-sm font-semibold">
                    {(item.price * item.quantity).toLocaleString("cs")} Kč
                  </span>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="glass-card p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Mezisoučet</span>
                <span>{totalPrice.toLocaleString("cs")} Kč</span>
              </div>
              {discountAmount > 0 && (
                <div className="flex justify-between text-primary">
                  <span>Věrnostní sleva ({discountPercent} %)</span>
                  <span>-{discountAmount.toLocaleString("cs")} Kč</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Doprava</span>
                <span>{shippingCost === 0 ? "Zdarma" : `${shippingCost} Kč`}</span>
              </div>
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold text-base">Celkem</span>
                <span className="text-xl font-display font-bold text-gradient">
                  {finalPrice.toLocaleString("cs")} Kč
                </span>
              </div>
            </div>

            <Button variant="hero" className="w-full h-12 text-base" onClick={handleConfirm}>
              <Check className="w-4 h-4" />
              Potvrdit objednávku
            </Button>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default Checkout;
