import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { FileSpreadsheet, FileText, Loader2, RefreshCw, AlertTriangle, Wrench } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Row = {
  id: string;
  oem_number: string;
  name: string | null;
  category: string | null;
  price_with_vat: number | null;
  price_without_vat: number | null;
  description: string | null;
  image_urls: string[] | null;
  catalog_source: string | null;
  has_compat: boolean;
  issues: string[];
};

type Stats = {
  total: number;
  noPrice: number;
  noDesc: number;
  noImage: number;
  noCategory: number;
  noCompat: number;
};

const PAGE_LIMIT = 1000;

const AdminCatalogQualityExport = () => {
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<"csv" | "pdf" | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [repairLog, setRepairLog] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[]>([]);

  const runRepairs = async () => {
    setRepairing(true);
    setRepairLog([]);
    const log = (m: string) => setRepairLog((p) => [...p, m]);
    try {
      // 1) Spusť bulk price sync na chybějící ceny
      log("⏳ Spouštím synchronizaci cen pro díly bez ceny…");
      const { data: priceData, error: priceErr } = await supabase.functions.invoke("bulk-price-sync", {
        body: { action: "start", mode: "missing" },
      });
      if (priceErr) log(`⚠️ Ceny: ${priceErr.message}`);
      else log(`✅ Ceny: spuštěno (cíl ${priceData?.totalTarget ?? "?"} dílů, běží v pozadí)`);

      // 2) Enrich from J+M (popisy + fotky), iterativně po dávkách
      log("⏳ Doplňuji popisy a fotky z J+M…");
      let totalUpdated = 0;
      let totalScanned = 0;
      for (let i = 0; i < 5; i++) {
        const { data, error } = await supabase.functions.invoke("enrich-from-jm", {
          body: {},
        });
        if (error) {
          log(`⚠️ Enrich dávka ${i + 1}: ${error.message}`);
          break;
        }
        const u = (data as any)?.updated ?? 0;
        const s = (data as any)?.scanned ?? 0;
        totalUpdated += u;
        totalScanned += s;
        log(`  · dávka ${i + 1}: doplněno ${u}/${s}`);
        if (u === 0) break;
      }
      log(`✅ Enrich hotovo: doplněno ${totalUpdated} (z ${totalScanned} prověřených)`);

      // 3) Spusť párování vozidel
      log("⏳ Spouštím párování dílů na vozidla…");
      const { data: matchData, error: matchErr } = await supabase.functions.invoke("compat-matcher", {
        body: { mode: "auto", limit: 500 },
      });
      if (matchErr) log(`⚠️ Compat: ${matchErr.message}`);
      else log(`✅ Compat: ${(matchData as any)?.matched ?? 0} nových párování`);

      toast({ title: "Opravy spuštěny", description: "Sleduj postup v logu níže. Cenová synchronizace běží v pozadí." });
      // Reload stats
      await loadDiagnostics();
    } catch (e: any) {
      log(`❌ Chyba: ${e.message}`);
      toast({ title: "Chyba oprav", description: e.message, variant: "destructive" });
    } finally {
      setRepairing(false);
    }
  };

  const loadDiagnostics = async () => {
    setLoading(true);
    try {
      const [totalQ, noPriceQ, noDescQ, noImgQ, noCatQ] = await Promise.all([
        supabase.from("parts_new").select("id", { count: "exact", head: true }),
        supabase.from("parts_new").select("id", { count: "exact", head: true }).or("price_with_vat.is.null,price_with_vat.eq.0"),
        supabase.from("parts_new").select("id", { count: "exact", head: true }).or("description.is.null,description.eq."),
        supabase.from("parts_new").select("id", { count: "exact", head: true }).is("image_urls", null),
        supabase.from("parts_new").select("id", { count: "exact", head: true }).or("category.is.null,category.eq."),
      ]);

      const { data: parts } = await supabase
        .from("parts_new")
        .select("id, oem_number, name, category, price_with_vat, price_without_vat, description, image_urls, catalog_source")
        .order("oem_number", { ascending: true })
        .limit(PAGE_LIMIT);

      const ids = (parts || []).map((p: any) => p.id);
      const compatSet = new Set<string>();
      if (ids.length) {
        const { data: compat } = await supabase
          .from("catalog_vehicle_compatibility")
          .select("part_id")
          .in("part_id", ids);
        (compat || []).forEach((c: any) => compatSet.add(c.part_id));
      }

      const enriched: Row[] = (parts || []).map((p: any) => {
        const issues: string[] = [];
        if (!p.price_with_vat || p.price_with_vat <= 0) issues.push("bez ceny");
        if (!p.description || !String(p.description).trim()) issues.push("bez popisu");
        if (!p.image_urls || (Array.isArray(p.image_urls) && p.image_urls.length === 0)) issues.push("bez fotky");
        if (!p.category || !String(p.category).trim()) issues.push("bez kategorie");
        if (!compatSet.has(p.id)) issues.push("bez vozidla");
        return { ...p, has_compat: compatSet.has(p.id), issues };
      });

      const noCompatCount = enriched.filter((r) => !r.has_compat).length;

      setStats({
        total: totalQ.count || 0,
        noPrice: noPriceQ.count || 0,
        noDesc: noDescQ.count || 0,
        noImage: noImgQ.count || 0,
        noCategory: noCatQ.count || 0,
        noCompat: noCompatCount,
      });
      setRows(enriched.filter((r) => r.issues.length > 0));
      toast({ title: "Diagnostika hotová", description: `${enriched.length} dílů zkontrolováno (vzorek ${PAGE_LIMIT}).` });
    } catch (e: any) {
      toast({ title: "Chyba", description: e.message, variant: "destructive" });
    }
    setLoading(false);
  };

  const exportCsv = () => {
    if (!rows.length) return;
    setExporting("csv");
    try {
      const header = ["OEM", "Název", "Kategorie", "Cena s DPH", "Zdroj", "Problémy"];
      const lines = [header.join(";")];
      rows.forEach((r) => {
        const row = [
          r.oem_number,
          (r.name || "").replace(/[;\n\r]/g, " "),
          (r.category || "").replace(/[;\n\r]/g, " "),
          r.price_with_vat?.toString() || "0",
          r.catalog_source || "",
          r.issues.join("|"),
        ];
        lines.push(row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(";"));
      });
      const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `katalog-diagnostika-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = () => {
    if (!rows.length || !stats) return;
    setExporting("pdf");
    try {
      const doc = new jsPDF({ orientation: "landscape" });
      doc.setFontSize(14);
      doc.text("Diagnostika katalogu Chrysler Pardubice", 14, 14);
      doc.setFontSize(9);
      doc.text(`Datum: ${new Date().toLocaleString("cs-CZ")}`, 14, 20);
      doc.text(
        `Celkem: ${stats.total} | Bez ceny: ${stats.noPrice} | Bez popisu: ${stats.noDesc} | Bez fotky: ${stats.noImage} | Bez kategorie: ${stats.noCategory} | Bez vozidla (ve vzorku): ${stats.noCompat}`,
        14,
        26,
      );
      autoTable(doc, {
        startY: 32,
        head: [["OEM", "Název", "Kategorie", "Cena", "Zdroj", "Problémy"]],
        body: rows.slice(0, 500).map((r) => [
          r.oem_number,
          (r.name || "").slice(0, 50),
          (r.category || "").slice(0, 25),
          r.price_with_vat ? `${r.price_with_vat} Kč` : "—",
          r.catalog_source || "",
          r.issues.join(", "),
        ]),
        styles: { fontSize: 7, cellPadding: 1.5 },
        headStyles: { fillColor: [13, 17, 23] },
      });
      doc.save(`katalog-diagnostika-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> Diagnostika kvality katalogu
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Najde díly bez ceny, popisu, fotky, kategorie nebo bez napárovaného vozidla. Export do CSV / PDF.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={loadDiagnostics} size="sm" variant="outline" disabled={loading} className="gap-1">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Spustit
            </Button>
            <Button onClick={exportCsv} size="sm" disabled={!rows.length || !!exporting} className="gap-1">
              {exporting === "csv" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileSpreadsheet className="w-4 h-4" />} CSV
            </Button>
            <Button onClick={exportPdf} size="sm" variant="secondary" disabled={!rows.length || !!exporting} className="gap-1">
              {exporting === "pdf" ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />} PDF
            </Button>
          </div>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
            <Stat label="Celkem" value={stats.total} />
            <Stat label="Bez ceny" value={stats.noPrice} tone="amber" />
            <Stat label="Bez popisu" value={stats.noDesc} tone="amber" />
            <Stat label="Bez fotky" value={stats.noImage} tone="amber" />
            <Stat label="Bez kategorie" value={stats.noCategory} tone="red" />
            <Stat label="Bez vozidla*" value={stats.noCompat} tone="red" />
          </div>
        )}

        {rows.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Nalezeno <strong>{rows.length}</strong> problémových dílů (ve vzorku {PAGE_LIMIT}). *„Bez vozidla“ je počítán jen ve vzorku.
          </div>
        )}

        {rows.length > 0 && (
          <div className="max-h-72 overflow-y-auto rounded-md border border-border/40 divide-y divide-border/30">
            {rows.slice(0, 50).map((r) => (
              <div key={r.id} className="p-2 text-[11px] flex items-center gap-2 flex-wrap">
                <span className="font-mono text-muted-foreground w-28 shrink-0">{r.oem_number}</span>
                <span className="truncate flex-1 min-w-0">{r.name || "—"}</span>
                {r.issues.map((i) => (
                  <Badge key={i} variant="outline" className="text-[9px] border-amber-500/40 text-amber-300/80">
                    {i}
                  </Badge>
                ))}
              </div>
            ))}
            {rows.length > 50 && (
              <div className="p-2 text-[10px] text-center text-muted-foreground">
                … dalších {rows.length - 50} viz CSV/PDF
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat = ({ label, value, tone }: { label: string; value: number; tone?: "amber" | "red" }) => (
  <div className={`p-2 rounded-md border ${tone === "red" ? "border-destructive/40 bg-destructive/5" : tone === "amber" ? "border-amber-500/40 bg-amber-500/5" : "border-border/40 bg-card"}`}>
    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    <div className="text-lg font-semibold">{value.toLocaleString("cs")}</div>
  </div>
);

export default AdminCatalogQualityExport;
