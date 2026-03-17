/**
 * EPC Page — Full Electronic Parts Catalog
 * Workflow: VIN Input → Category Browsing → Diagram → Part Detail
 * Integrates: vin-decode-ai, epc-diagram, oem-crossref, scrape-7zap
 */

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import VINDecoder from "@/components/catalog/VINDecoder";
import EPCBrowser from "@/components/catalog/EPCBrowser";
import { PartDetailPanel, PartDetailSheet } from "@/components/catalog/PartDetailModal";
import PhotoDialog from "@/components/catalog/PhotoDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { searchParts, type PartResult, type VINDecodeResult } from "@/api/partsAPI";
import { brands, catalogTree } from "@/components/catalog/Filters";

const EPC = () => {
  const { user, profile, isPendingBusiness, canPlaceOrder } = useAuth();
  const navigate = useNavigate();

  // Vehicle params
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [engine, setEngine] = useState("");
  const [vinData, setVinData] = useState<VINDecodeResult | null>(null);
  const [inputMode, setInputMode] = useState<"vin" | "manual">("vin");

  // Part detail
  const [selectedPart, setSelectedPart] = useState<PartResult | null>(null);
  const [photoDialog, setPhotoDialog] = useState({ open: false, oem: "", loading: false, urls: [] as string[] });
  const [submitting, setSubmitting] = useState(false);

  const isBusinessActive = profile?.account_type === "business" && profile?.status === "active";
  const discountPercent = isBusinessActive ? (profile?.discount_percent ?? 0) : 0;
  const hasVehicle = !!brand;

  const handleVinDecoded = useCallback((params: { brand: string; model: string; year: string; engine: string }) => {
    setBrand(params.brand);
    setModel(params.model);
    setYear(params.year);
    setEngine(params.engine);
  }, []);

  const handleSearchOem = useCallback(async (oem: string) => {
    try {
      const result = await searchParts(oem, 0);
      if (result.results.length > 0) {
        setSelectedPart(result.results[0]);
      } else {
        toast.info(`Díl "${oem}" nebyl nalezen v katalogu`);
      }
    } catch {
      toast.error("Chyba při vyhledávání dílu");
    }
  }, []);

  const handlePhotoClick = (oem: string) => {
    setPhotoDialog({ open: true, oem, loading: true, urls: [] });
    setTimeout(() => setPhotoDialog((prev) => ({ ...prev, loading: false })), 1000);
  };

  const handleOrderNew = async (part: PartResult) => {
    if (submitting) return;
    if (!user) { toast.error("Pro objednávku se musíte přihlásit"); navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Váš účet zatím nebyl schválen."); return; }
    setSubmitting(true);
    try {
      await supabase.from("orders").insert({
        user_id: user.id, part_id: part.id.startsWith("catalog-") ? null : part.id,
        order_type: "new" as const, quantity: 1,
        unit_price: part.price_without_vat, part_name: part.name, oem_number: part.oem_number,
        catalog_source: part.catalog_source || null,
      });
      toast.success(`Objednávka "${part.name}" vytvořena!`);
    } catch (err: any) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleOrderUsed = async (part: PartResult) => {
    if (!user) { navigate("/auth"); return; }
    if (!canPlaceOrder) { toast.error("Účet není schválen."); return; }
    try {
      await supabase.from("orders").insert({
        user_id: user.id, order_type: "used" as const, quantity: 1,
        part_name: part.name, oem_number: part.oem_number,
        catalog_source: part.catalog_source || null,
      });
      toast.success("Poptávka odeslána!");
    } catch (err: any) { toast.error(err.message); }
  };

  const handleReset = () => {
    setBrand(""); setModel(""); setYear(""); setEngine("");
    setVinData(null); setSelectedPart(null);
  };

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-12 z-30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <BookOpen className="w-5 h-5 text-primary" />
            <div className="flex-1">
              <h1 className="font-display text-xl md:text-2xl font-bold">EPC Katalog</h1>
              <p className="text-xs text-muted-foreground">
                Elektronický katalog dílů · Chrysler · Dodge · Jeep · RAM
              </p>
            </div>
            {hasVehicle && (
              <Button variant="ghost" size="sm" onClick={handleReset} className="h-8">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Nové vozidlo
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 mt-4">
        <div className="flex gap-6">
          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Step 1: Vehicle identification */}
            {!hasVehicle && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                {/* Mode toggle */}
                <div className="flex rounded-lg bg-secondary p-0.5 gap-0.5 w-fit">
                  <button
                    onClick={() => setInputMode("vin")}
                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                      inputMode === "vin" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    VIN kód
                  </button>
                  <button
                    onClick={() => setInputMode("manual")}
                    className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                      inputMode === "manual" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Ruční výběr
                  </button>
                </div>

                {inputMode === "vin" ? (
                  <VINDecoder onDecoded={handleVinDecoded} onEnrichedData={setVinData} />
                ) : (
                  <div className="space-y-3 max-w-lg">
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={brand} onValueChange={(v) => { setBrand(v); setModel(""); setEngine(""); }}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Značka" /></SelectTrigger>
                        <SelectContent>{brands.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
                      </Select>
                      {brand && catalogTree[brand] ? (
                        <Select value={model} onValueChange={(v) => { setModel(v); setEngine(""); }}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Model" /></SelectTrigger>
                          <SelectContent>{Object.keys(catalogTree[brand]).map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Select disabled><SelectTrigger className="h-10"><SelectValue placeholder="Model" /></SelectTrigger><SelectContent /></Select>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Select value={year} onValueChange={setYear}>
                        <SelectTrigger className="h-10"><SelectValue placeholder="Rok" /></SelectTrigger>
                        <SelectContent>
                          {Array.from({ length: 30 }, (_, i) => String(new Date().getFullYear() - i)).map((y) => (
                            <SelectItem key={y} value={y}>{y}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {brand && model && catalogTree[brand]?.[model] ? (
                        <Select value={engine} onValueChange={setEngine}>
                          <SelectTrigger className="h-10"><SelectValue placeholder="Motor" /></SelectTrigger>
                          <SelectContent>{catalogTree[brand][model].map((e) => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
                        </Select>
                      ) : (
                        <Select disabled><SelectTrigger className="h-10"><SelectValue placeholder="Motor" /></SelectTrigger><SelectContent /></Select>
                      )}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Step 2: EPC Browser with categories + diagrams */}
            {hasVehicle && (
              <ErrorBoundary>
                <EPCBrowser
                  brand={brand}
                  model={model}
                  engine={engine}
                  year={year}
                  onSearchOem={handleSearchOem}
                />
              </ErrorBoundary>
            )}
          </div>

          {/* Right panel — Part detail (desktop) */}
          <PartDetailPanel
            part={selectedPart}
            onClose={() => setSelectedPart(null)}
            onPhotoClick={handlePhotoClick}
            onOrderNew={handleOrderNew}
            onOrderUsed={handleOrderUsed}
            onSearchOem={handleSearchOem}
            discountPercent={discountPercent}
            disabled={isPendingBusiness || submitting}
          />
        </div>
      </div>

      {/* Mobile part detail sheet */}
      <PartDetailSheet
        part={selectedPart}
        onClose={() => setSelectedPart(null)}
        onPhotoClick={handlePhotoClick}
        onOrderNew={handleOrderNew}
        onOrderUsed={handleOrderUsed}
        onSearchOem={handleSearchOem}
        discountPercent={discountPercent}
        disabled={isPendingBusiness || submitting}
      />

      {/* Photo dialog */}
      <PhotoDialog
        open={photoDialog.open}
        oem={photoDialog.oem}
        loading={photoDialog.loading}
        urls={photoDialog.urls}
        onOpenChange={(open) => !open && setPhotoDialog((p) => ({ ...p, open: false }))}
      />
    </div>
  );
};

export default EPC;
