// Auto DID Discovery Engine
// Iterates full DID ranges, classifies responses, builds decoder map

import { udsEngine, type DIDResult, type UDSError } from './uds-engine';
import { CHRYSLER_DIDS, getDIDDef } from './chrysler-dids';

// ─── Types ───

export type DIDClassification = 'static' | 'live' | 'flags' | 'unknown';

export type DiscoveredDID = {
  did: number;
  didHex: string;
  name: string;
  classification: DIDClassification;
  knownInDB: boolean;
  dataType: string;
  byteLength: number;
  sampleValue: string;
  sampleRaw: string;
  rawBytes: number[];
  category: string;
  stability: number; // 0-1, how consistent across reads
  reads: number;
  lastValue: string;
  firstSeen: number;
  lastSeen: number;
  decoderHint: DecoderHint;
};

export type DecoderHint = {
  probableType: 'ascii' | 'uint16' | 'uint32' | 'scaled_temp' | 'scaled_voltage' | 'scaled_percent' | 'bitfield' | 'counter' | 'raw';
  confidence: number; // 0-1
  reasoning: string;
};

export type DiscoveryProgress = {
  phase: 'idle' | 'session' | 'scanning' | 'revalidating' | 'classifying' | 'complete' | 'aborted';
  currentRange: string;
  currentDID: number;
  scannedCount: number;
  totalCount: number;
  foundCount: number;
  errorCount: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
};

export type DiscoveryStats = {
  totalScanned: number;
  totalFound: number;
  totalErrors: number;
  knownDIDs: number;
  unknownDIDs: number;
  staticDIDs: number;
  liveDIDs: number;
  flagDIDs: number;
  durationMs: number;
  ranges: { label: string; found: number; total: number }[];
};

// ─── Discovery Ranges ───
const DISCOVERY_RANGES: { label: string; start: number; end: number }[] = [
  { label: 'Identification (F100–F1FF)', start: 0xF100, end: 0xF1FF },
  { label: 'Reserved (F200–F3FF)', start: 0xF200, end: 0xF3FF },
  { label: 'Calibration (F400–F4FF)', start: 0xF400, end: 0xF4FF },
  { label: 'Extended (2100–21FF)', start: 0x2100, end: 0x21FF },
];

// ─── Auto Decoder Heuristics ───
function inferDecoderHint(bytes: number[]): DecoderHint {
  if (bytes.length === 0) {
    return { probableType: 'raw', confidence: 0, reasoning: 'Empty payload' };
  }

  // Check if all bytes are printable ASCII
  const allASCII = bytes.every(b => b >= 0x20 && b <= 0x7E);
  if (allASCII && bytes.length >= 4) {
    return { probableType: 'ascii', confidence: 0.9, reasoning: 'All bytes are printable ASCII characters' };
  }

  // Single byte — likely flags/bitfield or uint8
  if (bytes.length === 1) {
    const v = bytes[0];
    if (v <= 1) return { probableType: 'bitfield', confidence: 0.7, reasoning: 'Single byte 0/1 — boolean flag' };
    if (v <= 0x0F) return { probableType: 'bitfield', confidence: 0.5, reasoning: 'Single byte small value — possible flags' };
    return { probableType: 'scaled_percent', confidence: 0.4, reasoning: 'Single byte — could be scaled percentage' };
  }

  // Two bytes
  if (bytes.length === 2) {
    const val = (bytes[0] << 8) | bytes[1];
    // Temperature-like range (with -40 offset: 0-255°C → raw 0-2950 at 0.1 scale)
    if (val >= 0 && val <= 2550) {
      return { probableType: 'scaled_temp', confidence: 0.5, reasoning: `16-bit value ${val} — possible scaled temperature` };
    }
    // Voltage-like range (0-20V at 0.001 scale → raw 0-20000)
    if (val >= 10000 && val <= 16000) {
      return { probableType: 'scaled_voltage', confidence: 0.6, reasoning: `16-bit value ${val} — probable voltage (${(val / 1000).toFixed(1)}V)` };
    }
    return { probableType: 'uint16', confidence: 0.5, reasoning: `16-bit unsigned integer (${val})` };
  }

  // Four bytes
  if (bytes.length === 4) {
    const val = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
    if (val > 100000) {
      return { probableType: 'counter', confidence: 0.5, reasoning: `32-bit large value ${val} — possible counter/odometer` };
    }
    return { probableType: 'uint32', confidence: 0.5, reasoning: `32-bit unsigned integer (${val})` };
  }

  // Large payload — check for mixed content
  if (bytes.length >= 8) {
    const hasManyZeros = bytes.filter(b => b === 0).length > bytes.length * 0.5;
    if (hasManyZeros) {
      return { probableType: 'bitfield', confidence: 0.5, reasoning: `${bytes.length}-byte block with many zeros — sparse bitfield/status block` };
    }
    return { probableType: 'raw', confidence: 0.3, reasoning: `${bytes.length}-byte data block — needs manual analysis` };
  }

  return { probableType: 'raw', confidence: 0.2, reasoning: `${bytes.length} bytes — unknown structure` };
}

