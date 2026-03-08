/**
 * Favorites Component
 * Manages favorite parts stored in localStorage.
 */

import { useEffect, useState, useCallback } from "react";
import type { PartResult } from "@/api/partsAPI";

const STORAGE_KEY = "catalog_favorites";

/** Custom hook for managing favorites */
export function useFavorites() {
  const [favorites, setFavorites] = useState<PartResult[]>([]);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setFavorites(JSON.parse(stored));
    } catch {}
  }, []);

  // Persist to localStorage on change
  const save = useCallback((items: PartResult[]) => {
    setFavorites(items);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch {}
  }, []);

  const isFavorite = useCallback((partId: string) => {
    return favorites.some((f) => f.id === partId);
  }, [favorites]);

  const toggleFavorite = useCallback((part: PartResult) => {
    const exists = favorites.some((f) => f.id === part.id);
    if (exists) {
      save(favorites.filter((f) => f.id !== part.id));
    } else {
      save([...favorites, part]);
    }
  }, [favorites, save]);

  const clearFavorites = useCallback(() => save([]), [save]);

  return { favorites, isFavorite, toggleFavorite, clearFavorites };
}

export default useFavorites;
