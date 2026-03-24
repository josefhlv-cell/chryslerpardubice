/**
 * SearchBar Component
 * Main search input with mode tabs (part number, vehicle OEM, vehicle alternatives, VIN, EPC).
 * OEM vs Alternatives modes are visually distinct with clear descriptions.
 */

import { Search, Loader2, Hash, Car, Tag, Layers, ShieldCheck, RefreshCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type SearchMode = "part_number" | "vehicle_oem" | "vehicle_alt" | "vin" | "epc";

interface SearchBarProps {
  query: string;
  onQueryChange: (val: string) => void;
  onSearch: () => void;
  searching: boolean;
  searchMode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  placeholder?: string;
  hiddenModes?: SearchMode[];
}

const modeConfig: { mode: SearchMode; label: string; shortLabel: string; Icon: any; description: string; colorClass: string }[] = [
  { mode: "part_number", label: "Číslo dílu", shortLabel: "OEM #", Icon: Hash, description: "Hledat podle OEM čísla", colorClass: "" },
  { mode: "vehicle_oem", label: "Originální díly", shortLabel: "Originál", Icon: ShieldCheck, description: "Originální díly Mopar", colorClass: "data-[active=true]:bg-blue-600 data-[active=true]:text-white" },
  { mode: "vehicle_alt", label: "Náhrady za OEM", shortLabel: "Náhrady", Icon: RefreshCw, description: "Alternativy od SAG a AutoKelly", colorClass: "data-[active=true]:bg-amber-600 data-[active=true]:text-white" },
  { mode: "vin", label: "VIN", shortLabel: "VIN", Icon: Tag, description: "Hledat podle VIN kódu", colorClass: "" },
  { mode: "epc", label: "EPC", shortLabel: "EPC", Icon: Layers, description: "Prohlížeč dílů podle diagramu", colorClass: "" },
];

const SearchBar = ({
  query,
  onQueryChange,
  onSearch,
  searching,
  searchMode,
  onModeChange,
  placeholder,
  hiddenModes = [],
}: SearchBarProps) => {
  const defaultPlaceholder =
    searchMode === "part_number"
      ? "Zadejte OEM číslo dílu (např. 68218951AA)..."
      : searchMode === "vin"
      ? "Hledat díl po dekódování VIN..."
      : searchMode === "vehicle_oem"
      ? "Hledat originální díl podle názvu nebo kategorie..."
      : searchMode === "vehicle_alt"
      ? "Hledat náhrady za OEM díly..."
      : "Název nebo číslo dílu...";

  const isVehicleMode = searchMode === "vehicle_oem" || searchMode === "vehicle_alt";

  // In vehicle_alt mode, hide the search input — drill-down only
  const hideSearchInput = searchMode === "vehicle_alt";

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-secondary">
        {modeConfig.filter(({ mode }) => !hiddenModes.includes(mode)).map(({ mode, label, shortLabel, Icon, colorClass }) => {
          const isActive = searchMode === mode;
          return (
            <button
              key={mode}
              data-active={isActive}
              onClick={() => onModeChange(mode)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-all ${
                isActive
                  ? colorClass || "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              <span className="sm:hidden">{shortLabel}</span>
            </button>
          );
        })}
      </div>


      {/* Search input — hidden in vehicle_alt mode (drill-down only) */}
      {!hideSearchInput && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={placeholder || defaultPlaceholder}
              className="pl-10 h-11 text-sm rounded-lg"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onSearch()}
            />
          </div>
          <Button onClick={onSearch} disabled={searching} className="h-11 px-5">
            {searching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Search className="w-4 h-4" />
            )}
            <span className="hidden md:inline ml-1.5">Hledat</span>
          </Button>
        </div>
      )}
    </div>
  );
};

export default SearchBar;
