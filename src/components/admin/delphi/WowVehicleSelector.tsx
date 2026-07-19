import { useEffect, useMemo, useState } from "react";
import { Car, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listBrands, type BrandManifestEntry } from "@/lib/delphi";
import { useWowVehicle, type WowActiveVehicle } from "@/lib/delphi/wow/vehicle-context";

const CURRENT_YEAR = new Date().getFullYear();
const YEAR_MIN = 1985;

/**
 * Compact ordered selector: Make > Model > Generation > Year > Engine > (Transmission).
 * Each subsequent field is disabled until the previous is set. Values come from
 * real sources (Delphi catalog manifest for makes; user history persisted in
 * localStorage for the free-text fields). No example vehicles are hardcoded.
 */
export function WowVehicleSelector() {
  const { vehicle, history, setField, resetVehicle } = useWowVehicle();
  const [brands, setBrands] = useState<BrandManifestEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    listBrands().then((b) => { if (!cancelled) setBrands(b); }).catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = CURRENT_YEAR + 1; y >= YEAR_MIN; y--) arr.push(y);
    return arr;
  }, []);

  const disabled = (level: keyof WowActiveVehicle): boolean => {
    switch (level) {
      case "make": return false;
      case "model": return !vehicle.make;
      case "generation": return !vehicle.model;
      case "year": return !vehicle.model;
      case "engineCode":
      case "engineName": return !vehicle.year;
      case "transmission":
      case "drivetrain": return !(vehicle.engineCode || vehicle.engineName);
    }
    return false;
  };

  const modelSuggestions = history.models[vehicle.make || ""] || [];
  const genSuggestions = history.generations[`${vehicle.make || ""}|${vehicle.model || ""}`] || [];
  const engineSuggestions = history.engines[`${vehicle.make || ""}|${vehicle.model || ""}`] || [];

  return (
    <div className="rounded-lg border border-slate-300 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
          <Car className="h-4 w-4" /> Aktivní vozidlo
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={resetVehicle}>
          <RotateCcw className="h-3 w-3" /> Vymazat
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {/* Make */}
        <div className="col-span-2 sm:col-span-1">
          <Label className="text-[10px] uppercase text-slate-500">Značka</Label>
          <Select
            value={vehicle.make ?? ""}
            onValueChange={(v) => setField("make", v || null)}
            disabled={disabled("make")}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Vyberte značku" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {brands.map((b) => (
                <SelectItem key={b.key} value={b.display_name} className="text-xs">
                  {b.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Model (free text with datalist) */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Model</Label>
          <Input
            list="wow-model-suggestions"
            className="h-8 text-xs"
            placeholder="např. Pacifica"
            disabled={disabled("model")}
            value={vehicle.model ?? ""}
            onChange={(e) => setField("model", e.target.value.trim() || null)}
          />
          <datalist id="wow-model-suggestions">
            {modelSuggestions.map((m) => <option key={m} value={m} />)}
          </datalist>
        </div>

        {/* Generation */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Generace</Label>
          <Input
            list="wow-gen-suggestions"
            className="h-8 text-xs"
            placeholder="např. RU / 2. gen."
            disabled={disabled("generation")}
            value={vehicle.generation ?? ""}
            onChange={(e) => setField("generation", e.target.value.trim() || null)}
          />
          <datalist id="wow-gen-suggestions">
            {genSuggestions.map((g) => <option key={g} value={g} />)}
          </datalist>
        </div>

        {/* Year */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Rok</Label>
          <Select
            value={vehicle.year ? String(vehicle.year) : ""}
            onValueChange={(v) => setField("year", v ? Number(v) : null)}
            disabled={disabled("year")}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Rok" /></SelectTrigger>
            <SelectContent className="max-h-72">
              {years.map((y) => (
                <SelectItem key={y} value={String(y)} className="text-xs">{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Engine code */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Kód motoru</Label>
          <Input
            list="wow-engine-suggestions"
            className="h-8 text-xs"
            placeholder="např. EGH"
            disabled={disabled("engineCode")}
            value={vehicle.engineCode ?? ""}
            onChange={(e) => setField("engineCode", e.target.value.trim().toUpperCase() || null)}
          />
          <datalist id="wow-engine-suggestions">
            {engineSuggestions.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>

        {/* Engine name */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Motor (název)</Label>
          <Input
            className="h-8 text-xs"
            placeholder="např. 3.6L V6 Pentastar"
            disabled={disabled("engineName")}
            value={vehicle.engineName ?? ""}
            onChange={(e) => setField("engineName", e.target.value || null)}
          />
        </div>

        {/* Transmission (optional) */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Převodovka (volitelné)</Label>
          <Input
            list="wow-trans-suggestions"
            className="h-8 text-xs"
            placeholder="např. 62TE"
            disabled={disabled("transmission")}
            value={vehicle.transmission ?? ""}
            onChange={(e) => setField("transmission", e.target.value.trim() || null)}
          />
          <datalist id="wow-trans-suggestions">
            {history.transmissions.map((t) => <option key={t} value={t} />)}
          </datalist>
        </div>

        {/* Drivetrain (optional) */}
        <div>
          <Label className="text-[10px] uppercase text-slate-500">Pohon (volitelné)</Label>
          <Input
            list="wow-drive-suggestions"
            className="h-8 text-xs"
            placeholder="FWD/AWD/RWD"
            disabled={disabled("drivetrain")}
            value={vehicle.drivetrain ?? ""}
            onChange={(e) => setField("drivetrain", e.target.value.trim() || null)}
          />
          <datalist id="wow-drive-suggestions">
            {history.drivetrains.map((d) => <option key={d} value={d} />)}
          </datalist>
        </div>
      </div>
    </div>
  );
}
