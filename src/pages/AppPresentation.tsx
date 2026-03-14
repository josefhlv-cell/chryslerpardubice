import { motion } from "framer-motion";
import { 
  Bot, Car, Wrench, BookOpen, ShoppingCart, Shield, 
  AlertTriangle, Users, BarChart3, Smartphone, 
  CheckCircle2, ArrowRight, Calendar, Camera,
  FileDown, Presentation, ChevronDown
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import heroImg from "@/assets/presentation/hero-car.jpg";
import aiMechanicImg from "@/assets/presentation/ai-mechanic.jpg";
import vehicleMgmtImg from "@/assets/presentation/vehicle-management.jpg";
import partsCatalogImg from "@/assets/presentation/parts-catalog.jpg";
import serviceDashImg from "@/assets/presentation/service-dashboard.jpg";
import serviceBookImg from "@/assets/presentation/service-book.jpg";
import emergencyImg from "@/assets/presentation/emergency.jpg";
import adminPanelImg from "@/assets/presentation/admin-panel.jpg";

const fadeUp = {
  hidden: { opacity: 0, y: 40 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

const featureSections = [
  {
    id: "ai-mechanic",
    icon: Bot,
    badge: "AI Powered",
    badgeColor: "bg-blue-500/20 text-blue-400",
    title: "AI Mechanik – Tonda",
    subtitle: "Váš osobní automechanik v kapse",
    description: "Inteligentní AI asistent, který analyzuje problémy vašeho vozidla pomocí popisu příznaků, fotografií závad i kontrolek na palubní desce. Rozpozná zvuky motoru, doporučí opravu a navrhne originální díly.",
    image: aiMechanicImg,
    features: [
      "Analýza fotografií závad a kontrolek",
      "Rozpoznání zvuků motoru",
      "Bezpečnostní varování při riziku poškození",
      "Propojení s Mopar katalogem originálních dílů",
      "Automatické vytvoření servisní poptávky",
      "Okamžité volání servisu",
    ],
    reverse: false,
  },
  {
    id: "vehicles",
    icon: Car,
    badge: "OCR & VIN",
    badgeColor: "bg-emerald-500/20 text-emerald-400",
    title: "Správa vozidel",
    subtitle: "Kompletní přehled o vašich vozech",
    description: "Přidejte vozidlo ručně, pomocí VIN kódu nebo jednoduše vyfotografujte VIN štítek či technický průkaz. Aplikace automaticky dekóduje VIN a získá všechny specifikace vozu.",
    image: vehicleMgmtImg,
    features: [
      "OCR rozpoznání VIN z fotografie",
      "OCR rozpoznání SPZ",
      "Automatické dekódování VIN přes NHTSA",
      "Sledování stavu kilometrů",
      "Historie nájezdů",
      "Propojení se servisní knihou",
    ],
    reverse: true,
  },
  {
    id: "parts",
    icon: ShoppingCart,
    badge: "EPC Katalog",
    badgeColor: "bg-amber-500/20 text-amber-400",
    title: "Mopar katalog autodílů",
    subtitle: "Originální díly s českými cenami",
    description: "Profesionální EPC katalog s rozpadovými diagramy dílů. Vyhledávejte podle OEM čísla, značky nebo modelu. Objednávejte nové i použité originální díly Chrysler, Dodge, Jeep a RAM.",
    image: partsCatalogImg,
    features: [
      "EPC rozpadové diagramy",
      "Hierarchická struktura: značka → model → motor",
      "Propojení s VIN – pouze kompatibilní díly",
      "Automatické načítání českých cen",
      "Cache cen pro rychlé zobrazení",
      "Objednávka nových i použitých dílů",
    ],
    reverse: false,
  },
  {
    id: "service-book",
    icon: BookOpen,
    badge: "Digitální",
    badgeColor: "bg-violet-500/20 text-violet-400",
    title: "Digitální servisní kniha",
    subtitle: "Kompletní historie údržby vašeho vozu",
    description: "Digitální servisní kniha s kompletní historií servisů, fotografiemi a dokumenty. Automatické generování servisního plánu s 11 standardními úkony a sledování stavu údržby.",
    image: serviceBookImg,
    features: [
      "Kompletní timeline servisních úkonů",
      "Fotografie a dokumenty ke každému servisu",
      "Servisní plán s intervaly v km i měsících",
      "Sledování: nutný / brzy / nadcházející",
      "Doporučení originálních Mopar dílů",
      "Export servisní knihy do PDF",
    ],
    reverse: true,
  },
  {
    id: "service-mgmt",
    icon: Calendar,
    badge: "Pro servis",
    badgeColor: "bg-cyan-500/20 text-cyan-400",
    title: "Řízení servisu",
    subtitle: "Dashboard pro mechaniky a plánování práce",
    description: "Kompletní systém pro řízení servisní dílny. Admin plánuje práci, přiřazuje mechaniky a zvedáky. Mechanici vidí své denní úkoly, zaznamenávají práci a nahrávají fotografie.",
    image: serviceDashImg,
    features: [
      "Kalendář plánování s denním/týdenním pohledem",
      "Dashboard mechanika s denními úkoly",
      "Přiřazení mechaniků a zvedáků",
      "Výkazy práce s fotografiemi",
      "Real-time aktualizace úkolů",
      "Automatické notifikace zákazníkům",
    ],
    reverse: false,
  },
  {
    id: "emergency",
    icon: AlertTriangle,
    badge: "SOS",
    badgeColor: "bg-red-500/20 text-red-400",
    title: "Nouzový režim",
    subtitle: "Pomoc při poruše na cestě",
    description: "Rychlý přístup k AI Tondovi při poruše na cestě. Okamžité volání servisu, rychlá servisní poptávka a návody k řešení běžných problémů jako vybití baterie, přehřátí motoru nebo defekt.",
    image: emergencyImg,
    features: [
      "Okamžité volání servisu jedním tlačítkem",
      "AI diagnostika poruchy na místě",
      "Rychlá servisní poptávka",
      "Návody pro řešení běžných poruch",
    ],
    reverse: true,
  },
  {
    id: "admin",
    icon: Shield,
    badge: "Admin",
    badgeColor: "bg-orange-500/20 text-orange-400",
    title: "Administrace",
    subtitle: "Kompletní správa obchodu a servisu",
    description: "Administrátorský panel pro řízení celého obchodu — správa objednávek, servisních zakázek, cen, katalogů, zaměstnanců, notifikací a statistik. Monitoring AI diagnostik a hlášení poruch.",
    image: adminPanelImg,
    features: [
      "Správa objednávek nových i použitých dílů",
      "Servisní zakázky a rezervace",
      "Správa cen: marže, zámky, historie",
      "Správa zaměstnanců a mechaniků",
      "Monitoring AI diagnostik a poruch",
      "Cílené notifikace zákazníkům",
    ],
    reverse: false,
  },
];

const stats = [
  { value: "30+", label: "Databázových tabulek" },
  { value: "15+", label: "Edge Functions" },
  { value: "50+", label: "Komponent" },
  { value: "5", label: "Uživatelských rolí" },
];

const techStack = [
  { name: "React + TypeScript", desc: "Moderní frontend framework" },
  { name: "Tailwind CSS", desc: "Utility-first styling" },
  { name: "Supabase", desc: "Backend, Auth, Storage" },
  { name: "Edge Functions", desc: "Serverless logika" },
  { name: "AI modely", desc: "Diagnostika & OCR" },
  { name: "Capacitor", desc: "iOS & Android ready" },
];

const AppPresentation = () => {
  const printPresentation = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Hero Section */}
      <section className="relative min-h-[80vh] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={heroImg} alt="Chrysler workshop" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-background/80 via-background/60 to-background" />
          <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
        </div>

        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="relative z-10 text-center px-6 max-w-3xl mx-auto"
        >
          <motion.div variants={fadeUp}>
            <img src="/images/logo_chrysler.webp" alt="Chrysler CZ" className="h-16 md:h-20 mx-auto mb-6" />
          </motion.div>
          <motion.h1 variants={fadeUp} className="font-display text-3xl md:text-5xl lg:text-6xl font-bold mb-4">
            Kompletní digitální platforma
          </motion.h1>
          <motion.p variants={fadeUp} className="text-lg md:text-xl text-muted-foreground mb-8 max-w-xl mx-auto">
            Servis · Originální díly · Správa vozidel · AI diagnostika
          </motion.p>
          <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button variant="hero" size="lg" onClick={printPresentation}>
              <Presentation className="w-5 h-5 mr-2" />
              Exportovat prezentaci
            </Button>
            <Button variant="outline" size="lg" onClick={() => document.getElementById("features")?.scrollIntoView({ behavior: "smooth" })}>
              Prozkoumat funkce
              <ChevronDown className="w-4 h-4 ml-2" />
            </Button>
          </motion.div>
        </motion.div>
      </section>

      {/* Stats */}
      <section className="py-12 border-y border-border bg-card/50">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="text-center"
              >
                <p className="font-display text-3xl md:text-4xl font-bold text-primary">{stat.value}</p>
                <p className="text-sm text-muted-foreground mt-1">{stat.label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Feature Sections */}
      <div id="features" className="py-16 space-y-24 md:space-y-32">
        {featureSections.map((section, idx) => {
          const Icon = section.icon;
          return (
            <motion.section
              key={section.id}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-100px" }}
              variants={staggerContainer}
              className="max-w-6xl mx-auto px-6"
            >
              <div className={`flex flex-col ${section.reverse ? "lg:flex-row-reverse" : "lg:flex-row"} gap-8 lg:gap-16 items-center`}>
                {/* Image */}
                <motion.div variants={fadeUp} className="lg:w-1/2 w-full">
                  <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-primary/10 border border-border">
                    <img
                      src={section.image}
                      alt={section.title}
                      className="w-full h-auto"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
                  </div>
                </motion.div>

                {/* Content */}
                <motion.div variants={fadeUp} className="lg:w-1/2 w-full space-y-5">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Icon className="w-5 h-5 text-primary" />
                    </div>
                    <Badge className={section.badgeColor}>{section.badge}</Badge>
                  </div>

                  <div>
                    <h2 className="font-display text-2xl md:text-3xl font-bold">{section.title}</h2>
                    <p className="text-primary text-sm font-medium mt-1">{section.subtitle}</p>
                  </div>

                  <p className="text-muted-foreground leading-relaxed">{section.description}</p>

                  <ul className="space-y-2.5">
                    {section.features.map((feat, j) => (
                      <li key={j} className="flex items-start gap-2.5 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                        <span className="text-foreground/90">{feat}</span>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              </div>
            </motion.section>
          );
        })}
      </div>

      {/* User Accounts Section */}
      <section className="py-16 bg-card/50 border-y border-border">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto px-6"
        >
          <motion.div variants={fadeUp} className="text-center mb-12">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold">Uživatelské role</h2>
            <p className="text-muted-foreground mt-2">Aplikace rozlišuje 5 typů uživatelů s přizpůsobeným rozhraním</p>
          </motion.div>

          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-4">
            {[
              { role: "Zákazník", desc: "Správa vozidel, objednávky, servisní kniha", color: "border-blue-500/30" },
              { role: "Admin", desc: "Kompletní správa obchodu a servisu", color: "border-amber-500/30" },
              { role: "Mechanik", desc: "Dashboard úkolů, výkazy práce, foto", color: "border-emerald-500/30" },
              { role: "Prodej dílů", desc: "Katalog, objednávky, cenotvorba", color: "border-violet-500/30" },
              { role: "Prodej vozů", desc: "Inzerce, poptávky, dovoz", color: "border-red-500/30" },
            ].map((item, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className={`rounded-xl border-2 ${item.color} bg-card p-4 text-center`}
              >
                <p className="font-display font-semibold text-sm">{item.role}</p>
                <p className="text-xs text-muted-foreground mt-1.5">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Tech Stack */}
      <section className="py-16">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="max-w-5xl mx-auto px-6"
        >
          <motion.div variants={fadeUp} className="text-center mb-12">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Smartphone className="w-6 h-6 text-primary" />
            </div>
            <h2 className="font-display text-2xl md:text-3xl font-bold">Technologický stack</h2>
            <p className="text-muted-foreground mt-2">Moderní a škálovatelná architektura</p>
          </motion.div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {techStack.map((tech, i) => (
              <motion.div
                key={i}
                variants={fadeUp}
                className="rounded-xl border border-border bg-card p-5 hover:border-primary/30 transition-colors"
              >
                <p className="font-display font-semibold text-sm">{tech.name}</p>
                <p className="text-xs text-muted-foreground mt-1">{tech.desc}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </section>

      {/* Footer */}
      <section className="py-12 border-t border-border bg-card/30">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <img src="/images/logo_chrysler.webp" alt="Chrysler CZ" className="h-10 mx-auto mb-4 opacity-60" />
          <p className="text-sm text-muted-foreground">
            Chrysler CZ – Originální díly · Servis · Prodej vozů
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            © {new Date().getFullYear()} | Pardubice
          </p>
        </div>
      </section>
    </div>
  );
};

export default AppPresentation;
