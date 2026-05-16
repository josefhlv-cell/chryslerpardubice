/**
 * History Component
 * Stores search history in localStorage and provides hook + display.
 */

import { useEffect, useState, useCallback } from "react";
import { Clock, X, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "catalog_search_history";
const MAX_ITEMS = 20;

export interface HistoryEntry {
  query: string;
  timestamp: number;
}

/** Custom hook for managing search history */
export function useSearchHistory() {
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setHistory(JSON.parse(stored));
    } catch {}
  }, []);

  const save = useCallback((items: HistoryEntry[]) => {
    setHistory(items);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, []);

  const addEntry = useCallback((query: string) => {
    if (!query.trim()) return;
    const newHistory = [
      { query: query.trim(), timestamp: Date.now() },
      ...history.filter((h) => h.query.toLowerCase() !== query.trim().toLowerCase()),
    ].slice(0, MAX_ITEMS);
    save(newHistory);
  }, [history, save]);

  const removeEntry = useCallback((query: string) => {
    save(history.filter((h) => h.query !== query));
  }, [history, save]);

  const clearHistory = useCallback(() => save([]), [save]);

  return { history, addEntry, removeEntry, clearHistory };
}

/** Display component for search history */
interface HistoryListProps {
  history: HistoryEntry[];
  onSelect: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}

const HistoryList = ({ history, onSelect, onRemove, onClear }: HistoryListProps) => {
  if (history.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1">
          <Clock className="w-3 h-3" />Historie
        </p>
        <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]" onClick={onClear}>
          <Trash2 className="w-3 h-3 mr-0.5" />Smazat
        </Button>
      </div>
      <div className="space-y-0.5">
        {history.slice(0, 8).map((entry) => (
          <div key={entry.query + entry.timestamp} className="flex items-center gap-1 group">
            <button onClick={() => onSelect(entry.query)}
              className="flex-1 text-left px-2 py-1.5 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all truncate">
              {entry.query}
            </button>
            <button onClick={() => onRemove(entry.query)}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-muted rounded transition-all">
              <X className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryList;
