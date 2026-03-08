import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Phone, Wrench, AlertTriangle, Battery, Thermometer, Gauge, CircleDot } from "lucide-react";
import TondaAvatar from "@/components/TondaAvatar";

const SERVICE_PHONE = "+420123456789";

const emergencyGuides = [
  {
    title: "Vybitá baterie",
    icon: Battery,
    steps: [
      "Zapněte výstražná světla",
      "Pokud máte startovací kabely, připojte je ke druhému vozidlu",
      "Červený kabel na + pól, černý na - pól (kostru)",
      "Nastartujte pomocné vozidlo, poté vaše",
      "Nechte motor běžet min. 15 minut",
      "Pokud se nezdaří, kontaktujte servis",
    ],
  },
  {
    title: "Přehřátý motor",
    icon: Thermometer,
    steps: [
      "OKAMŽITĚ zastavte na bezpečném místě",
      "NEVYPÍNEJTE motor ihned – nechte běžet na volnoběh",
      "Zapněte topení na maximum (odvede teplo)",
      "Počkejte na pokles teploty",
      "NEOTVÍREJTE chladič za horka!",
      "Kontaktujte servis – přehřátí může poškodit motor",
    ],
  },
  {
    title: "Problém se startováním",
    icon: Gauge,
    steps: [
      "Zkontrolujte, zda je řazení v P/N (automat) nebo neutrál",
      "Zkuste otočit klíčkem/stisknout start znovu",
      "Zkontrolujte, zda svítí kontrolky na palubní desce",
      "Pokud motor táhne ale nenaskočí – může být palivo",
      "Pokud neslyšíte nic – problém s baterií/startérem",
      "Kontaktujte servis pro diagnostiku",
    ],
  },
  {
    title: "Defekt pneumatiky",
    icon: CircleDot,
    steps: [
      "Zastavte na rovném a bezpečném místě",
      "Zapněte výstražná světla, postavte trojúhelník",
      "Použijte rezervu nebo opravnou sadu",
      "Utáhněte šrouby do kříže",
      "S rezervou jezděte max. 80 km/h",
      "Co nejdříve navštivte servis",
    ],
  },
];

const Emergency = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen pb-20">
      <PageHeader title="Pomoc při poruše" />
      <div className="p-4 max-w-lg mx-auto space-y-4">
        {/* Emergency header */}
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="p-4 text-center">
            <AlertTriangle className="w-10 h-10 mx-auto mb-2 text-destructive" />
            <h2 className="font-display font-bold text-lg">Nouzová pomoc</h2>
            <p className="text-xs text-muted-foreground mt-1">
              V případě poruchy nejdříve zajistěte bezpečnost – zastavte, zapněte výstražná světla.
            </p>
          </CardContent>
        </Card>

        {/* Quick actions */}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="destructive" className="h-16 flex-col gap-1" onClick={() => window.location.href = `tel:${SERVICE_PHONE}`}>
            <Phone className="w-5 h-5" />
            <span className="text-xs">Zavolat servis</span>
          </Button>
          <Button variant="default" className="h-16 flex-col gap-1" onClick={() => navigate("/ai-mechanic")}>
            <Bot className="w-5 h-5" />
            <span className="text-xs">AI Tonda</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => navigate("/service")}>
            <Wrench className="w-5 h-5" />
            <span className="text-xs">Objednat servis</span>
          </Button>
          <Button variant="outline" className="h-16 flex-col gap-1" onClick={() => navigate("/shop")}>
            <AlertTriangle className="w-5 h-5" />
            <span className="text-xs">Objednat díl</span>
          </Button>
        </div>

        {/* Emergency guides */}
        <h3 className="font-display font-semibold text-sm pt-2">Základní návody</h3>
        {emergencyGuides.map((guide, i) => (
          <motion.div key={guide.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <guide.icon className="w-5 h-5 text-primary" />
                  <h4 className="font-semibold text-sm">{guide.title}</h4>
                </div>
                <ol className="space-y-1.5">
                  {guide.steps.map((step, si) => (
                    <li key={si} className="text-xs text-muted-foreground flex gap-2">
                      <span className="font-bold text-foreground shrink-0">{si + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default Emergency;
