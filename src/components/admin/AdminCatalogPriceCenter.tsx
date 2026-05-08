/**
 * AdminCatalogPriceCenter
 * ─────────────────────────────────────────────────────────────────────────
 * Jediné místo pro VŠECHNY nástroje katalogu a cen.
 * Každá sekce má jasný popis (k čemu slouží), interaktivní progress
 * a navazuje na další krok (číslované workflow 1 → 6).
 */
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Database,
  Upload,
  DollarSign,
  ScanSearch,
  Wrench,
  LayoutGrid,
  Settings2,
  ArrowRight,
} from "lucide-react";
import { useState } from "react";

import AdminCatalogHub from "./AdminCatalogHub";
import AdminPriceSyncStats from "./AdminPriceSyncStats";
import AdminBulkPriceSyncRuns from "./AdminBulkPriceSyncRuns";
import AdminBulkPriceSync from "./AdminBulkPriceSync";
import AdminPriceManagement from "./AdminPriceManagement";
import AdminCatalogDiagnostic from "./AdminCatalogDiagnostic";
import AdminDataFixer from "./AdminDataFixer";
import AdminPhotoEnrichment from "./AdminPhotoEnrichment";
import AdminCatalogQualityExport from "./AdminCatalogQualityExport";
import AdminCatalogCommandCenter from "./AdminCatalogCommandCenter";
import AICatalogImport from "./AICatalogImport";
import CatalogImport from "./CatalogImport";
import EPCImport from "./EPCImport";
import AdminEPCDiagrams from "./AdminEPCDiagrams";
import AdminCatalogSettings from "./AdminCatalogSettings";

type Tab = "overview" | "prices" | "diagnostics" | "import" | "epc" | "settings";

interface SectionProps {
  step?: number;
  title: string;
  description: string;
  badge?: string;
  children: React.ReactNode;
}

