import { Button } from "@/components/ui/button";
import { FileDown, Presentation } from "lucide-react";

const features = [
  {
    title: "🔧 AI Mechanik – Tonda",
    items: [
      "Inteligentní diagnostika poruch vozidla pomocí AI",
      "Analýza fotografií závad a kontrolek na palubní desce",
      "Rozpoznání zvuků motoru a doporučení oprav",
      "Bezpečnostní varování při riziku poškození motoru",
      "Propojení s Mopar katalogem – doporučení originálních dílů",
      "Automatické vytvoření servisní poptávky po analýze",
      "Tlačítko pro okamžité volání servisu",
    ],
  },
  {
    title: "🚗 Správa vozidel",
    items: [
      "Přidání vozidla ručně, pomocí VIN nebo fotografie VIN štítku",
      "OCR rozpoznání VIN z fotografií (technický průkaz, štítek)",
      "OCR rozpoznání SPZ z fotografie",
      "Automatické dekódování VIN přes NHTSA databázi",
      "Sledování aktuálního stavu kilometrů",
      "Historie nájezdů kilometrů (uživatel i servis)",
    ],
  },
  {
    title: "📋 Servisní plán",
    items: [
      "Automatické generování servisního plánu podle vozidla",
      "11 standardních servisních úkonů (olej, filtry, brzdy, rozvody…)",
      "Intervaly v kilometrech i měsících",
      "Sledování stavu údržby – nutný / brzy / nadcházející",
      "Doporučení konkrétních Mopar dílů ke každému úkonu",
      "Push notifikace při blížícím se servisu",
    ],
  },
  {
    title: "📖 Digitální servisní kniha",
    items: [
      "Kompletní historie servisů vozidla v časové ose",
      "Záznamy: datum, km, typ servisu, popis, díly, cena",
      "Fotografie a dokumenty ke každému servisu",
      "Export servisní knihy do PDF",
      "Propojení s AI mechanikem pro přesnější diagnostiku",
    ],
  },
  {
    title: "🛒 Mopar katalog a objednávky",
    items: [
      "EPC katalog s rozpadovými diagramy dílů",
      "Hierarchická struktura: značka → model → motor → kategorie",
      "Propojení s VIN – zobrazení pouze kompatibilních dílů",
      "Automatické načítání českých cen (prefix 6 + OEM)",
      "Cache cen v databázi pro rychlé zobrazení",
      "Objednávka nových i použitých originálních dílů",
      "Alternativní katalogy AutoKelly a InterCars (připraveno)",
    ],
  },
  {
    title: "📊 Servisní doporučení",
    items: [
      "Automatická analýza servisních plánů a kilometrů",
      "Zobrazení doporučení na hlavní obrazovce aplikace",
      "Urgence: nutný servis / brzy / nadcházející",
      "Odhadovaná cena servisního úkonu",
      "Tlačítko Objednat servis – vytvoření poptávky jedním kliknutím",
      "Notifikace adminovi při objednání servisu",
    ],
  },
  {
    title: "🆘 Nouzový režim",
    items: [
      "Rychlý přístup k AI Tondovi při poruše",
      "Okamžité volání servisu",
      "Rychlá servisní poptávka",
      "Návody k řešení běžných problémů (baterie, přehřátí, defekt…)",
    ],
  },
  {
    title: "👤 Uživatelský účet",
    items: [
      "Registrace soukromá i firemní (IČO, DIČ)",
      "Schvalování firemních účtů adminem",
      "Individuální slevy pro firemní zákazníky",
      "Věrnostní program",
      "Přehled objednávek a poptávek",
      "Správa notifikací",
    ],
  },
  {
    title: "🔒 Admin panel",
    items: [
      "Správa objednávek nových a použitých dílů",
      "Správa servisních poptávek a rezervací",
      "Monitoring hlášení poruch od AI Tondy",
      "Správa cen: marže, zámky, historie změn",
      "Správa katalogů (Mopar, AutoKelly, InterCars)",
      "Správa servisních plánů a intervalů",
      "Digitální servisní knížky zákazníků",
      "Odesílání cílených notifikací uživatelům",
      "Import katalogu z CSV",
    ],
  },
  {
    title: "⚙️ Technologie",
    items: [
      "React + TypeScript + Tailwind CSS",
      "Supabase (databáze, autentizace, storage, edge functions)",
      "AI modely pro diagnostiku a OCR",
      "NHTSA API pro dekódování VIN",
      "Responsivní design pro mobil i desktop",
      "Capacitor – připraveno pro nativní mobilní aplikaci (iOS/Android)",
    ],
  },
];

