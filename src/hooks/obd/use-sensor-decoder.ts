import { useState, useEffect, useCallback } from 'react';
import { sensorDecoder, type DecodedSensor, type CorrelationPair } from '@/lib/sensor-decoder';

export function useSensorDecoder() {
  const [sensors, setSensors] = useState<DecodedSensor[]>([]);
  const [correlations, setCorrelations] = useState<CorrelationPair[]>([]);
  const [running, setRunning] = useState(false);
  const [pollCount, setPollCount] = useState(0);
  const [lastPollMs, setLastPollMs] = useState(0);

  useEffect(() => {
    const unsub = sensorDecoder.onUpdate((state) => {
      setSensors(Array.from(state.sensors.values()));
      setCorrelations(state.correlations);
      setRunning(state.running);
      setPollCount(state.pollCount);
      setLastPollMs(state.lastPollMs);
    });
    return unsub;
  }, []);

  const start = useCallback((dids?: number[]) => sensorDecoder.start(dids), []);
  const stop = useCallback(() => sensorDecoder.stop(), []);
  const clear = useCallback(() => sensorDecoder.clear(), []);

  const liveSensors = sensors.filter(s => s.isLive);
  const staticSensors = sensors.filter(s => !s.isLive);

  return { sensors, liveSensors, staticSensors, correlations, running, pollCount, lastPollMs, start, stop, clear };
}
