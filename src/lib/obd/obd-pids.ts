// OBD-II PID definitions optimized for Chrysler T&C / Pacifica

export type PIDDefinition = {
  pid: string;
  name: string;
  shortName: string;
  unit: string;
  min: number;
  max: number;
  formula: (bytes: number[]) => number;
  category: 'engine' | 'vehicle' | 'fuel' | 'emissions' | 'electrical';
};

export const PIDS: Record<string, PIDDefinition> = {
  '010C': {
    pid: '010C',
    name: 'Engine RPM',
    shortName: 'RPM',
    unit: 'rpm',
    min: 0,
    max: 8000,
    formula: (b) => ((b[0] * 256) + b[1]) / 4,
    category: 'engine',
  },
  '010D': {
    pid: '010D',
    name: 'Vehicle Speed',
    shortName: 'SPD',
    unit: 'km/h',
    min: 0,
    max: 255,
    formula: (b) => b[0],
    category: 'vehicle',
  },
  '0105': {
    pid: '0105',
    name: 'Coolant Temperature',
    shortName: 'CLT',
    unit: '°C',
    min: -40,
    max: 215,
    formula: (b) => b[0] - 40,
    category: 'engine',
  },
  '0111': {
    pid: '0111',
    name: 'Throttle Position',
    shortName: 'TPS',
    unit: '%',
    min: 0,
    max: 100,
    formula: (b) => (b[0] * 100) / 255,
    category: 'engine',
  },
  '0142': {
    pid: '0142',
    name: 'Battery Voltage',
    shortName: 'BATT',
    unit: 'V',
    min: 0,
    max: 65.535,
    formula: (b) => ((b[0] * 256) + b[1]) / 1000,
    category: 'electrical',
  },
  '0146': {
    pid: '0146',
    name: 'Ambient Air Temp',
    shortName: 'AAT',
    unit: '°C',
    min: -40,
    max: 215,
    formula: (b) => b[0] - 40,
    category: 'vehicle',
  },
  '0151': {
    pid: '0151',
    name: 'Fuel Type',
    shortName: 'FUEL',
    unit: '',
    min: 0,
    max: 23,
    formula: (b) => b[0],
    category: 'fuel',
  },
  '0104': {
    pid: '0104',
    name: 'Engine Load',
    shortName: 'LOAD',
    unit: '%',
    min: 0,
    max: 100,
    formula: (b) => (b[0] * 100) / 255,
    category: 'engine',
  },
  '010A': {
    pid: '010A',
    name: 'Fuel Pressure',
    shortName: 'FP',
    unit: 'kPa',
    min: 0,
    max: 765,
    formula: (b) => b[0] * 3,
    category: 'fuel',
  },
  '010B': {
    pid: '010B',
    name: 'Intake Manifold Pressure',
    shortName: 'MAP',
    unit: 'kPa',
    min: 0,
    max: 255,
    formula: (b) => b[0],
    category: 'engine',
  },
  '010F': {
    pid: '010F',
    name: 'Intake Air Temp',
    shortName: 'IAT',
    unit: '°C',
    min: -40,
    max: 215,
    formula: (b) => b[0] - 40,
    category: 'engine',
  },
  '015C': {
    pid: '015C',
    name: 'Engine Oil Temperature',
    shortName: 'OILT',
    unit: '°C',
    min: -40,
    max: 210,
    formula: (b) => b[0] - 40,
    category: 'engine',
  },
  '012F': {
    pid: '012F',
    name: 'Fuel Tank Level',
    shortName: 'FUEL%',
    unit: '%',
    min: 0,
    max: 100,
    formula: (b) => (b[0] * 100) / 255,
    category: 'fuel',
  },
  '015E': {
    pid: '015E',
    name: 'Engine Fuel Rate',
    shortName: 'FRATE',
    unit: 'L/h',
    min: 0,
    max: 3212.75,
    formula: (b) => ((b[0] * 256) + b[1]) * 0.05,
    category: 'fuel',
  },
  '0110': {
    pid: '0110',
    name: 'Mass Air Flow',
    shortName: 'MAF',
    unit: 'g/s',
    min: 0,
    max: 655.35,
    formula: (b) => ((b[0] * 256) + b[1]) / 100,
    category: 'engine',
  },
};

// Pořadí pro polling: rychlé/důležité hodnoty první (RPM, rychlost, plyn),
// pomalejší (teploty, palivo, napětí) v druhém kole.
export const LIVE_PIDS = ['010C', '010D', '0111', '0104', '0105', '010F', '010A', '010B', '0142', '015C', '012F', '015E', '0110'];


export function parsePIDResponse(pid: string, rawHex: string): number | null {
  const def = PIDS[pid];
  if (!def || !rawHex || /NO\s*DATA|UNABLE|ERROR|STOPPED|SEARCHING|\?/i.test(rawHex)) return null;

  const pidHex = pid.substring(2).toUpperCase();
  const cleanLines = rawHex
    .split(/[\r\n]+/)
    .map(line => line.replace(/[^0-9A-Fa-f]/g, '').toUpperCase())
    .filter(Boolean);

  const candidates = cleanLines.length ? cleanLines : [rawHex.replace(/[^0-9A-Fa-f]/g, '').toUpperCase()];

  for (const clean of candidates) {
    const marker = `41${pidHex}`;
    const idx = clean.indexOf(marker);
    if (idx === -1) continue;

    const dataHex = clean.substring(idx + marker.length);
    const bytes: number[] = [];
    for (let i = 0; i + 1 < dataHex.length; i += 2) {
      const byte = parseInt(dataHex.substring(i, i + 2), 16);
      if (!Number.isNaN(byte)) bytes.push(byte);
    }

    if (bytes.length === 0) continue;
    const value = def.formula(bytes);
    if (Number.isFinite(value)) return value;
  }

  return null;
}
