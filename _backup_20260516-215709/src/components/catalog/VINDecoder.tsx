/**
 * VINDecoder Component
 * Decodes VIN via vin-decode-ai backend function.
 * Displays enriched specs, common issues, service intervals.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Search, Car, Wrench, AlertTriangle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { decodeAndSetupVehicle, type VINDecodeResult } from "@/api/partsAPI";
import { useAuth } from "@/contexts/AuthContext";

interface VINDecoderProps {
  onDecoded: (params: { brand: string; model: string; year: string; engine: string }) => void;
  onEnrichedData?: (data: VINDecodeResult) => void;
}

const VINDecoder = ({ onDecoded, onEnrichedData }: VINDecoderProps) => {
  const { user } = useAuth();
  const [vin, setVin] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<VINDecodeResult | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const handleDecode = async () => {
    const cleaned = vin.replace(/[^A-Z0-9]/gi, "").toUpperCase();
    if (cleaned.length < 11) {
      toast.error("VIN musí mít minimálně 11 znaků");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const data = await decodeAndSetupVehicle(cleaned, user?.id);
      setResult(data);
      setRetryCount(0);

      const params = {
        brand: data.basic.brand,
        model: data.basic.model,
        year: data.basic.year,
        engine: [data.basic.engine_displacement, data.basic.engine_cylinders ? `${data.basic.engine_cylinders}V` : ""].filter(Boolean).join(" "),
      };
      onDecoded(params);
      onEnrichedData?.(data);
      toast.success("VIN dekódován úspěšně");
    } catch (err: any) {
      setError(err.message || "Nepodařilo se dekódovat VIN");
      if (retryCount < 2) {
        toast.error("Chyba při dekódování, zkuste to znovu");
      } else {
        toast.error("Opakovaná chyba – zkontrolujte VIN a zkuste později");
      }
      setRetryCount((c) => c + 1);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-4">
      {/* VIN Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Car className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Zadejte VIN kód (17 znaků)..."
            className="pl-10 h-11 font-mono text-sm tracking-wider"
            value={vin}
            maxLength={17}
            onChange={(e) => setVin(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""))}
            onKeyDown={(e) => e.key === "Enter" && handleDecode()}
          />
        </div>
        <Button onClick={handleDecode} disabled={loading || vin.length < 11} className="h-11 px-6">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          <span className="ml-2 hidden sm:inline">Dekódovat</span>
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0" />
          <p className="text-xs text-destructive">{error}</p>
          <Button size="sm" variant="ghost" className="ml-auto h-7 text-xs" onClick={handleDecode}>
            Zkusit znovu
          </Button>
        </div>
      )}

      {/* Decoded result */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3"
          >
            {/* Basic info */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-lg font-bold">
                  {result.basic.brand} {result.basic.model}
                </p>
                <p className="text-sm text-muted-foreground">
                  {result.basic.year} · {result.basic.trim}
                </p>
              </div>
              <Badge variant="outline" className="text-[10px] border-primary/30 text-primary">
                VIN: {result.basic.vin?.slice(-6)}
              </Badge>
            </div>

            {/* Key specs grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <SpecCard label="Motor" value={`${result.basic.engine_displacement} ${result.basic.engine_cylinders || ""}V`} />
              <SpecCard label="Palivo" value={result.basic.fuel_type} />
              <SpecCard label="Převodovka" value={result.basic.transmission} />
              <SpecCard label="Pohon" value={result.basic.drive_type} />
            </div>

            {/* Expand for enriched data */}
            {result.enriched && (
              <>
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  {showDetails ? "Skrýt detaily" : "Zobrazit AI analýzu"}
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-3 overflow-hidden"
                    >
                      {/* Service intervals */}
                      {result.enriched.service_intervals && result.enriched.service_intervals.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Clock className="w-3 h-3" /> Servisní intervaly
                          </p>
                          <div className="grid gap-1">
                            {result.enriched.service_intervals.map((si, i) => (
                              <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-card border border-border/50 text-xs">
                                <span className="font-medium">{si.service_name}</span>
                                <span className="text-muted-foreground">
                                  {si.interval_km?.toLocaleString("cs")} km / {si.interval_months} měs.
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Common issues */}
                      {result.enriched.common_issues && result.enriched.common_issues.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
                            <Wrench className="w-3 h-3" /> Známé problémy
                          </p>
                          <div className="space-y-1">
                            {result.enriched.common_issues.map((issue, i) => (
                              <div key={i} className="flex items-start gap-2 p-2 rounded-lg bg-card border border-border/50 text-xs">
                                <AlertTriangle className="w-3 h-3 text-accent shrink-0 mt-0.5" />
                                <span>{issue}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Equipment highlights */}
                      {result.enriched.equipment_highlights && result.enriched.equipment_highlights.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Výbava</p>
                          <div className="flex flex-wrap gap-1">
                            {result.enriched.equipment_highlights.map((eq, i) => (
                              <Badge key={i} variant="secondary" className="text-[10px]">{eq}</Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

const SpecCard = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg bg-card border border-border/50 p-2 text-center">
    <p className="text-[10px] text-muted-foreground">{label}</p>
    <p className="text-xs font-semibold truncate">{value || "—"}</p>
  </div>
);

export default VINDecoder;
