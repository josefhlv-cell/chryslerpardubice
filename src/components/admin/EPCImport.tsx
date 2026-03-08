/**
 * EPC Import Component
 * Admin tool for importing EPC categories and parts from CSV.
 * Handles large datasets with chunked inserts.
 */

import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Trash2, RefreshCw, Layers, Sparkles, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";

interface EPCCategoryRow {
  brand: string;
  model: string;
  engine?: string;
  year_from?: number;
  year_to?: number;
  category: string;
  subcategory?: string;
}

interface EPCPartRow {
  category_key: string; // brand|model|engine|category for matching
  oem_number: string;
  part_name: string;
  manufacturer?: string;
  note?: string;
}

function parseEPCCategoriesCSV(text: string): EPCCategoryRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ""));

  const rows: EPCCategoryRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });

    const brand = row["brand"] || row["znacka"] || row["značka"] || "";
    const model = row["model"] || "";
    const category = row["category"] || row["kategorie"] || "";
    if (!brand || !model || !category) continue;

    rows.push({
      brand,
      model,
      engine: row["engine"] || row["motor"] || undefined,
      year_from: row["year_from"] || row["rok_od"] ? parseInt(row["year_from"] || row["rok_od"]) : undefined,
      year_to: row["year_to"] || row["rok_do"] ? parseInt(row["year_to"] || row["rok_do"]) : undefined,
      category,
      subcategory: row["subcategory"] || row["podkategorie"] || undefined,
    });
  }
  return rows;
}

function parseEPCPartsCSV(text: string): EPCPartRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ""));

  const rows: EPCPartRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });

    const oem = row["oem_number"] || row["oem"] || row["oem_cislo"] || row["oem_code"] || "";
    const name = row["part_name"] || row["nazev"] || row["název"] || row["nazev_dilu"] || row["název_dílu"] || "";
    const brand = row["brand"] || row["znacka"] || row["značka"] || "";
    const model = row["model"] || "";
    const engine = row["engine"] || row["motor"] || "";
    const category = row["category"] || row["kategorie"] || "";

    if (!oem && !name) continue;

    rows.push({
      category_key: `${brand}|${model}|${engine}|${category}`,
      oem_number: oem,
      part_name: name || oem,
      manufacturer: row["manufacturer"] || row["vyrobce"] || row["výrobce"] || undefined,
      note: row["note"] || row["poznamka"] || row["poznámka"] || undefined,
    });
  }
  return rows;
}