const AppPresentation = () => {
  const printPresentation = () => {
    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Chrysler CZ – Přehled funkcí aplikace</title>
<style>
  @page { size: A4; margin: 20mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1a1a2e; max-width: 800px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 28px; text-align: center; border-bottom: 3px solid #d4a853; padding-bottom: 12px; margin-bottom: 8px; }
  .subtitle { text-align: center; color: #666; font-size: 14px; margin-bottom: 32px; }
  .feature { page-break-inside: avoid; margin-bottom: 24px; }
  .feature h2 { font-size: 18px; color: #1a1a2e; margin-bottom: 8px; padding: 8px 12px; background: #f8f6f0; border-left: 4px solid #d4a853; border-radius: 0 8px 8px 0; }
  .feature ul { margin: 0; padding-left: 24px; }
  .feature li { font-size: 13px; line-height: 1.8; color: #444; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #eee; text-align: center; font-size: 11px; color: #999; }
  .page-break { page-break-before: always; }
</style></head><body>
<h1>Chrysler CZ – Přehled funkcí aplikace</h1>
<p class="subtitle">Kompletní digitální platforma pro servis, díly a správu vozidel | ${new Date().toLocaleDateString("cs-CZ")}</p>
${features.map((f, i) => `
  ${i === 5 ? '<div class="page-break"></div>' : ''}
  <div class="feature">
    <h2>${f.title}</h2>
    <ul>${f.items.map(item => `<li>${item}</li>`).join("")}</ul>
  </div>
`).join("")}
<div class="footer">
  <p>Chrysler CZ – Originální díly · Servis · Prodej vozů</p>
  <p>Vygenerováno: ${new Date().toLocaleString("cs-CZ")}</p>
</div>
</body></html>`;

    const w = window.open("", "_blank");
    if (w) {
      w.document.write(html);
      w.document.close();
      setTimeout(() => w.print(), 500);
    }
  };

  const downloadCodeBackup = () => {
    const info = `CHRYSLER CZ – ZÁLOHA PROJEKTU
================================
Datum: ${new Date().toLocaleString("cs-CZ")}

STRUKTURA PROJEKTU
------------------
Framework: React + TypeScript + Vite
Styling: Tailwind CSS + shadcn/ui
Backend: Supabase (Lovable Cloud)
Mobile: Capacitor (iOS/Android ready)

HLAVNÍ SOUBORY
--------------
src/App.tsx – routing a layout
src/pages/Landing.tsx – úvodní stránka
src/pages/Shop.tsx – Mopar EPC katalog
src/pages/AiMechanic.tsx – AI Tonda diagnostika
src/pages/Emergency.tsx – nouzový režim
src/pages/MyVehicles.tsx – správa vozidel
src/pages/ServicePlan.tsx – servisní plán
src/pages/ServiceBook.tsx – digitální servisní kniha
src/pages/Service.tsx – rezervace servisu
src/pages/Cart.tsx – košík
src/pages/Checkout.tsx – pokladna
src/pages/Account.tsx – uživatelský účet
src/pages/MyOrders.tsx – moje objednávky
src/pages/Notifications.tsx – notifikace
src/pages/Admin.tsx – admin panel
src/pages/Auth.tsx – přihlášení/registrace
src/pages/Vehicles.tsx – vozy na prodej
src/pages/Contact.tsx – kontakt

KOMPONENTY
----------
src/components/ServiceRecommendations.tsx – servisní doporučení
src/components/admin/AdminFaultReports.tsx – monitoring poruch
src/components/admin/AdminPriceManagement.tsx – správa cen
src/components/admin/AdminServicePlans.tsx – správa servisních plánů
src/components/admin/AdminServiceHistory.tsx – servisní knížky
src/components/admin/AdminNotifications.tsx – notifikace
src/components/admin/AdminCatalogSettings.tsx – správa katalogů
src/components/admin/CatalogImport.tsx – import katalogu

EDGE FUNCTIONS (BACKEND)
------------------------
supabase/functions/ai-mechanic/ – AI diagnostika
supabase/functions/vin-ocr/ – OCR rozpoznání VIN/SPZ
supabase/functions/price-sync/ – synchronizace cen
supabase/functions/catalog-fetch/ – načítání katalogu
supabase/functions/catalog-proxy/ – proxy pro katalog
supabase/functions/catalog-probe/ – testování spojení

DATABÁZOVÉ TABULKY
------------------
profiles – uživatelské profily
user_vehicles – vozidla zákazníků
user_roles – role (admin/customer)
service_history – servisní záznamy
service_plans – servisní plány
service_bookings – rezervace servisu
mileage_history – historie kilometrů
fault_reports – hlášení poruch
parts_new – katalog dílů
parts_catalog – starý katalog
price_history – historie cen
orders – objednávky (sjednocené)
new_part_orders – objednávky nových dílů
used_part_requests – poptávky použitých dílů
notifications – notifikace
vehicles – vozy na prodej
vehicle_inquiries – poptávky vozů
cars_for_sale – inzerce vozů
epc_categories – EPC kategorie
epc_part_links – propojení dílů s EPC

POZNÁMKA
--------
Pro kompletní zálohu kódu doporučujeme propojit projekt s GitHub.
V editoru: Settings → GitHub → Connect project.
`;

    const blob = new Blob([info], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `chrysler-cz-backup-${new Date().toISOString().split("T")[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen pb-20 bg-background">
      <div className="p-4 max-w-2xl mx-auto space-y-6">
        <div className="text-center pt-6 pb-2">
          <img src="/images/logo_chrysler.webp" alt="Chrysler CZ" className="h-14 mx-auto mb-3" />
          <h1 className="font-display text-2xl font-bold">Přehled funkcí aplikace</h1>
          <p className="text-sm text-muted-foreground mt-1">Kompletní digitální platforma pro servis, díly a správu vozidel</p>
        </div>

        <div className="flex gap-2">
          <Button onClick={printPresentation} className="flex-1">
            <Presentation className="w-4 h-4 mr-2" />
            Exportovat PDF prezentaci
          </Button>
          <Button variant="outline" onClick={downloadCodeBackup} className="flex-1">
            <FileDown className="w-4 h-4 mr-2" />
            Stáhnout zálohu projektu
          </Button>
        </div>

        {features.map((f, i) => (
          <div key={i} className="border rounded-lg p-4 bg-card">
            <h2 className="font-display font-semibold text-base mb-2">{f.title}</h2>
            <ul className="space-y-1">
              {f.items.map((item, j) => (
                <li key={j} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary mt-1">•</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AppPresentation;
