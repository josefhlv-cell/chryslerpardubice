import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot, Car, Wrench, BookOpen, ShoppingCart, Shield,
  AlertTriangle, Users, BarChart3, Smartphone,
  CheckCircle2, ChevronLeft, ChevronRight, Calendar,
  Camera, Bell, Gauge, MessageSquare, FileText,
  Star, Truck, ScanLine, Cog, Package, Presentation,
  MapPin, Clock, Zap, Search, Database, Lock, Download
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";

// Presentation images
import heroImg from "@/assets/presentation/hero-car.jpg";
import aiMechanicImg from "@/assets/presentation/ai-mechanic.jpg";
import vehicleMgmtImg from "@/assets/presentation/vehicle-management.jpg";
import partsCatalogImg from "@/assets/presentation/parts-catalog.jpg";
import serviceDashImg from "@/assets/presentation/service-dashboard.jpg";
import serviceBookImg from "@/assets/presentation/service-book.jpg";
import emergencyImg from "@/assets/presentation/emergency.jpg";
import adminPanelImg from "@/assets/presentation/admin-panel.jpg";

// Screen mockups
import screenLanding from "@/assets/proposals/screen-landing.jpg";
import screenDashboard from "@/assets/proposals/screen-home-dashboard.jpg";
import screenVehicles from "@/assets/proposals/screen-vehicles.jpg";
import screenVehicleDetail from "@/assets/proposals/screen-vehicle-detail.jpg";
import screenVinScanner from "@/assets/proposals/screen-vin-scanner.jpg";
import screenPartsCatalog from "@/assets/proposals/screen-parts-catalog.jpg";
import screenEpcDiagram from "@/assets/proposals/screen-epc-diagram.jpg";
import screenCart from "@/assets/proposals/screen-cart.jpg";
import screenOrders from "@/assets/proposals/screen-orders.jpg";
import screenServiceBooking from "@/assets/proposals/screen-service-booking.jpg";
import screenServiceTracking from "@/assets/proposals/screen-service-tracking.jpg";
import screenServiceBook from "@/assets/proposals/screen-service-book.jpg";
import screenAiMechanic from "@/assets/proposals/screen-ai-mechanic.jpg";
import screenEmergency from "@/assets/proposals/screen-emergency.jpg";
import screenMechanicDash from "@/assets/proposals/screen-mechanic-dashboard.jpg";
import screenAdminPanel from "@/assets/proposals/screen-admin-panel.jpg";
import screenNotifications from "@/assets/proposals/screen-notifications.jpg";
import screenAccount from "@/assets/proposals/screen-account.jpg";

type Slide = {
  id: string;
  category: string;
  categoryColor: string;
  icon: React.ElementType;
  title: string;
  subtitle: string;
  description: string;
  image: string;
  features: string[];
  stats?: { label: string; value: string }[];
};

