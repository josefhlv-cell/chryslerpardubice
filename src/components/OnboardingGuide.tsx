import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, Wrench, Car, MessageCircle, ShoppingCart } from "lucide-react";

const steps = [
  {
    icon: Search,
    title: "Katalog náhradních dílů",
    desc: "Vyhledejte díly podle OEM čísla, názvu nebo vozidla. Porovnejte ceny a objednejte přímo.",
  },
  {
    icon: Wrench,
    title: "Online servis",
    desc: "Zarezervujte si termín servisu online. Sledujte průběh opravy v reálném čase.",
  },
  {
    icon: Car,
    title: "Vaše garáž",
    desc: "Přidejte si vozidla, sledujte historii servisu a plány údržby.",
  },
  {
    icon: MessageCircle,
    title: "AI Mechanik Tonda",
    desc: "Popište problém a Tonda vám poradí s diagnostikou a doporučí díly.",
  },
  {
    icon: ShoppingCart,
    title: "Nákup a objednávky",
    desc: "Objednávejte díly přímo z katalogu. Firemní zákazníci získají slevy.",
  },
];

const OnboardingGuide = () => {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem("onboarding_seen");
    if (!seen) {
      const timer = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setOpen(false);
    localStorage.setItem("onboarding_seen", "true");
  };

  const handleNext = () => {
    if (step < steps.length - 1) setStep(s => s + 1);
    else handleClose();
  };

  const current = steps[step];
  const Icon = current.icon;

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Icon className="w-5 h-5 text-primary" />
            </div>
            {current.title}
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground leading-relaxed">{current.desc}</p>
        <div className="flex justify-center gap-1.5 py-2">
          {steps.map((_, i) => (
            <div key={i} className={`w-2 h-2 rounded-full transition-colors ${i === step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>
        <DialogFooter className="flex-row gap-2">
          <Button variant="ghost" size="sm" onClick={handleClose}>Přeskočit</Button>
          <Button size="sm" onClick={handleNext}>
            {step < steps.length - 1 ? "Další" : "Začít"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default OnboardingGuide;