const EPCImport = () => {
  const catFileRef = useRef<HTMLInputElement>(null);
  const partFileRef = useRef<HTMLInputElement>(null);
  const [catPreview, setCatPreview] = useState<EPCCategoryRow[] | null>(null);
  const [partPreview, setPartPreview] = useState<EPCPartRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [catCount, setCatCount] = useState<number | null>(null);
  const [partCount, setPartCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadCounts = async () => {
    const [cats, parts] = await Promise.all([
      supabase.from("epc_categories").select("*", { count: "exact", head: true }),
      supabase.from("epc_part_links").select("*", { count: "exact", head: true }),
    ]);
    setCatCount(cats.count ?? 0);
    setPartCount(parts.count ?? 0);
  };

  useState(() => { loadCounts(); });

  const handleCatFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseEPCCategoriesCSV(ev.target?.result as string);
      setCatPreview(rows);
      if (rows.length === 0) toast({ title: "Prázdný soubor", variant: "destructive" });
    };
    reader.readAsText(file, "utf-8");
  };

  const handlePartFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const rows = parseEPCPartsCSV(ev.target?.result as string);
      setPartPreview(rows);
      if (rows.length === 0) toast({ title: "Prázdný soubor", variant: "destructive" });
    };
    reader.readAsText(file, "utf-8");
  };

  const importCategories = async () => {
    if (!catPreview || catPreview.length === 0) return;
    setImporting(true);
    setProgress(0);
    try {
      const chunkSize = 500;
      for (let i = 0; i < catPreview.length; i += chunkSize) {
        const chunk = catPreview.slice(i, i + chunkSize);
        const { error } = await supabase.from("epc_categories").insert(chunk as any);
        if (error) throw error;
        setProgress(Math.round(((i + chunkSize) / catPreview.length) * 100));
      }
      toast({ title: "Import kategorií dokončen", description: `${catPreview.length} kategorií.` });
      setCatPreview(null);
      if (catFileRef.current) catFileRef.current.value = "";
      loadCounts();
    } catch (err: any) {
      toast({ title: "Chyba importu", description: err.message, variant: "destructive" });
    } finally { setImporting(false); setProgress(0); }
  };

  const importParts = async () => {
    if (!partPreview || partPreview.length === 0) return;
    setImporting(true);
    setProgress(0);
    try {
      // First get all categories to map category_key -> id
      const { data: allCats } = await supabase.from("epc_categories").select("id, brand, model, engine, category");
      const catMap = new Map<string, string>();
      (allCats || []).forEach((c: any) => {
        catMap.set(`${c.brand}|${c.model}|${c.engine || ""}|${c.category}`, c.id);
      });

      const insertRows: any[] = [];
      let unmapped = 0;
      for (const p of partPreview) {
        const catId = catMap.get(p.category_key);
        if (!catId) { unmapped++; continue; }
        insertRows.push({
          epc_category_id: catId,
          oem_number: p.oem_number,
          part_name: p.part_name,
          manufacturer: p.manufacturer || null,
          note: p.note || null,
        });
      }

      const chunkSize = 500;
      for (let i = 0; i < insertRows.length; i += chunkSize) {
        const chunk = insertRows.slice(i, i + chunkSize);
        const { error } = await supabase.from("epc_part_links").insert(chunk);
        if (error) throw error;
        setProgress(Math.round(((i + chunkSize) / insertRows.length) * 100));
      }

      const desc = unmapped > 0
        ? `${insertRows.length} dílů. ${unmapped} bez kategorie.`
        : `${insertRows.length} dílů.`;
      toast({ title: "Import dílů dokončen", description: desc });
      setPartPreview(null);
      if (partFileRef.current) partFileRef.current.value = "";
      loadCounts();
    } catch (err: any) {
      toast({ title: "Chyba importu", description: err.message, variant: "destructive" });
    } finally { setImporting(false); setProgress(0); }
  };

  const clearEPC = async () => {
    if (!confirm("Smazat všechna EPC data (kategorie + díly)? Toto nelze vrátit.")) return;
    setClearing(true);
    await supabase.from("epc_part_links").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase.from("epc_categories").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    toast({ title: "EPC data smazána" });
    loadCounts();
    setClearing(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Layers className="w-4 h-4" />
          Import EPC katalogu
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Import EPC dat ve dvou krocích: nejprve kategorie, poté díly.
        </p>

        {catCount !== null && partCount !== null && (
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Kategorie: <strong>{catCount.toLocaleString("cs")}</strong></span>
            <span>Díly: <strong>{partCount.toLocaleString("cs")}</strong></span>
          </div>
        )}

        {importing && progress > 0 && (
          <Progress value={progress} className="h-2" />
        )}

        {/* Categories import */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-semibold">1. Kategorie EPC</p>
          <p className="text-[10px] text-muted-foreground">
            CSV: brand;model;engine;year_from;year_to;category;subcategory
          </p>
          <Input ref={catFileRef} type="file" accept=".csv,.txt" onChange={handleCatFile} className="text-xs" />
          {catPreview && catPreview.length > 0 && (
            <>
              <p className="text-xs">{catPreview.length} kategorií k importu</p>
              <div className="max-h-32 overflow-auto text-[10px] border rounded p-1">
                {catPreview.slice(0, 5).map((r, i) => (
                  <div key={i}>{r.brand} · {r.model} · {r.category} {r.subcategory ? `/ ${r.subcategory}` : ""}</div>
                ))}
                {catPreview.length > 5 && <div className="text-muted-foreground">...a dalších {catPreview.length - 5}</div>}
              </div>
              <Button size="sm" onClick={importCategories} disabled={importing} className="w-full">
                <Upload className="w-3 h-3 mr-1" />
                {importing ? "Importuji..." : `Importovat ${catPreview.length} kategorií`}
              </Button>
            </>
          )}
        </div>

        {/* Parts import */}
        <div className="space-y-2 rounded-lg border p-3">
          <p className="text-xs font-semibold">2. Díly EPC</p>
          <p className="text-[10px] text-muted-foreground">
            CSV: brand;model;engine;category;oem_number;part_name;manufacturer;note
          </p>
          <Input ref={partFileRef} type="file" accept=".csv,.txt" onChange={handlePartFile} className="text-xs" />
          {partPreview && partPreview.length > 0 && (
            <>
              <p className="text-xs">{partPreview.length} dílů k importu</p>
              <div className="max-h-32 overflow-auto text-[10px] border rounded p-1">
                {partPreview.slice(0, 5).map((r, i) => (
                  <div key={i}>{r.oem_number} · {r.part_name} {r.manufacturer ? `(${r.manufacturer})` : ""}</div>
                ))}
                {partPreview.length > 5 && <div className="text-muted-foreground">...a dalších {partPreview.length - 5}</div>}
              </div>
              <Button size="sm" onClick={importParts} disabled={importing} className="w-full">
                <Upload className="w-3 h-3 mr-1" />
                {importing ? "Importuji..." : `Importovat ${partPreview.length} dílů`}
              </Button>
            </>
          )}
        </div>

        <Button size="sm" variant="outline" onClick={loadCounts} className="w-full">
          <RefreshCw className="w-3 h-3 mr-1" /> Obnovit počty
        </Button>

        {(catCount ?? 0) > 0 && (
          <Button variant="destructive" size="sm" onClick={clearEPC} disabled={clearing} className="w-full">
            <Trash2 className="w-3 h-3 mr-1" />
            {clearing ? "Mažu..." : "Smazat celý EPC katalog"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default EPCImport;
