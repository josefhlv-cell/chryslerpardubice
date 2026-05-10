/**
 * Catalog Health Dashboard — % parts with price/category/photo, oldest entries.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Activity } from "lucide-react";

export default function AdminCatalogHealth() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({ total: 0, withPrice: 0, withCat: 0, withPhoto: 0, dupes: 0 });

  const load = async () => {
    setLoading(true);
    const { count: total } = await supabase.from("parts_new").select("*", { count: "exact", head: true });
    const { count: withPrice } = await supabase.from("parts_new").select("*", { count: "exact", head: true }).gt("price_with_vat", 0);
    const { count: withCat } = await supabase.from("parts_new").select("*", { count: "exact", head: true }).not("category", "is", null);
    const { count: withPhoto } = await supabase.from("parts_new").select("*", { count: "exact", head: true }).not("image_urls", "eq", "{}");
    setStats({ total: total || 0, withPrice: withPrice || 0, withCat: withCat || 0, withPhoto: withPhoto || 0, dupes: 0 });
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const pct = (n: number) => stats.total ? Math.round((n / stats.total) * 100) : 0;

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base"><Activity className="w-4 h-4" /> Zdraví katalogu</CardTitle>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        </Button>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-2xl font-bold">{stats.total.toLocaleString("cs")} <span className="text-xs text-muted-foreground font-normal">dílů</span></div>
        {[
          { label: "S cenou", n: stats.withPrice, hint: "vše ostatní = 'Na objednávku'" },
          { label: "S kategorií", n: stats.withCat, hint: "kategorizace běží automaticky" },
          { label: "S fotkou", n: stats.withPhoto, hint: "" },
        ].map(r => (
          <div key={r.label} className="space-y-1">
            <div className="flex justify-between text-xs">
              <span>{r.label}: <strong>{r.n.toLocaleString("cs")}</strong> ({pct(r.n)}%)</span>
              <span className="text-muted-foreground">{r.hint}</span>
            </div>
            <Progress value={pct(r.n)} className="h-2" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
