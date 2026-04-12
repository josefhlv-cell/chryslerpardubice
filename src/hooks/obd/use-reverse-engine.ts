import { useState, useEffect, useCallback } from 'react';
import { reverseEngine, type REState, type BeforeAfterResult } from '@/lib/reverse-engine';

export function useReverseEngine() {
  const [state, setState] = useState<REState>(reverseEngine.getState());

  useEffect(() => {
    return reverseEngine.onUpdate(setState);
  }, []);

  const startMonitoring = useCallback((dids: number[]) => reverseEngine.startMonitoring(dids), []);
  const stopMonitoring = useCallback(() => reverseEngine.stopMonitoring(), []);
  const markBefore = useCallback((dids: number[]) => reverseEngine.markBefore(dids), []);
  const markAfter = useCallback(() => reverseEngine.markAfter(), []);
  const clearBeforeAfter = useCallback(() => reverseEngine.clearBeforeAfter(), []);
  const clearAll = useCallback(() => reverseEngine.clearAll(), []);
  const exportDecoder = useCallback(() => reverseEngine.exportDecoderMap(), []);
  const getSessionStats = useCallback(() => reverseEngine.getSessionStats(), []);

  return {
    ...state,
    startMonitoring,
    stopMonitoring,
    markBefore,
    markAfter,
    clearBeforeAfter,
    clearAll,
    exportDecoder,
    getSessionStats,
  };
}
