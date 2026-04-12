import { useState, useEffect, useCallback } from 'react';
import { orchestrator, type OrchestratorState, type PollProfile, type PipelinePhase } from '@/lib/orchestrator';

export function useOrchestrator() {
  const [state, setState] = useState<OrchestratorState>(orchestrator.getState());

  useEffect(() => {
    return orchestrator.subscribe(setState);
  }, []);

  const startPipeline = useCallback((deviceId: string) => orchestrator.startPipeline(deviceId), []);
  const stopPipeline = useCallback(() => orchestrator.stopPipeline(), []);
  const startMonitoring = useCallback(() => orchestrator.startMonitoring(), []);
  const runDiscovery = useCallback(() => orchestrator.runDiscovery(), []);
  const setPollProfile = useCallback((p: PollProfile) => orchestrator.setPollProfile(p), []);
  const acknowledgeAnomaly = useCallback((id: string) => orchestrator.acknowledgeAnomaly(id), []);
  const clearAnomalies = useCallback(() => orchestrator.clearAnomalies(), []);
  const shareSession = useCallback(() => orchestrator.shareSession(), []);
  const exportSession = useCallback((f: 'csv' | 'json') => orchestrator.exportSession(f), []);

  return {
    ...state,
    startPipeline,
    stopPipeline,
    startMonitoring,
    runDiscovery,
    setPollProfile,
    acknowledgeAnomaly,
    clearAnomalies,
    shareSession,
    exportSession,
  };
}
