import { useState, useEffect, useCallback } from 'react';
import { discoveryEngine, type DiscoveredDID, type DiscoveryProgress, type DiscoveryStats } from '@/lib/did-discovery';

export function useDiscovery() {
  const [progress, setProgress] = useState<DiscoveryProgress | null>(null);
  const [results, setResults] = useState<DiscoveredDID[]>([]);
  const [stats, setStats] = useState<DiscoveryStats | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const unsub1 = discoveryEngine.onProgress((p) => {
      setProgress(p);
      setRunning(p.phase === 'scanning' || p.phase === 'session' || p.phase === 'revalidating' || p.phase === 'classifying');
    });
    const unsub2 = discoveryEngine.onDiscovered(() => {
      setResults([...discoveryEngine.getResults()]);
    });
    const unsub3 = discoveryEngine.onComplete((s) => {
      setStats(s);
      setResults([...discoveryEngine.getResults()]);
      setRunning(false);
    });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, []);

  const startDiscovery = useCallback(async () => {
    setRunning(true);
    setStats(null);
    await discoveryEngine.runFullDiscovery();
  }, []);

  const abort = useCallback(() => {
    discoveryEngine.abort();
  }, []);

  const clear = useCallback(() => {
    discoveryEngine.clearResults();
    setResults([]);
    setStats(null);
    setProgress(null);
  }, []);

  const exportJSON = useCallback(() => {
    return discoveryEngine.exportJSON();
  }, []);

  const getDecoderMap = useCallback(() => {
    return discoveryEngine.generateDecoderMap();
  }, []);

  return { progress, results, stats, running, startDiscovery, abort, clear, exportJSON, getDecoderMap };
}
