// UDS (Unified Diagnostic Services) Module — ISO 14229
// Read-only diagnostic services: Session Control (0x10), ReadDataByID (0x22), TesterPresent (0x3E)

import { elm327 } from '@/lib/obd/elm327-engine';
import { isotpTransport } from '@/lib/obd/isotp-transport';
import { getDIDDef, SIMULATED_DID_RESPONSES, type DIDDefinition, type DIDScaling, type BitfieldDef } from '@/lib/obd/chrysler-dids';

// ─── UDS Service IDs ───
export const UDS_SERVICES = {
  DIAGNOSTIC_SESSION_CONTROL: 0x10,
  READ_DATA_BY_ID: 0x22,
  TESTER_PRESENT: 0x3E,
} as const;

export const UDS_SESSION = {
  DEFAULT: 0x01,
  PROGRAMMING: 0x02,
  EXTENDED: 0x03,
} as const;

// ─── NRC (Negative Response Codes) ───
const NRC_NAMES: Record<number, string> = {
  0x10: 'General Reject',
  0x11: 'Service Not Supported',
  0x12: 'Sub-function Not Supported',
  0x13: 'Incorrect Message Length',
  0x14: 'Response Too Long',
  0x22: 'Conditions Not Correct',
  0x24: 'Request Sequence Error',
  0x25: 'No Response From Subnet',
  0x26: 'Failure Prevents Execution',
  0x31: 'Request Out Of Range',
  0x33: 'Security Access Denied',
  0x35: 'Invalid Key',
  0x36: 'Exceeded Number Of Attempts',
  0x37: 'Required Time Delay Not Expired',
  0x70: 'Upload/Download Not Accepted',
  0x71: 'Transfer Data Suspended',
  0x72: 'General Programming Failure',
  0x73: 'Wrong Block Sequence Counter',
  0x78: 'Request Correctly Received - Response Pending',
  0x7E: 'Sub-function Not Supported In Active Session',
  0x7F: 'Service Not Supported In Active Session',
};

// ─── Parsed DID Result ───
export type DIDResult = {
  did: number;
  didHex: string;
  definition: DIDDefinition;
  rawBytes: number[];
  rawHex: string;
  parsed: ParsedValue;
  timestamp: number;
};

export type ParsedValue = {
  type: 'ascii' | 'number' | 'scaled' | 'bitfield' | 'hex' | 'bcd';
  stringValue: string;
  numericValue?: number;
  unit?: string;
  bitfields?: { name: string; value: number; label: string }[];
};

export type ScanProgress = {
  current: number;
  total: number;
  found: number;
  scanning: boolean;
  currentDID: number;
};

export type UDSError = {
  service: number;
  nrc: number;
  nrcName: string;
  did?: number;
};

// ─── Data Type Parsers ───
function parseASCII(bytes: number[]): string {
  return bytes.map(b => (b >= 0x20 && b <= 0x7E) ? String.fromCharCode(b) : '.').join('').trim();
}

function parseUint8(bytes: number[]): number {
  return bytes[0] ?? 0;
}

function parseUint16(bytes: number[]): number {
  if (bytes.length < 2) return bytes[0] ?? 0;
  return (bytes[0] << 8) | bytes[1];
}

function parseInt16(bytes: number[]): number {
  const val = parseUint16(bytes);
  return val > 0x7FFF ? val - 0x10000 : val;
}

function parseUint32(bytes: number[]): number {
  if (bytes.length < 4) return parseUint16(bytes);
  return ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
}

function parseInt8(bytes: number[]): number {
  const val = bytes[0] ?? 0;
  return val > 0x7F ? val - 0x100 : val;
}

function parseBCD(bytes: number[]): string {
  return bytes.map(b => {
    const hi = (b >> 4) & 0x0F;
    const lo = b & 0x0F;
    return `${hi}${lo}`;
  }).join('');
}

function parseScaled(bytes: number[], scaling: DIDScaling, dataType: string): ParsedValue {
  let raw: number;
  if (dataType === 'int16') raw = parseInt16(bytes);
  else if (dataType === 'int8') raw = parseInt8(bytes);
  else if (bytes.length >= 4) raw = parseUint32(bytes);
  else if (bytes.length >= 2) raw = parseUint16(bytes);
  else raw = parseUint8(bytes);

  const value = raw * scaling.factor + scaling.offset;
  const clamped = scaling.min !== undefined && scaling.max !== undefined
    ? Math.max(scaling.min, Math.min(scaling.max, value))
    : value;

  return {
    type: 'scaled',
    stringValue: `${clamped.toFixed(clamped % 1 === 0 ? 0 : 1)} ${scaling.unit}`,
    numericValue: clamped,
    unit: scaling.unit,
  };
}

