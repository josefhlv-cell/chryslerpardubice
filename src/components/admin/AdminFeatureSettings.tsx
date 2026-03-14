import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

const AdminFeatureSettings = () => {
  const { allFlags, loading, toggleFlag, refetch } = useFeatureFlags();

  const handleToggle = async (key: string, current: boolean) => {
    await toggleFlag(key, !current);
    toast({ title: !current ? "Modul zapnut" : "Modul vypnut" });
  };

  if (loading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 mb-2">
        <Settings2 className="w-4 h-4 text-primary" />
        <h3 className="font-display font-semibold text-sm">Moduly aplikace</h3>
      </div>
      {allFlags.map((f) => (
        <Card key={f.id} className="hover:border-primary/20 transition-colors">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{f.description || f.feature_key}</p>
                <Badge variant="outline" className="text-[10px]">{f.feature_key}</Badge>
              </div>
            </div>
            <Switch
              checked={f.enabled}
              onCheckedChange={() => handleToggle(f.feature_key, f.enabled)}
            />
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default AdminFeatureSettings;