const Section = ({ step, title, description, badge, children }: SectionProps) => (
  <Card className="border-border/50">
    <CardContent className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        {step !== undefined && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-300 text-sm font-bold">
            {step}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm">{title}</h3>
            {badge && (
              <Badge variant="outline" className="text-[9px]">
                {badge}
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
      </div>
      <div className="pt-1">{children}</div>
    </CardContent>
  </Card>
);

const Flow = ({ steps }: { steps: string[] }) => (
  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground bg-muted/40 rounded-md px-3 py-2">
    {steps.map((s, i) => (
      <span key={i} className="flex items-center gap-1.5">
        <span>{s}</span>
        {i < steps.length - 1 && <ArrowRight className="w-3 h-3 opacity-50" />}
      </span>
    ))}
  </div>
);

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Přehled", icon: Database },
  { id: "prices", label: "Ceny", icon: DollarSign },
  { id: "diagnostics", label: "Diagnostika", icon: ScanSearch },
  { id: "import", label: "Import", icon: Upload },
  { id: "epc", label: "EPC nákresy", icon: LayoutGrid },
  { id: "settings", label: "Nastavení", icon: Settings2 },
];

const AdminCatalogPriceCenter = () => {
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start gap-1 h-auto p-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <TabsTrigger
              key={id}
              value={id}
              className="text-[11px] gap-1.5 shrink-0 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300"
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── PŘEHLED ─────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-3 space-y-3">
          <Flow steps={["Přehled", "Ceny", "Diagnostika", "Oprava", "Import", "Hotovo"]} />
          <AdminCatalogHub />
        </TabsContent>

        {/* ── CENY (sjednocený workflow) ──────────────────────── */}
        <TabsContent value="prices" className="mt-3 space-y-3">
          <Flow
            steps={[
              "1. Přehled",
              "2. Server sync",
              "3. Ruční dávka",
              "4. Správa cen",
            ]}
          />

          <Section
            step={1}
            title="Přehled cen — pokrytí a živý stav"
            description="Sleduje pokrytí cenami v celé databázi, dnešní progres a stav automatického cron syncu (běží každou minutu). Zde můžete cron pozastavit nebo obnovit."
            badge="Live"
          >
            <AdminPriceSyncStats />
          </Section>

          <Section
            step={2}
            title="Server sync — běží na pozadí"
            description="Spustí dlouhý sync přímo na serveru. Pokračuje i po zavření aplikace, výsledek dostanete v notifikaci. Doporučeno pro 1000+ dílů. Zobrazuje % postup, ETA, počet aktualizací a chyb."
            badge="Doporučeno"
          >
            <AdminBulkPriceSyncRuns />
          </Section>

          <Section
            step={3}
            title="Ruční dávkový sync"
            description="Sync probíhá v prohlížeči — vidíte každý díl v reálném čase. Vhodné pro malé dávky a debug. Pozastaví automatický cron, aby nedošlo ke konfliktu."
          >
            <AdminBulkPriceSync />
          </Section>

          <Section
            step={4}
            title="Správa cen jednotlivých dílů"
            description="Ruční úpravy ceny, marže a uzamčení (price_locked) konkrétního dílu. Uzamčené ceny automatický sync nepřepíše."
          >
            <AdminPriceManagement />
          </Section>
        </TabsContent>

        {/* ── DIAGNOSTIKA & OPRAVY ─────────────────────────────── */}
        <TabsContent value="diagnostics" className="mt-3 space-y-3">
          <Flow steps={["1. Diagnostika", "2. Oprava chyb", "3. Doplnění fotek", "4. Export QA"]} />

          <Section
            step={1}
            title="Diagnostika katalogu"
            description="Komplexní kontrola: duplicity OEM, chybějící názvy/ceny/kategorie, nezařazené díly. Generuje seznam problémů s návrhem opravy."
          >
            <AdminCatalogDiagnostic />
          </Section>

          <Section
            step={2}
            title="Oprava nesrovnalostí"
            description="Aplikuje navržené opravy z diagnostiky — přejmenování, doplnění OEM, přiřazení kategorie. Každá oprava má náhled před aplikací."
          >
            <AdminDataFixer />
          </Section>

          <Section
            step={3}
            title="Doplnění chybějících fotek"
            description="Stáhne fotografie z Mopar, Autodoc, Google Images pro díly bez obrázku. Běží dávkově — vidíte progress a počet úspěšně doplněných."
          >
            <AdminPhotoEnrichment />
          </Section>

          <Section
            step={4}
            title="Export pro QA kontrolu"
            description="Stáhne celý katalog do CSV pro ruční ověření kvality dat (ceny, názvy, kategorie, fotky)."
          >
            <AdminCatalogQualityExport />
          </Section>

          <Section
            title="Pokročilé příkazy"
            description="Hromadné DB operace — promazání orphan záznamů, reset enrichmentu, recompute kompatibility. Pouze pro pokročilé."
            badge="Pokročilé"
          >
            <AdminCatalogCommandCenter />
          </Section>
        </TabsContent>

        {/* ── IMPORT ──────────────────────────────────────────── */}
        <TabsContent value="import" className="mt-3 space-y-3">
          <Flow steps={["1. CSV import", "2. AI import", "3. EPC import"]} />

          <Section
            step={1}
            title="CSV import"
            description="Standardní import z CSV (formát: OEM;Název;Cena). Auto-detekce oddělovače. Použijte pro hromadné nahrání položek od dodavatele."
          >
            <CatalogImport />
          </Section>

          <Section
            step={2}
            title="AI import — popis & kategorie"
            description="AI analyzuje surové názvy z CSV a doplní strukturovaný popis, kategorii, kompatibilitu a OEM."
            badge="AI"
          >
            <AICatalogImport />
          </Section>

          <Section
            step={3}
            title="EPC import — díly z nákresů"
            description="Naimportuje díly z EPC katalogu (Mopar, 7zap) včetně vazby na konkrétní vůz a pozici v nákresu."
          >
            <EPCImport />
          </Section>
        </TabsContent>

        {/* ── EPC NÁKRESY ─────────────────────────────────────── */}
        <TabsContent value="epc" className="mt-3">
          <Section
            title="Správa EPC nákresů (rozkresů)"
            description="Vytvoření, úpravy a generování interaktivních EPC nákresů s pozicemi dílů. Každý díl je klikatelný a propojený s katalogem."
          >
            <AdminEPCDiagrams />
          </Section>
        </TabsContent>

        {/* ── NASTAVENÍ ──────────────────────────────────────── */}
        <TabsContent value="settings" className="mt-3">
          <Section
            title="Nastavení katalogu"
            description="Feature flagy katalogu, marže, povolené značky a zdroje, TTL keše, parametry syncu."
          >
            <AdminCatalogSettings />
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCatalogPriceCenter;
