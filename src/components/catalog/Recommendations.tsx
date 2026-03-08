/**
 * Recommendations Component
 * Shows similar/recommended parts based on the same category or family.
 */

import { useEffect, useState } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import type { PartResult } from "@/api/partsAPI";
import { getRecommendations, sourceLabel } from "@/api/partsAPI";
import { Badge } from "@/components/ui/badge";

interface RecommendationsProps {
  part: PartResult;
  onSelect: (part: PartResult) => void;
}

const Recommendations = ({ part, onSelect }: RecommendationsProps) => {
  const [items, setItems] = useState<PartResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getRecommendations(part).then((data) => {
      if (!cancelled) {
        setItems(data);
        setLoading(false);
      }
    }).catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [part.id, part.category, part.family]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3">
        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Načítám doporučení...</span>
      </div>
    );
  }

  if (items.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Podobné díly</p>
      <div className="space-y-1.5">
        {items.slice(0, 4).map((rec) => (
          <button key={rec.id} onClick={() => onSelect(rec)}
            className="w-full flex items-center gap-3 p-2 rounded-lg bg-muted/50 hover:bg-muted transition-all text-left">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{rec.name}</p>
              <p className="text-[10px] text-muted-foreground font-mono">{rec.oem_number}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-semibold">{rec.price_with_vat > 0 ? `${rec.price_with_vat.toLocaleString("cs")} Kč` : "–"}</p>
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
};

export default Recommendations;
