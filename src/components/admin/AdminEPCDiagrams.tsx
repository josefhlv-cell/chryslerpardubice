import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { Loader2, RefreshCw, Trash2, LayoutGrid, Sparkles } from "lucide-react";
import DOMPurify from "dompurify";

interface DiagramRow {
  id: string;
  brand: string;
  model: string;
  engine: string | null;
  category: string;
  subcategory: string | null;
  parts_count: number;
  created_at: string;
  svg_content?: string;
}

interface Stats {
  total: number;
  byBrand: Record<string, number>;
  totalParts: number;
}

const AdminEPCDiagrams = () => {
  const [diagrams, setDiagrams] = useState<DiagramRow[]>([]);
  const [stats, setStats] = useState<Stats>({ total: 0, byBrand: {}, totalParts: 0 });
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const fetchDiagrams = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("epc_diagrams" as any)
      .select("id, brand, model, engine, category, subcategory, parts_count, created_at")
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = (data || []) as unknown as DiagramRow[];
    setDiagrams(rows);

    const byBrand: Record<string, number> = {};
    let totalParts = 0;
    for (const d of rows) {
      byBrand[d.brand] = (byBrand[d.brand] || 0) + 1;
      totalParts += d.parts_count || 0;
    }
    setStats({ total: rows.length, byBrand, totalParts });
    setLoading(false);
  };

  useEffect(() => { fetchDiagrams(); }, []);

  const handleRegenerate = async (d: DiagramRow) => {
    setRegenerating(d.id);
    try {
      // Delete existing diagram
      await supabase.from("epc_diagrams" as any).delete().eq("id", d.id);

      // Get parts for this category
      const { data: catData } = await supabase
        .from("epc_categories")
        .select("id")
        .eq("brand", d.brand)
        .eq("model", d.model)
        .eq("category", d.category);

      let parts: any[] = [];
      if (catData && catData.length > 0) {
        const { data: links } = await supabase
          .from("epc_part_links")
          .select("oem_number, part_name")
          .in("epc_category_id", catData.map(c => c.id))
          .limit(30);
        parts = links || [];
      }

      // Regenerate
      const { data, error } = await supabase.functions.invoke("epc-diagram", {
        body: {
          vehicle: `${d.brand} ${d.model}`,
          category: d.category,
          subcategory: d.subcategory,
          parts,
        },
      });

      if (error || !data?.success) throw new Error(data?.error || "Failed");
      toast({ title: "Nákres regenerován", description: `${d.category} – ${data.parts_count || 0} dílů` });
      fetchDiagrams();
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
    setRegenerating(null);
  };

  const handleDelete = async (id: string) => {
    await supabase.from("epc_diagrams" as any).delete().eq("id", id);
    toast({ title: "Nákres smazán" });
    fetchDiagrams();
  };

  const handleRegenerateAll = async (brand: string, model: string) => {
    setRegenerating(`all-${brand}-${model}`);
    try {
      const toRegen = diagrams.filter(d => d.brand === brand && d.model === model);
      for (const d of toRegen) {
        await handleRegenerate(d);
      }
      toast({ title: `Všechny nákresy pro ${brand} ${model} regenerovány` });
    } catch {
      toast({ title: "Chyba při regeneraci", variant: "destructive" });
    }
    setRegenerating(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  // Group by brand+model
  const grouped = new Map<string, DiagramRow[]>();
  for (const d of diagrams) {
    const key = `${d.brand} ${d.model}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(d);
  }

  return (
    <div className="space-y-4">
      {/* Stats cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4 text-center">
            <LayoutGrid className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Nákresů celkem</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Sparkles className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{stats.totalParts}</p>
            <p className="text-xs text-muted-foreground">Dílů v nákresech</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <LayoutGrid className="w-5 h-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold">{Object.keys(stats.byBrand).length}</p>
            <p className="text-xs text-muted-foreground">Značek</p>
          </CardContent>
        </Card>
      </div>

      {/* Brand breakdown */}
      <div className="flex flex-wrap gap-2">
        {Object.entries(stats.byBrand).map(([brand, count]) => (
          <Badge key={brand} variant="outline" className="text-xs">
            {brand}: {count} nákresů
          </Badge>
        ))}
      </div>

      <Button size="sm" variant="outline" onClick={fetchDiagrams}>
        <RefreshCw className="w-3 h-3 mr-1" /> Obnovit
      </Button>

      {/* Grouped diagrams */}
      {[...grouped.entries()].map(([vehicle, items]) => (
        <div key={vehicle} className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">{vehicle}</h3>
            <Button
              size="sm" variant="outline" className="text-xs h-7"
              disabled={!!regenerating}
              onClick={() => {
                const [b, ...m] = vehicle.split(' ');
                handleRegenerateAll(b, m.join(' '));
              }}
            >
              {regenerating === `all-${vehicle.split(' ')[0]}-${vehicle.split(' ').slice(1).join(' ')}` ? (
                <Loader2 className="w-3 h-3 animate-spin mr-1" />
              ) : (
                <RefreshCw className="w-3 h-3 mr-1" />
              )}
              Regenerovat vše
            </Button>
          </div>
          {items.map((d) => (
            <Card key={d.id} className="border-border/50">
              <CardContent className="p-3 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium">{d.category}{d.subcategory ? ` › ${d.subcategory}` : ''}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {d.parts_count} dílů · {new Date(d.created_at).toLocaleDateString("cs-CZ")}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0"
                    disabled={regenerating === d.id}
                    onClick={() => handleRegenerate(d)}
                  >
                    {regenerating === d.id ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <RefreshCw className="w-3 h-3" />
                    )}
                  </Button>
                  <Button
                    size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => handleDelete(d.id)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ))}

      {diagrams.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-8">Žádné EPC nákresy v databázi</p>
      )}
    </div>
  );
};

export default AdminEPCDiagrams;
