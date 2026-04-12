import { useState, useEffect, useCallback } from 'react';
import { codingSystem, type CodingState, type WriteMode, type WriteResult } from '@/lib/obd/coding-system';

export function useCoding() {
  const [state, setState] = useState<CodingState>(codingSystem.getState());

  useEffect(() => {
    return codingSystem.onUpdate(setState);
  }, []);

  const readAll = useCallback(() => codingSystem.readAllValues(), []);
  const setMode = useCallback((m: WriteMode) => codingSystem.setWriteMode(m), []);
  const setPending = useCallback((did: number, v: number) => codingSystem.setPendingValue(did, v), []);
  const clearPending = useCallback((did: number) => codingSystem.clearPending(did), []);
  const executeWrite = useCallback((did: number, v: number) => codingSystem.executeSafeWrite(did, v), []);
  const rollback = useCallback((id: string) => codingSystem.rollback(id), []);

  return { ...state, readAll, setMode, setPending, clearPending, executeWrite, rollback };
}