function parseBitfields(bytes: number[], bitfields: BitfieldDef[]): ParsedValue {
  // Combine bytes into a single number (up to 32 bits)
  let combined = 0;
  for (let i = 0; i < Math.min(bytes.length, 4); i++) {
    combined |= bytes[i] << (i * 8);
  }

  const results = bitfields.map(bf => {
    const mask = ((1 << bf.length) - 1) << bf.bit;
    const value = (combined & mask) >> bf.bit;
    const label = bf.values?.[value] ?? String(value);
    return { name: bf.name, value, label };
  });

  const summary = results.map(r => `${r.name}: ${r.label}`).join(', ');
  return {
    type: 'bitfield',
    stringValue: summary,
    bitfields: results,
  };
}

function toHexString(bytes: number[]): string {
  return bytes.map(b => b.toString(16).toUpperCase().padStart(2, '0')).join(' ');
}

// ─── Main DID Value Parser ───
export function parseDIDValue(did: number, bytes: number[]): ParsedValue {
  const def = getDIDDef(did);

  // Bitfield override
  if (def.bitfields && def.bitfields.length > 0) {
    return parseBitfields(bytes, def.bitfields);
  }

  // Scaled sensor values
  if (def.scaling) {
    return parseScaled(bytes, def.scaling, def.dataType);
  }

  switch (def.dataType) {
    case 'ascii':
      return { type: 'ascii', stringValue: parseASCII(bytes) };
    case 'uint8':
      return { type: 'number', stringValue: String(parseUint8(bytes)), numericValue: parseUint8(bytes) };
    case 'uint16':
      return { type: 'number', stringValue: String(parseUint16(bytes)), numericValue: parseUint16(bytes) };
    case 'uint32':
      return { type: 'number', stringValue: String(parseUint32(bytes)), numericValue: parseUint32(bytes) };
    case 'int8':
      return { type: 'number', stringValue: String(parseInt8(bytes)), numericValue: parseInt8(bytes) };
    case 'int16':
      return { type: 'number', stringValue: String(parseInt16(bytes)), numericValue: parseInt16(bytes) };
    case 'bcd':
      return { type: 'bcd', stringValue: parseBCD(bytes) };
    case 'hex':
    default:
      return { type: 'hex', stringValue: toHexString(bytes) };
  }
}

// ─── UDS Engine ───
class UDSEngine {
  private isNative = false;
  private testerPresentInterval: ReturnType<typeof setInterval> | null = null;
  private storedResults: Map<number, DIDResult> = new Map();
  private scanListeners: ((progress: ScanProgress) => void)[] = [];
  private resultListeners: ((result: DIDResult) => void)[] = [];
  private scanAbort = false;

  constructor() {
    this.isNative = typeof (window as any).Capacitor !== 'undefined';
  }

  // ─── Subscribe ───
  onScanProgress(listener: (progress: ScanProgress) => void): () => void {
    this.scanListeners.push(listener);
    return () => { this.scanListeners = this.scanListeners.filter(l => l !== listener); };
  }

  onResult(listener: (result: DIDResult) => void): () => void {
    this.resultListeners.push(listener);
    return () => { this.resultListeners = this.resultListeners.filter(l => l !== listener); };
  }

  private emitProgress(progress: ScanProgress) {
    this.scanListeners.forEach(l => l(progress));
  }

  private emitResult(result: DIDResult) {
    this.resultListeners.forEach(l => l(result));
  }

  // ─── Service 0x10: Diagnostic Session Control ───
  async setSession(session: number): Promise<boolean> {
    const cmd = `10${session.toString(16).padStart(2, '0')}`;
    try {
      const response = await this.sendUDS(cmd);
      return this.isPositiveResponse(response, 0x50);
    } catch {
      return false;
    }
  }

  // ─── Service 0x3E: Tester Present ───
  async testerPresent(): Promise<boolean> {
    try {
      const response = await this.sendUDS('3E00');
      return this.isPositiveResponse(response, 0x7E);
    } catch {
      return false;
    }
  }

  startTesterPresent(intervalMs = 2000) {
    this.stopTesterPresent();
    this.testerPresentInterval = setInterval(() => this.testerPresent(), intervalMs);
  }

  stopTesterPresent() {
    if (this.testerPresentInterval) {
      clearInterval(this.testerPresentInterval);
      this.testerPresentInterval = null;
    }
  }

