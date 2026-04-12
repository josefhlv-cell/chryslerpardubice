import { useState, useEffect, useCallback } from 'react';
import { dtcEngine, type DTCState } from '@/lib/dtc-engine';

export function useDTC() {
  const [state, setState] = useState<DTCState>(dtcEngine.getState());

  useEffect(() => {
    return dtcEngine.onUpdate(setState);
  }, []);

  const scan = useCallback(() => dtcEngine.scanDTCs(), []);
  const clear = useCallback(() => dtcEngine.clearDTCs(), []);
  const getCritical = useCallback(() => dtcEngine.getCriticalCodes(), []);
  const getSuggestions = useCallback(() => dtcEngine.getSuggestions(), []);

  return { ...state, scan, clear, getCritical, getSuggestions };
}