const slides: Slide[] = [
  {
    id: "intro",
    category: "Představení",
    categoryColor: "bg-primary/20 text-primary",
    icon: Presentation,
    title: "Chrysler & Dodge Pardubice",
    subtitle: "Kompletní digitální platforma pro autoservis a prodej dílů",
    description: "Mobilní webová aplikace (PWA) spojující zákazníky s autorizovaným servisem Chrysler, Dodge, Jeep & RAM. Nabízí AI diagnostiku, EPC katalog originálních dílů, digitální servisní knížku, online objednávky a kompletní řízení servisní dílny.",
    image: heroImg,
    features: [
      "Originální Mopar díly + aftermarket alternativy (SAG Connect)",
      "AI mechanik Tonda — diagnostika z fotek a popisů",
      "Digitální servisní knížka s exportem do PDF",
      "EPC rozpadové diagramy s interaktivními pozicemi",
      "Online rezervace servisu s live tracking stavu",
      "Admin panel s 18+ moduly pro kompletní řízení",
    ],
    stats: [
      { label: "Tabulek v DB", value: "40+" },
      { label: "Edge Functions", value: "18" },
      { label: "UI komponent", value: "50+" },
      { label: "Admin modulů", value: "18+" },
    ],
  },
  {
    id: "landing",
    category: "Úvodní obrazovka",
    categoryColor: "bg-amber-500/20 text-amber-400",
    icon: Smartphone,
    title: "Landing Page",
    subtitle: "První dojem — luxusní a přehledný",
    description: "Hlavní stránka pro nepřihlášené uživatele s rychlým přístupem k servisu, katalogu a kontaktům. Minimalistický design v černé s jantarovými akcenty, okamžité CTA pro objednání servisu a katalog dílů.",
    image: screenLanding,
    features: [
      "Hero karta s animovaným vozidlem",
      "Široké CTA tlačítko 'Zavolat servis'",
      "Rychlé akce: Objednat servis, Katalog dílů",
      "Přihlášení / registrace (soukromý i firemní účet)",
      "Tmavý luxusní design 'Amber Bentley'",
      "Responsivní layout optimalizovaný pro 390px",
    ],
  },
  {
    id: "dashboard",
    category: "Dashboard",
    categoryColor: "bg-blue-500/20 text-blue-400",
    icon: Gauge,
    title: "Domovská obrazovka",
    subtitle: "Personalizovaný přehled pro přihlášeného uživatele",
    description: "Po přihlášení uživatel vidí karusel svých vozidel, aktivní servisní zakázky, rychlé akce a doporučení. Dashboard se automaticky přizpůsobuje roli uživatele (zákazník/mechanik/admin).",
    image: screenDashboard,
    features: [
      "Karusel vozidel s aktuálním stavem",
      "Přehled aktivních servisních zakázek",
      "Rychlé akce: Servis, Díly, AI Tonda, Nouzová pomoc",
      "Servisní doporučení na základě nájezdu",
      "Notifikační badge s počtem nepřečtených",
      "Přizpůsobení podle uživatelské role",
    ],
  },
  {
    id: "vehicles",
    category: "Správa vozidel",
    categoryColor: "bg-emerald-500/20 text-emerald-400",
    icon: Car,
    title: "Moje vozidla – Garáž",
    subtitle: "Kompletní správa vašeho vozového parku",
    description: "Uživatelé přidávají vozidla ručně nebo pomocí VIN dekódování. Každé vozidlo má vlastní kartu s údaji, historií servisu, aktuálním nájezdem a propojením na servisní plány.",
    image: screenVehicles,
    features: [
      "Přidání vozidla ručně / VIN / OCR z fotky",
      "Automatické dekódování VIN (NHTSA + AI obohacení)",
      "Sledování aktuálního nájezdu s historií",
      "Propojení se servisní knížkou a plány údržby",
      "Ikony vozidel podle značky a modelu",
      "CRUD operace: přidat, upravit, smazat",
    ],
  },
  {
    id: "vehicle-detail",
    category: "Detail vozidla",
    categoryColor: "bg-emerald-500/20 text-emerald-400",
    icon: ScanLine,
    title: "VIN dekodér & Detail vozu",
    subtitle: "Vše o vašem voze na jednom místě",
    description: "Detailní karta vozidla s kompletními specifikacemi z VIN dekódování. OCR rozpoznání VIN z fotografie technického průkazu nebo VIN štítku. AI obohacení dat o motor, výbavu a specifika modelu.",
    image: screenVehicleDetail,
    features: [
      "OCR skenování VIN z fotky (edge function vin-ocr)",
      "NHTSA dekódování + AI doplnění specifikací",
      "Značka, model, rok, motor, převodovka",
      "Aktualizace nájezdu s automatickým záznamem",
      "Propojení na kompatibilní díly v katalogu",
      "Export VIN reportu",
    ],
    stats: [
      { label: "VIN znaků", value: "17" },
      { label: "Dekódovaných polí", value: "30+" },
      { label: "AI modely", value: "2" },
    ],
  },
  {
    id: "vin-scanner",
    category: "VIN Scanner",
    categoryColor: "bg-teal-500/20 text-teal-400",
    icon: Camera,
    title: "VIN OCR – Skenování z fotky",
    subtitle: "Stačí vyfotit a systém rozpozná VIN automaticky",
    description: "Pokročilý OCR modul využívající AI pro rozpoznání VIN kódu z fotografie technického průkazu, štítku na voze nebo ručně psaného kódu. Podporuje i rozpoznání SPZ.",
    image: screenVinScanner,
    features: [
      "Rozpoznání VIN z fotky technického průkazu",
      "Rozpoznání VIN ze štítku na voze",
      "AI korekce rozpoznaných znaků",
      "Automatické vyplnění údajů o voze",
      "Podpora fotoaparátu i nahrání z galerie",
    ],
  },
  {
    id: "parts-catalog",
    category: "Katalog dílů",
    categoryColor: "bg-amber-500/20 text-amber-400",
    icon: ShoppingCart,
    title: "Mopar katalog náhradních dílů",
    subtitle: "Originální díly + aftermarket alternativy",
    description: "Profesionální katalog s paralelním vyhledáváním napříč více zdroji: EPC katalog, lokální DB a externí Mopar API. Výsledky jsou slučovány s prioritou EPC > Mopar > lokální. Obsahuje aftermarket alternativy ze SAG Connect s automatickou 15% marží.",
    image: screenPartsCatalog,
    features: [
      "4 režimy vyhledávání: OEM, VIN, EPC, Značka/Model",
      "Paralelní vyhledávání v reálném čase",
      "Mopar originální díly (Zdroj 1)",
      "SAG Connect aftermarket alternativy (Zdroj 2)",
      "Automatický výpočet DPH a marží",
      "Export výsledků do CSV",
      "Oblíbené díly a historie vyhledávání",
      "800ms debounce pro optimální výkon",
    ],
    stats: [
      { label: "Zdrojů dat", value: "3+" },
      { label: "Režimů hledání", value: "4" },
      { label: "Variant OEM kódů", value: "4" },
    ],
  },
  {
    id: "epc",
    category: "EPC Katalog",
    categoryColor: "bg-orange-500/20 text-orange-400",
    icon: Search,
    title: "EPC – Elektronický katalog dílů",
    subtitle: "Interaktivní rozpadové diagramy",
    description: "Kompletní EPC workflow: VIN → kategorie → interaktivní diagram → díl. SVG nákresy s klikacími pozicemi propojenými s katalogem. Hierarchická struktura: Značka → Model → Motor → Kategorie → Subkategorie.",
    image: screenEpcDiagram,
    features: [
      "SVG rozpadové diagramy s klikacími pozicemi",
      "Hierarchická navigace: značka → model → motor → díl",
      "Propojení pozic s díly v katalogu",
      "AI generování diagramů (batch processing)",
      "Admin správa EPC kategorií",
      "Dávkový import a scraping EPC dat",
    ],
  },
  {
    id: "cart",
    category: "Nákup",
    categoryColor: "bg-violet-500/20 text-violet-400",
    icon: Package,
    title: "Košík & Objednávky",
    subtitle: "Nové díly i poptávky použitých",
    description: "Dva typy objednávek: přímý nákup nových dílů a poptávka použitých dílů (admin nacení). Firemní zákazníci mají automatickou slevu. Kompletní lifecycle objednávky od vytvoření po vyřízení.",
    image: screenCart,
    features: [
      "Přímý nákup nových dílů (order_type: new)",
      "Poptávka použitých dílů (order_type: used)",
      "Automatická sleva pro firemní zákazníky",
      "4 stavy objednávky: Nová → Zpracovává se → Vyřízená → Zrušená",
      "Poznámka zákazníka k objednávce",
      "Admin správa a nacenění",
    ],
  },
  {
    id: "orders",
    category: "Objednávky",
    categoryColor: "bg-violet-500/20 text-violet-400",
    icon: FileText,
    title: "Moje objednávky",
    subtitle: "Přehled všech objednávek a poptávek",
    description: "Seznam objednávek nových dílů i poptávek na použité díly s aktuálním stavem. Zákazník vidí cenu, stav, poznámku od admina a může sledovat průběh vyřízení.",
    image: screenOrders,
    features: [
      "Přehled objednávek nových dílů",
      "Přehled poptávek použitých dílů",
      "Filtrování podle stavu",
      "Detail s poznámkou od servisu",
      "Historie cenových nabídek",
    ],
  },
  {
    id: "service-booking",
    category: "Servis",
    categoryColor: "bg-cyan-500/20 text-cyan-400",
    icon: Calendar,
    title: "Online rezervace servisu",
    subtitle: "10 typů servisu, výběr termínu, náhradní vozidlo",
    description: "Online rezervační systém s výběrem typu servisu, preferovaným termínem a možností objednání náhradního vozidla. Admin potvrzuje termín a nacení servis. Automatické notifikace o změně stavu.",
    image: screenServiceBooking,
    features: [
      "10 typů servisních úkonů",
      "Výběr preferovaného termínu (kalendář)",
      "Požadavek na náhradní vozidlo",
      "Poznámka k rezervaci",
      "Admin potvrzení termínu a ceny",
      "5 stavů: Čeká → Potvrzeno → Probíhá → Dokončeno → Zrušeno",
      "Automatická notifikace adminu",
    ],
    stats: [
      { label: "Typů servisu", value: "10" },
      { label: "Stavů rezervace", value: "5" },
    ],
  },
  {
    id: "service-tracking",
    category: "Servisní zakázky",
    categoryColor: "bg-cyan-500/20 text-cyan-400",
    icon: Wrench,
    title: "Sledování servisní zakázky",
    subtitle: "Live tracking od příjmu po dokončení",
    description: "Kompletní lifecycle servisní zakázky s 8 stavy. Zákazník vidí aktuální stav, přiřazeného mechanika, fotodokumentaci, kalkulaci ceny a může schválit opravu. Timeline s historií všech změn stavů.",
    image: screenServiceTracking,
    features: [
      "8 stavů: Přijato → Diagnostika → Čeká schválení → Čeká díly → Oprava → Testování → K vyzvednutí → Dokončeno",
      "Přiřazení mechanika a zdviže",
      "Fotodokumentace: před / během / po opravě",
      "Příjmový protokol (palivo, nájezd, poškození, podpis)",
      "Kalkulace: práce + díly + DPH",
      "Zákaznické schválení ceny",
      "ETA dokončení",
      "Timeline stavů s historií změn",
    ],
    stats: [
      { label: "Stavů zakázky", value: "8" },
      { label: "Fází fotodokumentace", value: "3" },
    ],
  },
  {
    id: "service-book",
    category: "Servisní knížka",
    categoryColor: "bg-violet-500/20 text-violet-400",
    icon: BookOpen,
    title: "Digitální servisní knížka",
    subtitle: "Kompletní historie údržby každého vozu",
    description: "Digitální servisní knížka propojená s vozidly uživatele. Obsahuje kompletní historii servisů s datumem, typem, nájezdem, cenou a použitými díly. Automatické generování servisních plánů s 11 standardními úkony.",
    image: screenServiceBook,
    features: [
      "Timeline servisních záznamů",
      "Filtrování podle vozidla",
      "Detail: typ, datum, nájezd, díly, cena, popis",
      "Servisní plány: intervaly km + měsíce",
      "Stavy: nutný / brzy / nadcházející",
      "Doporučené originální Mopar díly",
      "Export do PDF",
      "Sdílení servisní knížky při prodeji vozu",
    ],
  },
  {
    id: "ai-mechanic",
    category: "AI Diagnostika",
    categoryColor: "bg-blue-500/20 text-blue-400",
    icon: Bot,
    title: "AI Mechanik – Tonda",
    subtitle: "Váš osobní automechanik v kapse",
    description: "Inteligentní AI asistent 'Tonda' analyzuje problémy vozidla z popisu příznaků, fotografií závad i kontrolek. Rozpozná zvuky motoru, doporučí opravu a navrhne originální díly z katalogu. Podporuje kontext vybraného vozidla z garáže.",
    image: screenAiMechanic,
    features: [
      "Chat rozhraní s AI asistentem",
      "Analýza fotografií závad a kontrolek",
      "Rozpoznání zvuků a vibrací motoru",
      "Kontext vozidla z garáže uživatele",
      "Doporučení dílů z Mopar katalogu",
      "Bezpečnostní varování při riziku",
      "Automatické vytvoření servisní poptávky",
      "Okamžité volání servisu z chatu",
    ],
    stats: [
      { label: "AI model", value: "Gemini" },
      { label: "Typy vstupů", value: "3" },
    ],
  },
  {
    id: "emergency",
    category: "Nouzová pomoc",
    categoryColor: "bg-red-500/20 text-red-400",
    icon: AlertTriangle,
    title: "Nouzový režim – SOS",
    subtitle: "Rychlá pomoc při poruše na cestě",
    description: "Specializovaný modul pro nouzové situace. Okamžité volání servisu jedním tlačítkem, AI diagnostika na místě, rychlá servisní poptávka a podrobné návody k řešení 4 nejčastějších poruch.",
    image: screenEmergency,
    features: [
      "Okamžité volání servisu jedním tlačítkem",
      "AI Tonda — diagnostika na místě",
      "Rychlá servisní poptávka",
      "Návod: Vybitá baterie — postup krok za krokem",
      "Návod: Přehřátý motor",
      "Návod: Defekt pneumatiky",
      "Návod: Nízký tlak oleje",
    ],
  },
  {
    id: "mechanic-dashboard",
    category: "Pro mechaniky",
    categoryColor: "bg-green-500/20 text-green-400",
    icon: Wrench,
    title: "Dashboard mechanika",
    subtitle: "Denní úkoly, výkazy práce, fotodokumentace",
    description: "Specializovaný dashboard pro mechaniky s přehledem přiřazených zakázek, denních úkolů a výkazů práce. Start/stop měření času na úkolech, nahrávání fotografií a aktualizace stavů.",
    image: screenMechanicDash,
    features: [
      "Seznam přiřazených servisních zakázek",
      "Denní úkoly s prioritou",
      "Start/stop měření času na úkolu",
      "Fotodokumentace práce",
      "Aktualizace stavu zakázky",
      "Pracovní výkazy s časem a popisem",
    ],
  },
  {
    id: "admin",
    category: "Administrace",
    categoryColor: "bg-orange-500/20 text-orange-400",
    icon: Shield,
    title: "Admin panel – 18+ modulů",
    subtitle: "Kompletní řízení obchodu a servisu",
    description: "Rozsáhlý administrátorský panel s 18+ moduly pro kompletní správu. Objednávky, servisní zakázky, katalog, ceny, zaměstnanci, mechanici, notifikace, statistiky, feature flags a monitoring.",
    image: screenAdminPanel,
    features: [
      "Správa objednávek (nové díly + použité poptávky)",
      "Servisní zakázky — kompletní workflow 8 stavů",
      "Servisní rezervace — potvrzení termínů a cen",
      "Katalog: CSV import, AI import, zdroje",
      "Ceny: marže, zámky, bulk sync, CRON",
      "EPC: generování diagramů, import",
      "Zaměstnanci a mechanici",
      "Feature flags — zapínání/vypínání modulů",
      "Notifikace zákazníkům",
      "Servisní statistiky a kalendář",
      "Hlášení poruch s AI analýzou",
      "Schvalování firemních účtů + nastavení slev",
    ],
    stats: [
      { label: "Admin tabů", value: "18+" },
      { label: "Feature flags", value: "35+" },
    ],
  },
  {
    id: "notifications",
    category: "Notifikace",
    categoryColor: "bg-pink-500/20 text-pink-400",
    icon: Bell,
    title: "Notifikační systém",
    subtitle: "In-app notifikace v reálném čase",
    description: "Komplexní notifikační systém s in-app zprávami. Badge s počtem nepřečtených, automatické notifikace při změně stavu zakázky, potvrzení rezervace a admin broadcast zprávy.",
    image: screenNotifications,
    features: [
      "In-app notifikace s badge počítadlem",
      "Automatické notifikace při změně stavu zakázky",
      "Potvrzení servisní rezervace",
      "Admin: cílené zprávy konkrétním uživatelům",
      "Označení jako přečtené",
      "Edge function: notify-admin, service-status-notify",
    ],
  },
  {
    id: "account",
    category: "Účet",
    categoryColor: "bg-slate-500/20 text-slate-400",
    icon: Users,
    title: "Uživatelský účet & Role",
    subtitle: "Soukromé i firemní účty s přizpůsobeným UI",
    description: "Registrace emailem jako soukromá osoba nebo firma. Firemní účty čekají na schválení adminem a získávají automatickou slevu. 5 typů rolí s přizpůsobeným rozhraním.",
    image: screenAccount,
    features: [
      "Registrace: soukromý / firemní účet",
      "Firemní účty: IČO, DIČ, název firmy",
      "Admin schvalování firemních účtů",
      "Nastavitelná % sleva pro firmy",
      "Role: Zákazník, Admin, Mechanik, Prodej dílů, Prodej vozů",
      "Profil: jméno, email, telefon",
      "Reset hesla",
      "Věrnostní program (loyalty_active)",
    ],
  },
  {
    id: "tech",
    category: "Technologie",
    categoryColor: "bg-indigo-500/20 text-indigo-400",
    icon: Database,
    title: "Architektura & Bezpečnost",
    subtitle: "Moderní, škálovatelná a bezpečná platforma",
    description: "Aplikace je postavena na React 18 + TypeScript + Vite s Tailwind CSS a shadcn/ui komponentami. Backend využívá Supabase s 40+ tabulkami, RLS politikami na každé tabulce a 18 edge functions pro serverless logiku.",
    image: heroImg,
    features: [
      "React 18 + TypeScript + Vite (frontend)",
      "Tailwind CSS + shadcn/ui (50+ komponent)",
      "Supabase: Auth, DB, Storage, Edge Functions",
      "40+ databázových tabulek s RLS politikami",
      "18 serverless Edge Functions",
      "Framer Motion animace",
      "Capacitor: iOS & Android ready (PWA)",
      "React Query pro state management",
      "Role v separátní tabulce (has_role security definer)",
      "Feature flags pro modulární zapínání funkcí",
    ],
    stats: [
      { label: "DB tabulek", value: "40+" },
      { label: "Edge Functions", value: "18" },
      { label: "RLS politik", value: "40+" },
      { label: "Feature flags", value: "35+" },
    ],
  },
];

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? 300 : -300, opacity: 0 }),
};