  // ─── Service 0x22: Read Data By Identifier ───
  async readDID(did: number): Promise<DIDResult | UDSError> {
    const didHex = did.toString(16).toUpperCase().padStart(4, '0');
    const cmd = `22${didHex}`;

    try {
      const response = await this.sendUDS(cmd);
      const bytes = this.hexToBytes(response);

      // Check for negative response (0x7F)
      if (bytes.length >= 3 && bytes[0] === 0x7F) {
        const nrc = bytes[2];
        return {
          service: 0x22,
          nrc,
          nrcName: NRC_NAMES[nrc] || `Unknown NRC 0x${nrc.toString(16)}`,
          did,
        };
      }

      // Positive response: 0x62 + DID(2 bytes) + data
      if (bytes.length >= 3 && bytes[0] === 0x62) {
        const respDID = (bytes[1] << 8) | bytes[2];
        const payload = bytes.slice(3);
        const definition = getDIDDef(respDID);
        const parsed = parseDIDValue(respDID, payload);

        const result: DIDResult = {
          did: respDID,
          didHex: `0x${respDID.toString(16).toUpperCase().padStart(4, '0')}`,
          definition,
          rawBytes: payload,
          rawHex: toHexString(payload),
          parsed,
          timestamp: Date.now(),
        };

        this.storedResults.set(respDID, result);
        this.emitResult(result);
        return result;
      }

      return { service: 0x22, nrc: 0x10, nrcName: 'Invalid response format', did };
    } catch (e: any) {
      return { service: 0x22, nrc: 0x10, nrcName: e.message || 'Communication error', did };
    }
  }

  // ─── DID Range Scanner ───
  async scanRange(start: number, end: number): Promise<DIDResult[]> {
    this.scanAbort = false;
    const results: DIDResult[] = [];
    const total = end - start + 1;

    for (let did = start; did <= end; did++) {
      if (this.scanAbort) break;

      this.emitProgress({
        current: did - start + 1,
        total,
        found: results.length,
        scanning: true,
        currentDID: did,
      });

      const result = await this.readDID(did);
      if ('parsed' in result) {
        results.push(result);
      }

      // Small delay between reads for stability
      await new Promise(r => setTimeout(r, 30));
    }

    this.emitProgress({
      current: total,
      total,
      found: results.length,
      scanning: false,
      currentDID: end,
    });

    return results;
  }

  abortScan() {
    this.scanAbort = true;
  }

  // ─── Results Store ───
  getStoredResults(): DIDResult[] {
    return Array.from(this.storedResults.values());
  }

  getStoredResult(did: number): DIDResult | undefined {
    return this.storedResults.get(did);
  }

  clearResults() {
    this.storedResults.clear();
  }

  // ─── Internal ───
  private async sendUDS(hexPayload: string): Promise<string> {
    if (!this.isNative) {
      return this.simulateUDS(hexPayload);
    }
    // On native: send via ELM327 and reassemble ISO-TP (multi-frame DIDs!)
    const response = await elm327.sendCommand(hexPayload, 'high');
    const msg = parseIsoTp(cleanElmResponse(response, hexPayload));
    if (msg.payload.length > 0) {
      return msg.payload.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join('');
    }
    return response.replace(/\s/g, '');
  }

  private simulateUDS(hexPayload: string): Promise<string> {
    return new Promise(resolve => {
      setTimeout(() => {
        const serviceId = parseInt(hexPayload.substring(0, 2), 16);

        // Session control
        if (serviceId === 0x10) {
          const sub = parseInt(hexPayload.substring(2, 4), 16);
          resolve(`50${sub.toString(16).padStart(2, '0')}00320001F4`);
          return;
        }

        // Tester present
        if (serviceId === 0x3E) {
          resolve('7E00');
          return;
        }

        // Read DID
        if (serviceId === 0x22) {
          const did = parseInt(hexPayload.substring(2, 6), 16);
          const simData = SIMULATED_DID_RESPONSES[did];

          if (simData) {
            const didHex = did.toString(16).padStart(4, '0');
            const dataHex = simData.map(b => b.toString(16).padStart(2, '0')).join('');
            resolve(`62${didHex}${dataHex}`);
          } else {
            // NRC: Request Out Of Range
            resolve('7F2231');
          }
          return;
        }

        resolve('7F' + hexPayload.substring(0, 2) + '11');
      }, 40 + Math.random() * 60);
    });
  }

  private isPositiveResponse(response: string, expectedSID: number): boolean {
    const bytes = this.hexToBytes(response);
    return bytes.length > 0 && bytes[0] === expectedSID;
  }

  private hexToBytes(hex: string): number[] {
    const clean = hex.replace(/\s/g, '');
    const bytes: number[] = [];
    for (let i = 0; i < clean.length; i += 2) {
      bytes.push(parseInt(clean.substring(i, i + 2), 16));
    }
    return bytes;
  }
}

export const udsEngine = new UDSEngine();