function classifyDID(did: number, bytes: number[], knownInDB: boolean): DIDClassification {
  const def = getDIDDef(did);

  // Known sensor DIDs → live
  if (def.category === 'sensor') return 'live';

  // Extended data blocks → live (usually real-time)
  if (did >= 0x2100 && did <= 0x21FF) return 'live';

  // Identification/software/hardware → static
  if (['identification', 'software', 'hardware'].includes(def.category)) return 'static';

  // Single-byte responses with small values → flags
  if (bytes.length === 1 && bytes[0] <= 0x0F) return 'flags';

  // Multi-byte with lots of bit-level data → flags
  if (bytes.length <= 4) {
    const nonZeroBits = bytes.reduce((acc, b) => {
      let count = 0;
      for (let i = 0; i < 8; i++) if ((b >> i) & 1) count++;
      return acc + count;
    }, 0);
    const totalBits = bytes.length * 8;
    if (nonZeroBits < totalBits * 0.3) return 'flags';
  }

  // Sensor-range F4xx → live
  if (did >= 0xF400 && did <= 0xF4FF) return 'live';

  // Unknown
  if (!knownInDB) return 'unknown';

  return 'static';
}

// ─── Discovery Engine ───
type ProgressListener = (progress: DiscoveryProgress) => void;
type ResultListener = (did: DiscoveredDID) => void;
type CompleteListener = (stats: DiscoveryStats, results: DiscoveredDID[]) => void;

class DIDDiscoveryEngine {
  private progressListeners: ProgressListener[] = [];
  private resultListeners: ResultListener[] = [];
  private completeListeners: CompleteListener[] = [];
  private aborted = false;
  private running = false;
  private discoveredDIDs: Map<number, DiscoveredDID> = new Map();

  onProgress(l: ProgressListener): () => void {
    this.progressListeners.push(l);
    return () => { this.progressListeners = this.progressListeners.filter(x => x !== l); };
  }
  onDiscovered(l: ResultListener): () => void {
    this.resultListeners.push(l);
    return () => { this.resultListeners = this.resultListeners.filter(x => x !== l); };
  }
  onComplete(l: CompleteListener): () => void {
    this.completeListeners.push(l);
    return () => { this.completeListeners = this.completeListeners.filter(x => x !== l); };
  }

  isRunning() { return this.running; }
  getResults(): DiscoveredDID[] { return Array.from(this.discoveredDIDs.values()); }
  getResult(did: number) { return this.discoveredDIDs.get(did); }

  abort() { this.aborted = true; }

  clearResults() { this.discoveredDIDs.clear(); }