const AppPresentation = () => {
  const [current, setCurrent] = useState(0);
  const [direction, setDirection] = useState(0);

  const goTo = (idx: number) => {
    setDirection(idx > current ? 1 : -1);
    setCurrent(idx);
  };
  const prev = () => { if (current > 0) goTo(current - 1); };
  const next = () => { if (current < slides.length - 1) goTo(current + 1); };

  const handleDownload = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    const slidesHTML = slides.map((s, i) => `
      <div class="slide">
        <div class="slide-header">
          <div class="slide-number">${i + 1} / ${slides.length}</div>
          <div class="slide-category">${s.category}</div>
          <h1 class="slide-title">${s.title}</h1>
          <p class="slide-subtitle">${s.subtitle}</p>
        </div>
        <img src="${s.image}" class="slide-img" alt="${s.title}" />
        ${s.stats ? `<div class="stats-row">${s.stats.map(st => `<div class="stat"><strong>${st.value}</strong><small>${st.label}</small></div>`).join('')}</div>` : ''}
        <p class="slide-desc">${s.description}</p>
        <ul class="features">${s.features.map(f => `<li>✓ ${f}</li>`).join('')}</ul>
      </div>
    `).join('');

    printWindow.document.write(`<!DOCTYPE html>
<html><head><title>Chrysler and Dodge Pardubice - Prezentace</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #222; background: #fff; }
  .slide { page-break-after: always; padding: 24px 32px; min-height: 100vh; display: flex; flex-direction: column; }
  .slide:last-child { page-break-after: auto; }
  .slide-header { margin-bottom: 12px; }
  .slide-number { font-size: 11px; color: #999; margin-bottom: 4px; }
  .slide-category { font-size: 11px; font-weight: 600; color: #c77d1a; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .slide-title { font-size: 22px; font-weight: 700; margin-bottom: 2px; }
  .slide-subtitle { font-size: 13px; color: #c77d1a; font-weight: 500; margin-bottom: 8px; }
  .slide-img { width: 100%; max-height: 280px; object-fit: cover; border-radius: 10px; margin-bottom: 12px; }
  .stats-row { display: flex; gap: 12px; margin-bottom: 12px; }
  .stat { flex: 1; text-align: center; border: 1px solid #ddd; border-radius: 8px; padding: 6px 4px; }
  .stat strong { display: block; font-size: 16px; color: #c77d1a; }
  .stat small { font-size: 9px; color: #888; }
  .slide-desc { font-size: 11px; color: #555; line-height: 1.5; margin-bottom: 12px; }
  .features { list-style: none; padding: 0; }
  .features li { font-size: 11px; padding: 3px 0; border-bottom: 1px solid #f0f0f0; }
  .features li:last-child { border-bottom: none; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  @page { size: A4 portrait; margin: 10mm; }
</style></head><body>${slidesHTML}</body></html>`);

    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  };

  const slide = slides[current];
  const Icon = slide.icon;
  const progress = ((current + 1) / slides.length) * 100;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-50 bg-background/95 backdrop-blur-xl border-b border-border/30 safe-top">
        <div className="flex items-center justify-between px-4 h-12">
          <div className="flex items-center gap-2">
            <Presentation className="w-4 h-4 text-primary" />
            <span className="text-xs font-display font-semibold text-foreground">Prezentace</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleDownload} className="h-8 px-2 text-xs gap-1">
              <Download className="w-3.5 h-3.5" />
              PDF
            </Button>
            <span className="text-xs text-muted-foreground font-medium">
              {current + 1} / {slides.length}
            </span>
          </div>
        </div>
        <Progress value={progress} className="h-0.5 rounded-none" />
      </div>

      {/* Slide Content */}
      <div className="flex-1 overflow-hidden relative">
        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={slide.id}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.3, ease: "easeInOut" }}
            className="px-4 py-5 space-y-5"
          >
            {/* Category Badge */}
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                <Icon className="w-4 h-4 text-primary" />
              </div>
              <Badge className={slide.categoryColor + " text-[10px] font-medium"}>
                {slide.category}
              </Badge>
            </div>

            {/* Title */}
            <div>
              <h1 className="font-display text-xl font-bold leading-tight">{slide.title}</h1>
              <p className="text-primary text-xs font-medium mt-0.5">{slide.subtitle}</p>
            </div>

            {/* Image */}
            <div className="relative rounded-xl overflow-hidden border border-border shadow-lg shadow-primary/5">
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-auto max-h-[35vh] object-cover"
                loading="lazy"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
            </div>

            {/* Stats Row */}
            {slide.stats && (
              <div className="grid grid-cols-4 gap-2">
                {slide.stats.map((s, i) => (
                  <div key={i} className="text-center rounded-lg border border-border/50 bg-card/50 py-2">
                    <p className="font-display text-base font-bold text-primary">{s.value}</p>
                    <p className="text-[9px] text-muted-foreground leading-tight">{s.label}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Description */}
            <p className="text-xs text-muted-foreground leading-relaxed">{slide.description}</p>

            {/* Features List */}
            <div className="space-y-1.5">
              <p className="text-[10px] font-semibold text-foreground/60 uppercase tracking-wider">Klíčové funkce</p>
              <ul className="space-y-1.5">
                {slide.features.map((feat, j) => (
                  <li key={j} className="flex items-start gap-2 text-xs">
                    <CheckCircle2 className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <span className="text-foreground/80">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Navigation */}
      <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-3 pt-2 bg-gradient-to-t from-background via-background to-transparent">
        <div className="flex items-center justify-between gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={prev}
            disabled={current === 0}
            className="flex-1"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Zpět
          </Button>

          {/* Dot indicators */}
          <div className="flex gap-1 items-center overflow-x-auto max-w-[120px] py-1 scrollbar-hide">
            {slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={`shrink-0 rounded-full transition-all ${
                  i === current
                    ? "w-4 h-1.5 bg-primary"
                    : "w-1.5 h-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                }`}
              />
            ))}
          </div>

          <Button
            variant={current === slides.length - 1 ? "outline" : "default"}
            size="sm"
            onClick={next}
            disabled={current === slides.length - 1}
            className="flex-1"
          >
            Další
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default AppPresentation;
