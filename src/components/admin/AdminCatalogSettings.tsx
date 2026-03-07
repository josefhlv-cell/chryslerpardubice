import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Settings, CheckCircle } from "lucide-react";

type CatalogConfig = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  ready: boolean;
};

const AdminCatalogSettings = () => {
  const [catalogs, setCatalogs] = useState<CatalogConfig[]>([
    { id: "mopar", name: "Mopar katalog", description: "Originální díly Chrysler, Jeep, Dodge, RAM", enabled: true, ready: true },
    { id: "autokelly", name: "AutoKelly katalog", description: "Alternativní díly – připraveno k aktivaci", enabled: false, ready: true },
    { id: "intercars", name: "InterCars katalog", description: "Alternativní díly – připraveno k aktivaci", enabled: false, ready: true },
  ]);

  const toggleCatalog = (id: string) => {
    setCatalogs(prev => prev.map(c => {
      if (c.id === id) {
        const newEnabled = !c.enabled;
        toast({ title: newEnabled ? `${c.name} aktivován` : `${c.name} deaktivován` });
        return { ...c, enabled: newEnabled };
      }
      return c;
    }));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Settings className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Nastavení katalogů</h3>
      </div>

      {catalogs.map(c => (
        <Card key={c.id} className={c.enabled ? "border-primary/40" : ""}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm">{c.name}</p>
                  {c.enabled && <Badge className="bg-green-100 text-green-800 text-[10px]"><CheckCircle className="w-3 h-3 mr-0.5" />Aktivní</Badge>}
                  {!c.enabled && c.ready && <Badge variant="outline" className="text-[10px]">Připraveno</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{c.description}</p>
              </div>
              <Switch checked={c.enabled} onCheckedChange={() => toggleCatalog(c.id)} />
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardContent className="p-4">
          <h4 className="font-semibold text-sm mb-2">Stav systému</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Databáze</span><Badge className="bg-green-100 text-green-800 text-[10px]">OK</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">API katalog</span><Badge className="bg-green-100 text-green-800 text-[10px]">OK</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Aktualizace cen</span><Badge className="bg-green-100 text-green-800 text-[10px]">OK</Badge></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Notifikace</span><Badge className="bg-green-100 text-green-800 text-[10px]">OK</Badge></div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminCatalogSettings;