  async runFullDiscovery(): Promise<DiscoveredDID[]> {
    if (this.running) return [];
    this.running = true;
    this.aborted = false;

    const startTime = Date.now();
    const totalDIDs = DISCOVERY_RANGES.reduce((sum, r) => sum + (r.end - r.start + 1), 0);
    let scannedCount = 0;
    let foundCount = 0;
    let errorCount = 0;
    const rangeStats: { label: string; found: number; total: number }[] = [];

    // Phase 1: Set extended session
    this.emitProgress({
      phase: 'session', currentRange: 'Session Control', currentDID: 0,
      scannedCount: 0, totalCount: totalDIDs, foundCount: 0, errorCount: 0,
      elapsedMs: 0, estimatedRemainingMs: 0,
    });
    await udsEngine.setSession(0x03);
    udsEngine.startTesterPresent(2000);

    // Phase 2: Scan all ranges
    for (const range of DISCOVERY_RANGES) {
      if (this.aborted) break;
      let rangeFound = 0;
      const rangeTotal = range.end - range.start + 1;

      for (let did = range.start; did <= range.end; did++) {
        if (this.aborted) break;
        scannedCount++;

        const elapsed = Date.now() - startTime;
        const rate = scannedCount / (elapsed || 1);
        const remaining = (totalDIDs - scannedCount) / rate;

        this.emitProgress({
          phase: 'scanning', currentRange: range.label, currentDID: did,
          scannedCount, totalCount: totalDIDs, foundCount, errorCount,
          elapsedMs: elapsed, estimatedRemainingMs: remaining,
        });

        const result = await udsEngine.readDID(did);

        if ('parsed' in result) {
          foundCount++;
          rangeFound++;
          const didResult = result as DIDResult;
          const knownInDB = !!CHRYSLER_DIDS[did];
          const classification = classifyDID(did, didResult.rawBytes, knownInDB);
          const decoderHint = knownInDB
            ? { probableType: didResult.definition.dataType as any, confidence: 1, reasoning: 'Known in Chrysler DID database' }
            : inferDecoderHint(didResult.rawBytes);

          const discovered: DiscoveredDID = {
            did,
            didHex: didResult.didHex,
            name: didResult.definition.name,
            classification,
            knownInDB,
            dataType: didResult.definition.dataType,
            byteLength: didResult.rawBytes.length,
            sampleValue: didResult.parsed.stringValue,
            sampleRaw: didResult.rawHex,
            rawBytes: [...didResult.rawBytes],
            category: didResult.definition.category,
            stability: 1,
            reads: 1,
            lastValue: didResult.parsed.stringValue,
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            decoderHint,
          };

          // Update existing or add new
          const existing = this.discoveredDIDs.get(did);
          if (existing) {
            discovered.reads = existing.reads + 1;
            discovered.firstSeen = existing.firstSeen;
            discovered.stability = existing.lastValue === discovered.sampleValue ? 1 : 0.5;
          }
          this.discoveredDIDs.set(did, discovered);
          this.resultListeners.forEach(l => l(discovered));
        } else {
          errorCount++;
        }

        await new Promise(r => setTimeout(r, 20));
      }

      rangeStats.push({ label: range.label, found: rangeFound, total: rangeTotal });
    }

    udsEngine.stopTesterPresent();

    // Phase 3: Classification summary
    const allResults = this.getResults();
    const stats: DiscoveryStats = {
      totalScanned: scannedCount,
      totalFound: foundCount,
      totalErrors: errorCount,
      knownDIDs: allResults.filter(d => d.knownInDB).length,
      unknownDIDs: allResults.filter(d => !d.knownInDB).length,
      staticDIDs: allResults.filter(d => d.classification === 'static').length,
      liveDIDs: allResults.filter(d => d.classification === 'live').length,
      flagDIDs: allResults.filter(d => d.classification === 'flags').length,
      durationMs: Date.now() - startTime,
      ranges: rangeStats,
    };

    this.emitProgress({
      phase: this.aborted ? 'aborted' : 'complete',
      currentRange: '', currentDID: 0,
      scannedCount, totalCount: totalDIDs, foundCount, errorCount,
      elapsedMs: stats.durationMs, estimatedRemainingMs: 0,
    });

    this.completeListeners.forEach(l => l(stats, allResults));
    this.running = false;
    return allResults;
  }

  // Generate decoder map JSON from discovered DIDs
  generateDecoderMap(): Record<string, {
    name: string;
    type: string;
    classification: string;
    bytes: number;
    confidence: number;
    hint: string;
    known: boolean;
    sample: string;
  }> {
    const map: Record<string, any> = {};
    for (const [, d] of this.discoveredDIDs) {
      map[d.didHex] = {
        name: d.name,
        type: d.decoderHint.probableType,
        classification: d.classification,
        bytes: d.byteLength,
        confidence: d.decoderHint.confidence,
        hint: d.decoderHint.reasoning,
        known: d.knownInDB,
        sample: d.sampleValue,
      };
    }
    return map;
  }

  // Export full results as JSON string
  exportJSON(): string {
    return JSON.stringify({
      generatedAt: new Date().toISOString(),
      vehicle: 'Chrysler Town & Country / Pacifica',
      adapter: 'Vgate iCar Pro 4.0',
      decoderMap: this.generateDecoderMap(),
      rawResults: this.getResults(),
    }, null, 2);
  }

  private emitProgress(p: DiscoveryProgress) {
    this.progressListeners.forEach(l => l(p));
  }
}

export const discoveryEngine = new DIDDiscoveryEngine();
