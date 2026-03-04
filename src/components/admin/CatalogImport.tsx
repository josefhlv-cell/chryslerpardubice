import { useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { Upload, FileSpreadsheet, Trash2, RefreshCw } from "lucide-react";

interface CatalogRow {
  oem_code: string;
  name: string;
  brand?: string;
  price: number;
  available?: boolean;
  category?: string;
}

function parseCSV(text: string): CatalogRow[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Detect separator
  const sep = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(sep).map(h => h.trim().toLowerCase().replace(/"/g, ""));

  // Map common header names
  const colMap: Record<string, string> = {};
  headers.forEach((h, i) => {
    if (h.includes("oem") || h.includes("kód") || h.includes("kod") || h.includes("code") || h.includes("číslo") || h.includes("cislo")) colMap["oem_code"] = headers[i];
    else if (h.includes("název") || h.includes("nazev") || h.includes("name") || h.includes("popis") || h.includes("díl") || h.includes("dil")) colMap["name"] = headers[i];
    else if (h.includes("značka") || h.includes("znacka") || h.includes("brand")) colMap["brand"] = headers[i];
    else if (h.includes("cena") || h.includes("price")) colMap["price"] = headers[i];
    else if (h.includes("kategori") || h.includes("categ")) colMap["category"] = headers[i];
    else if (h.includes("dostupn") || h.includes("avail") || h.includes("sklad")) colMap["available"] = headers[i];
  });

  // Fallback: if only 2-3 columns, assume oem_code, name, price
  if (!colMap["oem_code"] && headers.length >= 2) colMap["oem_code"] = headers[0];
  if (!colMap["name"] && headers.length >= 2) colMap["name"] = headers[1];
  if (!colMap["price"] && headers.length >= 3) colMap["price"] = headers[2];

  const rows: CatalogRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(sep).map(v => v.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });

    const oem = row[colMap["oem_code"]] || "";
    const name = row[colMap["name"]] || "";
    const priceStr = (row[colMap["price"]] || "0").replace(/\s/g, "").replace(",", ".");
    const price = parseFloat(priceStr) || 0;

    if (!oem && !name) continue;

    rows.push({
      oem_code: oem,
      name: name || oem,
      brand: row[colMap["brand"]] || undefined,
      price,
      available: colMap["available"] ? !["ne", "no", "0", "false"].includes(row[colMap["available"]].toLowerCase()) : true,
      category: row[colMap["category"]] || undefined,
    });
  }
  return rows;
}

const CatalogImport = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<CatalogRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [clearing, setClearing] = useState(false);

  const loadCount = async () => {
    const { count } = await supabase.from("parts_catalog").select("*", { count: "exact", head: true });
    setTotalCount(count ?? 0);
  };

  useState(() => { loadCount(); });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCSV(text);
      setPreview(rows);
      if (rows.length === 0) {
        toast({ title: "Prázdný soubor", description: "CSV neobsahuje žádné platné řádky.", variant: "destructive" });
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const doImport = async () => {
    if (!preview || preview.length === 0) return;
    setImporting(true);
    try {
      // Batch insert in chunks of 500
      const chunkSize = 500;
      for (let i = 0; i < preview.length; i += chunkSize) {
        const chunk = preview.slice(i, i + chunkSize);
        const { error } = await supabase.from("parts_catalog").insert(chunk as any);
        if (error) throw error;
      }
      toast({ title: "Import dokončen", description: `Importováno ${preview.length} dílů.` });
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      loadCount();
    } catch (err: any) {
      toast({ title: "Chyba importu", description: err.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  const clearCatalog = async () => {
    if (!confirm("Opravdu smazat celý katalog? Toto nelze vrátit.")) return;
    setClearing(true);
    // Delete all rows (RLS allows admin)
    const { error } = await supabase.from("parts_catalog").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) {
      toast({ title: "Chyba", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Katalog smazán" });
      loadCount();
    }
    setClearing(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileSpreadsheet className="w-4 h-4" />
          Import ceníku (CSV)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Nahrajte CSV soubor s díly. Očekávané sloupce: <strong>OEM kód, Název, Cena</strong> (volitelně: Značka, Kategorie, Dostupnost).
          Oddělovač: čárka nebo středník.
        </p>

        <a
          href="/test-catalog.csv"
          download="test-catalog.csv"
          className="inline-flex items-center gap-1 text-xs text-primary underline hover:no-underline"
        >
          <FileSpreadsheet className="w-3 h-3" />
          Stáhnout ukázkový CSV (15 dílů)
        </a>

        <div className="flex items-center gap-2">
          <Input ref={fileRef} type="file" accept=".csv,.txt" onChange={handleFile} className="text-xs" />
          <Button variant="outline" size="sm" onClick={loadCount}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        {totalCount !== null && (
          <p className="text-xs text-muted-foreground">
            V katalogu je aktuálně <strong>{totalCount.toLocaleString("cs")}</strong> dílů.
          </p>
        )}

        {preview && preview.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium">Náhled ({preview.length} řádků):</p>
            <div className="max-h-48 overflow-auto rounded border text-xs">
              <table className="w-full">
                <thead className="bg-muted sticky top-0">
                  <tr>
                    <th className="px-2 py-1 text-left">OEM</th>
                    <th className="px-2 py-1 text-left">Název</th>
                    <th className="px-2 py-1 text-right">Cena</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1 font-mono">{r.oem_code}</td>
                      <td className="px-2 py-1">{r.name}</td>
                      <td className="px-2 py-1 text-right">{r.price.toLocaleString("cs")} Kč</td>
                    </tr>
                  ))}
                  {preview.length > 20 && (
                    <tr><td colSpan={3} className="px-2 py-1 text-center text-muted-foreground">...a dalších {preview.length - 20}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Button onClick={doImport} disabled={importing} className="w-full">
              <Upload className="w-4 h-4 mr-1" />
              {importing ? "Importuji..." : `Importovat ${preview.length} dílů`}
            </Button>
          </div>
        )}

        {totalCount !== null && totalCount > 0 && (
          <Button variant="destructive" size="sm" onClick={clearCatalog} disabled={clearing} className="w-full">
            <Trash2 className="w-3 h-3 mr-1" />
            {clearing ? "Mažu..." : "Smazat celý katalog"}
          </Button>
        )}
      </CardContent>
    </Card>
  );
};

export default CatalogImport;
