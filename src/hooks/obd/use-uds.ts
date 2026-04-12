import { useState, useEffect, useCallback } from 'react';
import { udsEngine, type DIDResult, type ScanProgress, type UDSError } from '@/lib/obd/uds-engine';

export function useUDS() {
  const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
  const [results, setResults] = useState<DIDResult[]>([]);
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    const unsub1 = udsEngine.onScanProgress(setScanProgress);
    const unsub2 = udsEngine.onResult((result) => {
      setResults(prev => {
        const idx = prev.findIndex(r => r.did === result.did);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = result;
          return next;
        }
        return [...prev, result];
      });
    });
    return () => { unsub1(); unsub2(); };
  }, []);

  const readDID = useCallback(async (did: number) => {
    return udsEngine.readDID(did);
  }, []);

  const scanRange = useCallback(async (start: number, end: number) => {
    setScanning(true);
    const found = await udsEngine.scanRange(start, end);
    setScanning(false);
    return found;
  }, []);

  const abortScan = useCallback(() => {
    udsEngine.abortScan();
    setScanning(false);
  }, []);

  const setSession = useCallback(async (session: number) => {
    return udsEngine.setSession(session);
  }, []);

  const clearResults = useCallback(() => {
    udsEngine.clearResults();
    setResults([]);
  }, []);

  return { scanProgress, results, scanning, readDID, scanRange, abortScan, setSession, clearResults };
}

export function isDIDResult(r: DIDResult | UDSError): r is DIDResult {
  return 'parsed' in r;
}
