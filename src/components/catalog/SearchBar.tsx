/**
 * SearchBar Component
 * Main search input with mode tabs (part number, vehicle, VIN, EPC).
 */

import { Search, Loader2, Hash, Car, Tag, Layers } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type SearchMode = "part_number" | "vehicle" | "vin" | "epc";

interface SearchBarProps {
  query: string;
  onQueryChange: (val: string) => void;
  onSearch: () => void;
  searching: boolean;
  searchMode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  placeholder?: string;
}

const modeConfig: { mode: SearchMode; label: string; Icon: any }[] = [
  { mode: "part_number", label: "Číslo dílu", Icon: Hash },
  { mode: "vehicle", label: "Vozidlo", Icon: Car },
  { mode: "vin", label: "VIN", Icon: Tag },
  { mode: "epc", label: "EPC", Icon: Layers },
];

const SearchBar = ({
  query,
  onQueryChange,
  onSearch,
  searching,
  searchMode,
  onModeChange,
  placeholder,
}: SearchBarProps) => {
  const defaultPlaceholder =
    searchMode === "part_number"
      ? "Zadejte OEM číslo dílu (např. 68218951AA)..."
      : searchMode === "vin"
      ? "Hledat díl po dekódování VIN..."
      : "Název nebo číslo dílu...";

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex gap-1 p-0.5 rounded-lg bg-secondary">
        {modeConfig.map(({ mode, label, Icon }) => (
          <button
            key={mode}
            onClick={() => onModeChange(mode)}
            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2 rounded-md text-xs font-medium transition-all ${
              searchMode === mode
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      {/* Search input */}
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
    </div>
  );
};

export default SearchBar;
