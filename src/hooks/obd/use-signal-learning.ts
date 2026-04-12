import { useState, useEffect, useCallback } from 'react';
import { signalEngine, type LearnedSignal, type DashboardWidget } from '@/lib/signal-learning';

export function useSignalLearning() {
  const [signals, setSignals] = useState<LearnedSignal[]>([]);
  const [dashboard, setDashboard] = useState<DashboardWidget[]>([]);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    const unsub1 = signalEngine.onSignals(setSignals);
    const unsub2 = signalEngine.onDashboard(setDashboard);
    return () => { unsub1(); unsub2(); };
  }, []);

  const start = useCallback(async () => {
    setRunning(true);
    await signalEngine.startLearning();
  }, []);

  const stop = useCallback(() => {
    signalEngine.stopLearning();
    setRunning(false);
  }, []);

  const clear = useCallback(() => {
    signalEngine.clearSignals();
    setSignals([]);
    setDashboard([]);
  }, []);

  const addDIDs = useCallback((dids: number[]) => {
    signalEngine.addDiscoveredDIDs(dids);
  }, []);

  return { signals, dashboard, running, start, stop, clear, addDIDs };
}
