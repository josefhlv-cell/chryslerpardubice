import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Settings2, BookOpen, ShoppingBag } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Definice metadat pro známé feature flagy
const CATALOG_FLAGS: Record<string, { label: string; desc: string; icon: any; group: string }> = {
  catalog_jm: {
    label: "J+M Autodíly (Nextis)",
    desc: "Aftermarket náhrady – Bosch, TRW, MANN a dalších 300+ výrobců",
    icon: ShoppingBag,
    group: "Katalog dílů",
  },
  catalog_epc: {
    label: "EPC katalog",
    desc: "Elektronický katalog dílů přes VIN nebo ruční výběr vozidla",
    icon: BookOpen,
    group: "Katalog dílů",
  },
  catalog: {
    label: "Mopar OEM katalog",
    desc: "Originální díly Chrysler, Dodge, RAM z Mopar EPC",
    icon: ShoppingBag,
    group: "Katalog dílů",
  },
};

const AdminFeatureSettings = () => {
  const { allFlags, loading, toggleFlag } = useFeatureFlags();

  const handleToggle = async (key: string, current: boolean) => {
    await toggleFlag(key, !current);
    toast({ title: !current ? "Modul zapnut" : "Modul vypnut" });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-primary"/>
      </div>
    );
  }

  // Rozdělení flagů na katalogy a ostatní
  const catalogFlagKeys = Object.keys(CATALOG_FLAGS);
  const catalogFlags = allFlags.filter((f) => catalogFlagKeys.includes(f.feature_key));
  const otherFlags = allFlags.filter((f) => !catalogFlagKeys.includes(f.feature_key));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-4 h-4 text-primary"/>
        <h3 className="font-display font-semibold text-sm">Moduly aplikace</h3>
      </div>

      
      {catalogFlags.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Katalog dílů
          </p>
          {catalogFlags.map((f) => {
            const meta = CATALOG_FLAGS[f.feature_key];
            const Icon = meta?.icon || ShoppingBag;
            return (
              <Card key="{f.id}" className="{f.enabled" ? "border-primary/40" : ""}>
                <CardContent className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`p-1.5 rounded-lg shrink-0 ${f.enabled ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"}`}>
                      <Icon className="w-4 h-4"/>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">{meta?.label || f.feature_key}</p>
                        {f.enabled ? (
                          <Badge className="bg-green-100 text-green-800 text-[10px]">Zapnuto</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px]">Vypnuto</Badge>
                        )}
                      </div>
                      {meta?.desc && (
                        <p className="text-xs text-muted-foreground mt-0.5">{meta.desc}</p>
                      )}
                    </div>
                  </div>
                  <Switch checked="{f.enabled}" onCheckedChange="{()"> handleToggle(f.feature_key, f.enabled)}
                  />
                </Switch></CardContent>
              </Card>
            );
          })}
        </div>
      )}

      
      {otherFlags.length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-1">
            Ostatní moduly
          </p>
          {otherFlags.map((f) => (
            <Card key="{f.id}" className="hover:border-primary/20 transition-colors">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{f.description || f.feature_key}</p>
                    <Badge variant="outline" className="text-[10px]">{f.feature_key}</Badge>
                  </div>
                </div>
                <Switch checked="{f.enabled}" onCheckedChange="{()"> handleToggle(f.feature_key, f.enabled)}
                />
              </Switch></CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminFeatureSettings;
