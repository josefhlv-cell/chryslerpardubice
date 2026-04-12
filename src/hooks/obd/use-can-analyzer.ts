import { useState, useEffect, useCallback, useMemo } from 'react';
import { canAnalyzer, type TrackedFrame, type CaptureStats, type CANFilter } from '@/lib/obd/can-analyzer';

export function useCANAnalyzer() {
  const [frames, setFrames] = useState<TrackedFrame[]>([]);
  const [stats, setStats] = useState<CaptureStats>({ totalFrames: 0, uniqueIDs: 0, framesPerSec: 0, captureMs: 0, running: false });
  const [filter, setFilter] = useState<CANFilter>({ idFilter: '', byteIndex: null, byteValue: null, didFilter: '' });

  useEffect(() => {
    const unsub1 = canAnalyzer.onFrames(setFrames);
    const unsub2 = canAnalyzer.onStats(setStats);
    return () => { unsub1(); unsub2(); };
  }, []);

  const filtered = useMemo(() => {
    if (!filter.idFilter && filter.byteIndex === null) return frames;
    return canAnalyzer.applyFilter(frames, filter);
  }, [frames, filter]);

  const start = useCallback(() => canAnalyzer.startCapture(), []);
  const stop = useCallback(() => canAnalyzer.stopCapture(), []);
  const clear = useCallback(() => { canAnalyzer.clearCapture(); setFrames([]); }, []);

  return { frames: filtered, allFrames: frames, stats, filter, setFilter, start, stop, clear };
}
