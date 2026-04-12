import { useState, useEffect, useCallback } from 'react';
import { dataLogger, type LogSession, type ReplayState } from '@/lib/data-logger';

export function useDataLogger() {
  const [sessions, setSessions] = useState<LogSession[]>(dataLogger.getSessions());
  const [active, setActive] = useState<LogSession | null>(dataLogger.getActiveSession());
  const [replay, setReplay] = useState<ReplayState>(dataLogger.getReplayState());

  useEffect(() => {
    const u1 = dataLogger.onSessions(setSessions);
    const u2 = dataLogger.onActive(setActive);
    const u3 = dataLogger.onReplay(setReplay);
    return () => { u1(); u2(); u3(); };
  }, []);

  const startSession = useCallback((name?: string) => dataLogger.startSession(name), []);
  const endSession = useCallback(() => dataLogger.endSession(), []);
  const deleteSession = useCallback((id: string) => dataLogger.deleteSession(id), []);
  const renameSession = useCallback((id: string, name: string) => dataLogger.renameSession(id, name), []);

  const exportCSV = useCallback((id: string) => {
    const csv = dataLogger.exportCSV(id);
    dataLogger.downloadFile(csv, `session_${id}.csv`, 'text/csv');
  }, []);

  const exportJSON = useCallback((id: string) => {
    const json = dataLogger.exportJSON(id);
    dataLogger.downloadFile(json, `session_${id}.json`, 'application/json');
  }, []);

  const startReplay = useCallback((id: string, speed?: number) => dataLogger.startReplay(id, speed), []);
  const stopReplay = useCallback(() => dataLogger.stopReplay(), []);
  const seekReplay = useCallback((i: number) => dataLogger.seekReplay(i), []);
  const setReplaySpeed = useCallback((s: number) => dataLogger.setReplaySpeed(s), []);

  const record = useCallback(dataLogger.record.bind(dataLogger), []);

  return {
    sessions, active, replay,
    startSession, endSession, deleteSession, renameSession,
    exportCSV, exportJSON,
    startReplay, stopReplay, seekReplay, setReplaySpeed,
    record,
  };
}
