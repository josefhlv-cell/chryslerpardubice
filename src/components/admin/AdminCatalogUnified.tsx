/**
 * AdminCatalogUnified — jedno místo pro všechny nástroje katalogu.
 *
 * Sjednocuje dříve roztříštěné záložky (Katalog / Import / Diagnostika & opravy /
 * Ceny / EPC nákresy / Nastavení) do jedné přehledné záložky se sub-taby.
 */
import { useState } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  LayoutDashboard,
  Upload,
  Wrench,
  DollarSign,
  LayoutGrid,
  Settings2,
} from "lucide-react";

import AdminCatalogHub from "./AdminCatalogHub";
import AICatalogImport from "./AICatalogImport";
import CatalogImport from "./CatalogImport";
import EPCImport from "./EPCImport";
import AdminCatalogSettings from "./AdminCatalogSettings";
import AdminCatalogQualityExport from "./AdminCatalogQualityExport";
import AdminCatalogCommandCenter from "./AdminCatalogCommandCenter";
import AdminDataFixer from "./AdminDataFixer";
import AdminPhotoEnrichment from "./AdminPhotoEnrichment";
import AdminPriceSyncStats from "./AdminPriceSyncStats";
import AdminBulkPriceSyncRuns from "./AdminBulkPriceSyncRuns";
import AdminBulkPriceSync from "./AdminBulkPriceSync";
import AdminPriceManagement from "./AdminPriceManagement";
import AdminEPCDiagrams from "./AdminEPCDiagrams";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

type Sub =
  | "overview"
  | "import"
  | "repair"
  | "prices"
  | "epc"
  | "settings";

const TABS: { id: Sub; label: string; icon: any; flag?: string }[] = [
  { id: "overview", label: "Přehled", icon: LayoutDashboard },
  { id: "import", label: "Import", icon: Upload },
  { id: "repair", label: "Diagnostika & opravy", icon: Wrench },
  { id: "prices", label: "Ceny", icon: DollarSign, flag: "price_management" },
  { id: "epc", label: "EPC nákresy", icon: LayoutGrid, flag: "epc_diagrams" },
  { id: "settings", label: "Nastavení", icon: Settings2 },
];

const AdminCatalogUnified = () => {
  const [tab, setTab] = useState<Sub>("overview");
  const { isEnabled } = useFeatureFlags();

  const visible = TABS.filter((t) => !t.flag || isEnabled(t.flag as any));

  return (
    <div className="space-y-3">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Sub)}>
        <TabsList className="w-full overflow-x-auto flex-nowrap justify-start gap-1 h-auto p-1">
          {visible.map(({ id, label, icon: Icon }) => (
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

        <TabsContent value="overview" className="mt-3">
          <AdminCatalogHub />
        </TabsContent>

        <TabsContent value="import" className="mt-3 space-y-4">
          <AICatalogImport />
          <CatalogImport />
          <EPCImport />
        </TabsContent>

        <TabsContent value="repair" className="mt-3 space-y-4">
          <AdminPhotoEnrichment />
          <AdminDataFixer />
          <AdminCatalogQualityExport />
          <AdminCatalogCommandCenter />
        </TabsContent>

        {isEnabled("price_management") && (
          <TabsContent value="prices" className="mt-3 space-y-4">
            <AdminPriceSyncStats />
            <AdminBulkPriceSyncRuns />
            <AdminBulkPriceSync />
            <AdminPriceManagement />
          </TabsContent>
        )}

        {isEnabled("epc_diagrams") && (
          <TabsContent value="epc" className="mt-3">
            <AdminEPCDiagrams />
          </TabsContent>
        )}

        <TabsContent value="settings" className="mt-3">
          <AdminCatalogSettings />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default AdminCatalogUnified;
