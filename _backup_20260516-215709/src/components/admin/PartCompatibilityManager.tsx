import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Loader2, Plus, Trash2, Search } from "lucide-react";
import type { NextisVehicle } from "@/api/catalogV2API";
import { fetchNextisVehicles } from "@/api/catalogV2API";

type Props = {
  partId: string;
  partOem: string;
  partSource: string;
};

type LinkedRow = {
  id: string;
  nextis_vehicle_id: string;
  is_oem: boolean;
  match_method: string | null;
  match_confidence: number | null;
  vehicle?: NextisVehicle | null;
};

export default function PartCompatibilityManager({ partId, partOem, partSource }: Props) {
  const [linked, setLinked] = useState<LinkedRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<NextisVehicle[]>([]);
  const [searching, setSearching] = useState(false);

  const isOemSource = ["mopar", "mopar_oem", "csv", "epc-ai", "7zap", "epc-link"].includes(
    (partSource || "").toLowerCase()
  );

  async function loadLinked() {
    setLoading(true);
    const { data, error } = await supabase
      .from("catalog_vehicle_compatibility")
      .select("id, nextis_vehicle_id, is_oem, match_method, match_confidence")
      .eq("part_id", partId)
      .not("nextis_vehicle_id", "is", null);

    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      setLoading(false);
      return;
    }

    const ids = (data || []).map((r: any) => r.nextis_vehicle_id).filter(Boolean);
    let vehMap = new Map<string, NextisVehicle>();
    if (ids.length) {
      const { data: vehs } = await supabase
        .from("nextis_vehicles")
        .select("id, brand, model, engine, year_from, year_to")
        .in("id", ids);
      (vehs || []).forEach((v: any) => vehMap.set(v.id, v));
    }
    setLinked(
      (data || []).map((r: any) => ({ ...r, vehicle: vehMap.get(r.nextis_vehicle_id) || null }))
    );
    setLoading(false);
  }

  useEffect(() => {
    loadLinked();
  }, [partId]);

  async function searchVehicles() {
    if (!search.trim()) return;
    setSearching(true);
    const term = `%${search.trim()}%`;
    const { data, error } = await supabase
      .from("nextis_vehicles")
      .select("id, brand, model, engine, year_from, year_to")
      .or(`brand.ilike.${term},model.ilike.${term},engine.ilike.${term}`)
      .limit(50);
    setSearching(false);
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    setResults((data || []) as NextisVehicle[]);
  }

  async function attach(v: NextisVehicle) {
    const { error } = await supabase.from("catalog_vehicle_compatibility").upsert(
      {
        part_id: partId,
        nextis_vehicle_id: v.id,
        brand: v.brand,
        model: v.model,
        engine: v.engine,
        year_from: v.year_from,
        year_to: v.year_to,
        is_oem: isOemSource,
        match_method: "manual",
        match_confidence: 100,
        source: "manual",
      },
      { onConflict: "part_id,nextis_vehicle_id" }
    );
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: "Připojeno", description: `${v.brand} ${v.model} ${v.engine || ""}` });
    loadLinked();
  }

  async function detach(linkId: string) {
    const { error } = await supabase.from("catalog_vehicle_compatibility").delete().eq("id", linkId);
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    loadLinked();
  }

  async function autoMatch() {
    toast({ title: "Spouštím auto-match…" });
    const { data, error } = await supabase.functions.invoke("compat-matcher", {
      body: { action: "match-part", part_id: partId },
    });
    if (error) return toast({ title: "Chyba", description: error.message, variant: "destructive" });
    toast({
      title: "Hotovo",
      description: `Exact: ${data?.exact || 0}, Fuzzy: ${data?.fuzzy || 0}, Queue: ${data?.queued || 0}`,
    });
    loadLinked();
  }

  return (
    <Card className="border-amber-500/20 bg-slate-900/40">
      <CardHeader>
        <CardTitle className="text-amber-400 text-base flex items-center justify-between">
          Kompatibilita s vozidly (Nextis)
          <Button size="sm" variant="outline" onClick={autoMatch}>
            Auto-Match
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-xs text-muted-foreground">
          OEM: <span className="font-mono">{partOem}</span> · Zdroj:{" "}
          <Badge variant={isOemSource ? "default" : "secondary"}>{partSource}</Badge>
        </div>

        {/* Search & attach */}
        <div className="flex gap-2">
          <Input
            placeholder="Hledat: značka, model nebo motor…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchVehicles()}
          />
          <Button onClick={searchVehicles} disabled={searching}>
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          </Button>
        </div>

        {results.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded p-2">
            {results.map((v) => (
              <div key={v.id} className="flex items-center justify-between text-sm py-1">
                <span>
                  {v.brand} {v.model} {v.engine && `· ${v.engine}`}{" "}
                  {v.year_from && (
                    <span className="text-muted-foreground">
                      ({v.year_from}–{v.year_to || "…"})
                    </span>
                  )}
                </span>
                <Button size="sm" variant="ghost" onClick={() => attach(v)}>
                  <Plus className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* Linked vehicles */}
        <div>
          <div className="text-sm font-semibold mb-2">Připojená vozidla ({linked.length})</div>
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : linked.length === 0 ? (
            <div className="text-xs text-muted-foreground italic">
              Žádné vazby — díl je zatím v sekci „Univerzální / Bez specifikace vozu".
            </div>
          ) : (
            <div className="space-y-1">
              {linked.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between text-sm bg-slate-800/40 rounded px-2 py-1"
                >
                  <div className="flex items-center gap-2">
                    {l.is_oem && <Badge className="bg-amber-500 text-black text-xs">OEM</Badge>}
                    <span>
                      {l.vehicle
                        ? `${l.vehicle.brand} ${l.vehicle.model} ${l.vehicle.engine || ""}`
                        : l.nextis_vehicle_id}
                    </span>
                    <Badge variant="outline" className="text-[10px]">
                      {l.match_method} {l.match_confidence}%
                    </Badge>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => detach(l.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
