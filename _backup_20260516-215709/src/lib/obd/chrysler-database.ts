// Chrysler Town & Country (2010–2016) & Pacifica (2017+) Complete Database
// Ready for direct app consumption

export interface CodingDIDEntry {
  did: number;
  name: string;
  category: 'comfort' | 'lighting' | 'climate' | 'dashboard' | 'sound';
  bytes: number;
  type: 'bool' | 'int' | 'enum' | 'flags' | 'ascii';
  range: [number, number];
  scaling: number;
  unit: string;
  description: string;
  defaultValue: number;
  safeValues: number[];
  requiresBackup: boolean;
  requiresSecurityAccess: boolean;
  rollbackSupported: boolean;
  writeSafe: boolean;
  restrictedOnPacifica: boolean;
  notes: string;
  enumValues?: Record<number, string>;
}

export interface LiveSensorDID {
  did: number;
  name: string;
  shortName: string;
  bytes: number;
  type: 'uint8' | 'uint16' | 'int16' | 'float' | 'bool' | 'enum';
  scaling: number;
  offset: number;
  unit: string;
  range: [number, number];
  pollFrequencyMs: number;
  dashboardWidget: 'gauge' | 'number' | 'bar' | 'boolean' | 'text';
  dashboardColor: string;
  warningThreshold: number | null;
  criticalThreshold: number | null;
  aiCorrelation: string[];
  description: string;
  ecuModule: string;
  obdPid?: number;
}

export interface DTCEntry {
  code: string;
  type: 'P' | 'B' | 'C' | 'U';
  system: 'powertrain' | 'body' | 'chassis' | 'network';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  possibleCause: string;
  recommendedAction: string;
  relatedDIDs: number[];
  relatedSensors: string[];
  affectsModels: ('tc' | 'pacifica' | 'both')[];
  yearRange: [number, number];
  commonInMileage?: string;
}

export interface AIPlaceholderDID {
  did: number;
  name: string;
  bytes: number;
  discoveredType: string | null;
  scaling: number | null;
  variance: number | null;
  correlationHints: string[];
  confidence: number;
  lastSeen: number | null;
  notes: string;
}

export interface ChryslerDatabase {
  version: string;
  lastUpdated: string;
  supportedVehicles: { model: string; years: string; platform: string }[];
  codingDIDs: CodingDIDEntry[];
  liveSensors: LiveSensorDID[];
  dtcCodes: DTCEntry[];
  aiPlaceholders: AIPlaceholderDID[];
}

export const CHRYSLER_DATABASE: ChryslerDatabase = {
  version: '2.0.0',
  lastUpdated: '2026-04-08',
  supportedVehicles: [
    { model: 'Chrysler Town & Country', years: '2010–2016', platform: 'RT' },
    { model: 'Chrysler Pacifica', years: '2017–2025', platform: 'RU' },
    { model: 'Chrysler Pacifica Hybrid', years: '2017–2025', platform: 'RU PHEV' },
  ],

  // ═══════════════════════════════════════
  // 1. CODING / CONFIGURATION DIDs
  // ═══════════════════════════════════════
  codingDIDs: [
    {
      did: 0xF1B0, name: 'Auto Door Lock', category: 'comfort',
      bytes: 1, type: 'enum', range: [0, 3], scaling: 1, unit: '',
      description: 'Automatic door lock behavior on vehicle speed threshold',
      defaultValue: 1, safeValues: [0, 1, 2, 3],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'All values safe. Common coding change.',
      enumValues: { 0: 'Disabled', 1: 'Lock at 15 mph', 2: 'Lock at 20 mph', 3: 'Lock on shift out of Park' },
    },
    {
      did: 0xF1B1, name: 'Follow Me Home Lights', category: 'comfort',
      bytes: 1, type: 'enum', range: [0, 4], scaling: 1, unit: '',
      description: 'Headlight delay after vehicle off for walkaway illumination',
      defaultValue: 2, safeValues: [0, 1, 2, 3, 4],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'Duration options. No risk.',
      enumValues: { 0: 'Disabled', 1: '30 seconds', 2: '60 seconds', 3: '90 seconds', 4: '120 seconds' },
    },
    {
      did: 0xF1B2, name: 'Seatbelt Chime', category: 'comfort',
      bytes: 1, type: 'enum', range: [0, 2], scaling: 1, unit: '',
      description: 'Seatbelt reminder chime behavior',
      defaultValue: 1, safeValues: [0, 1, 2],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: true,
      notes: 'Pacifica 2020+ may reject writes (7F 22 33). Check local regulations before disabling.',
      enumValues: { 0: 'Disabled', 1: 'Standard (6 chimes)', 2: 'Extended (continuous)' },
    },
    {
      did: 0xF1B3, name: 'DRL Mode', category: 'lighting',
      bytes: 1, type: 'enum', range: [0, 3], scaling: 1, unit: '',
      description: 'Daytime Running Lights configuration',
      defaultValue: 1, safeValues: [0, 1, 2, 3],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'Check local law compliance. Some regions require DRL.',
      enumValues: { 0: 'Off', 1: 'Low beam reduced', 2: 'LED DRL only', 3: 'Full low beam' },
    },
    {
      did: 0xF1B4, name: 'Interior Brightness', category: 'lighting',
      bytes: 1, type: 'int', range: [0, 100], scaling: 1, unit: '%',
      description: 'Interior ambient and instrument lighting maximum brightness',
      defaultValue: 80, safeValues: [],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'Full range safe. 0=minimum, 100=maximum.',
    },
    {
      did: 0xF1B5, name: 'Auto AC on Start', category: 'climate',
      bytes: 1, type: 'bool', range: [0, 1], scaling: 1, unit: '',
      description: 'Automatically enable AC compressor on engine start',
      defaultValue: 1, safeValues: [0, 1],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'Safe toggle. Disabling may reduce fuel consumption slightly.',
    },
    {
      did: 0xF1B6, name: 'Seat Heating Default', category: 'climate',
      bytes: 1, type: 'enum', range: [0, 3], scaling: 1, unit: '',
      description: 'Default heated seat level when remote start is used',
      defaultValue: 0, safeValues: [0, 1, 2, 3],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'Only applies during remote start. Manual override always available.',
      enumValues: { 0: 'Off', 1: 'Low', 2: 'Medium', 3: 'High' },
    },
    {
      did: 0xF1B7, name: 'Dashboard Display Flags', category: 'dashboard',
      bytes: 1, type: 'flags', range: [0, 255], scaling: 1, unit: '',
      description: 'Bitfield controlling which data items appear on instrument cluster',
      defaultValue: 0x3F, safeValues: [],
      requiresBackup: true, requiresSecurityAccess: true, rollbackSupported: true,
      writeSafe: false, restrictedOnPacifica: true,
      notes: 'Bit 0=Instant MPG, Bit 1=Avg MPG, Bit 2=Range, Bit 3=Oil Life, Bit 4=Tire Press, Bit 5=Compass, Bit 6=Temp, Bit 7=Reserved. Pacifica may restrict.',
    },
    {
      did: 0xF1B8, name: 'Warning Volume', category: 'sound',
      bytes: 1, type: 'int', range: [1, 7], scaling: 1, unit: 'level',
      description: 'Volume level for chimes and warning sounds',
      defaultValue: 4, safeValues: [1, 2, 3, 4, 5, 6, 7],
      requiresBackup: true, requiresSecurityAccess: false, rollbackSupported: true,
      writeSafe: true, restrictedOnPacifica: false,
      notes: 'Level 1=quietest, 7=loudest. Never set to 0.',
    },
  ],

  // ═══════════════════════════════════════
  // 2. LIVE SENSOR DIDs
  // ═══════════════════════════════════════
  liveSensors: [
    {
      did: 0xF40C, name: 'Engine RPM', shortName: 'RPM',
      bytes: 2, type: 'uint16', scaling: 0.25, offset: 0, unit: 'RPM',
      range: [0, 8000], pollFrequencyMs: 100,
      dashboardWidget: 'gauge', dashboardColor: 'primary',
      warningThreshold: 5500, criticalThreshold: 6500,
      aiCorrelation: ['throttle', 'speed', 'gear', 'fuel_consumption'],
      description: 'Engine crankshaft revolutions per minute',
      ecuModule: 'PCM', obdPid: 0x0C,
    },
    {
      did: 0xF40D, name: 'Vehicle Speed', shortName: 'SPD',
      bytes: 1, type: 'uint8', scaling: 1, offset: 0, unit: 'km/h',
      range: [0, 255], pollFrequencyMs: 200,
      dashboardWidget: 'gauge', dashboardColor: 'chart-1',
      warningThreshold: 130, criticalThreshold: 180,
      aiCorrelation: ['rpm', 'gear', 'throttle'],
      description: 'Vehicle speed from transmission output shaft sensor',
      ecuModule: 'PCM', obdPid: 0x0D,
    },
    {
      did: 0xF411, name: 'Throttle Position', shortName: 'TPS',
      bytes: 1, type: 'uint8', scaling: 0.392, offset: 0, unit: '%',
      range: [0, 100], pollFrequencyMs: 100,
      dashboardWidget: 'bar', dashboardColor: 'chart-2',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['rpm', 'speed', 'fuel_consumption', 'maf'],
      description: 'Throttle plate opening percentage',
      ecuModule: 'PCM', obdPid: 0x11,
    },
    {
      did: 0xF405, name: 'Coolant Temperature', shortName: 'CLT',
      bytes: 1, type: 'uint8', scaling: 1, offset: -40, unit: '°C',
      range: [-40, 215], pollFrequencyMs: 2000,
      dashboardWidget: 'gauge', dashboardColor: 'chart-3',
      warningThreshold: 105, criticalThreshold: 115,
      aiCorrelation: ['oil_temp', 'rpm', 'speed', 'fan_status'],
      description: 'Engine coolant temperature from ECT sensor',
      ecuModule: 'PCM', obdPid: 0x05,
    },
    {
      did: 0xF42F, name: 'Fuel Level', shortName: 'FUEL',
      bytes: 1, type: 'uint8', scaling: 0.392, offset: 0, unit: '%',
      range: [0, 100], pollFrequencyMs: 10000,
      dashboardWidget: 'bar', dashboardColor: 'chart-4',
      warningThreshold: 15, criticalThreshold: 5,
      aiCorrelation: ['distance', 'fuel_consumption'],
      description: 'Fuel tank level percentage',
      ecuModule: 'PCM', obdPid: 0x2F,
    },
    {
      did: 0xF442, name: 'Battery Voltage', shortName: 'VBAT',
      bytes: 2, type: 'uint16', scaling: 0.001, offset: 0, unit: 'V',
      range: [0, 18], pollFrequencyMs: 5000,
      dashboardWidget: 'number', dashboardColor: 'chart-5',
      warningThreshold: 11.8, criticalThreshold: 11.0,
      aiCorrelation: ['alternator', 'electrical_load'],
      description: 'Battery / charging system voltage',
      ecuModule: 'PCM', obdPid: 0x42,
    },
    {
      did: 0xF45C, name: 'Oil Temperature', shortName: 'OIL',
      bytes: 1, type: 'uint8', scaling: 1, offset: -40, unit: '°C',
      range: [-40, 210], pollFrequencyMs: 5000,
      dashboardWidget: 'gauge', dashboardColor: 'destructive',
      warningThreshold: 130, criticalThreshold: 150,
      aiCorrelation: ['coolant_temp', 'rpm', 'speed'],
      description: 'Engine oil temperature',
      ecuModule: 'PCM', obdPid: 0x5C,
    },
    {
      did: 0xF4A6, name: 'Transmission Temperature', shortName: 'TRANS',
      bytes: 2, type: 'uint16', scaling: 0.1, offset: -40, unit: '°C',
      range: [-40, 200], pollFrequencyMs: 3000,
      dashboardWidget: 'gauge', dashboardColor: 'chart-4',
      warningThreshold: 120, criticalThreshold: 140,
      aiCorrelation: ['speed', 'gear', 'tow_mode'],
      description: 'Automatic transmission fluid temperature (62TE/9HP)',
      ecuModule: 'TCM',
    },
    {
      did: 0xF4A4, name: 'Gear Position', shortName: 'GEAR',
      bytes: 1, type: 'enum', scaling: 1, offset: 0, unit: '',
      range: [0, 10], pollFrequencyMs: 500,
      dashboardWidget: 'text', dashboardColor: 'primary',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['rpm', 'speed', 'throttle'],
      description: 'Current transmission gear position',
      ecuModule: 'TCM',
    },
    {
      did: 0xF449, name: 'Brake Pedal Status', shortName: 'BRK',
      bytes: 1, type: 'bool', scaling: 1, offset: 0, unit: '',
      range: [0, 1], pollFrequencyMs: 100,
      dashboardWidget: 'boolean', dashboardColor: 'destructive',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['speed', 'brake_pressure'],
      description: 'Brake pedal pressed status from brake switch',
      ecuModule: 'ABS/ESC',
    },
    {
      did: 0xF410, name: 'MAF Air Flow', shortName: 'MAF',
      bytes: 2, type: 'uint16', scaling: 0.01, offset: 0, unit: 'g/s',
      range: [0, 655], pollFrequencyMs: 200,
      dashboardWidget: 'number', dashboardColor: 'chart-1',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['rpm', 'throttle', 'intake_temp'],
      description: 'Mass air flow rate from MAF sensor',
      ecuModule: 'PCM', obdPid: 0x10,
    },
    {
      did: 0xF40F, name: 'Intake Air Temperature', shortName: 'IAT',
      bytes: 1, type: 'uint8', scaling: 1, offset: -40, unit: '°C',
      range: [-40, 215], pollFrequencyMs: 5000,
      dashboardWidget: 'number', dashboardColor: 'chart-2',
      warningThreshold: 50, criticalThreshold: 70,
      aiCorrelation: ['coolant_temp', 'maf'],
      description: 'Intake manifold air temperature',
      ecuModule: 'PCM', obdPid: 0x0F,
    },
    {
      did: 0xF404, name: 'Engine Load', shortName: 'LOAD',
      bytes: 1, type: 'uint8', scaling: 0.392, offset: 0, unit: '%',
      range: [0, 100], pollFrequencyMs: 200,
      dashboardWidget: 'bar', dashboardColor: 'chart-3',
      warningThreshold: 85, criticalThreshold: 95,
      aiCorrelation: ['rpm', 'throttle', 'maf', 'speed'],
      description: 'Calculated engine load value',
      ecuModule: 'PCM', obdPid: 0x04,
    },
    {
      did: 0xF40E, name: 'Timing Advance', shortName: 'SPARK',
      bytes: 1, type: 'uint8', scaling: 0.5, offset: -64, unit: '°',
      range: [-64, 63.5], pollFrequencyMs: 500,
      dashboardWidget: 'number', dashboardColor: 'chart-5',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['rpm', 'load', 'knock'],
      description: 'Ignition timing advance relative to TDC',
      ecuModule: 'PCM', obdPid: 0x0E,
    },
    {
      did: 0xF446, name: 'Ambient Air Temperature', shortName: 'AMB',
      bytes: 1, type: 'uint8', scaling: 1, offset: -40, unit: '°C',
      range: [-40, 85], pollFrequencyMs: 30000,
      dashboardWidget: 'number', dashboardColor: 'muted',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['coolant_temp', 'intake_temp'],
      description: 'Outside ambient temperature sensor',
      ecuModule: 'BCM', obdPid: 0x46,
    },
    {
      did: 0x2100, name: 'Tire Pressure FL', shortName: 'TPFL',
      bytes: 2, type: 'uint16', scaling: 0.01, offset: 0, unit: 'bar',
      range: [0, 5], pollFrequencyMs: 30000,
      dashboardWidget: 'number', dashboardColor: 'chart-1',
      warningThreshold: 2.0, criticalThreshold: 1.5,
      aiCorrelation: ['speed', 'ambient_temp'],
      description: 'Front left tire pressure from TPMS sensor',
      ecuModule: 'BCM',
    },
    {
      did: 0x2101, name: 'Tire Pressure FR', shortName: 'TPFR',
      bytes: 2, type: 'uint16', scaling: 0.01, offset: 0, unit: 'bar',
      range: [0, 5], pollFrequencyMs: 30000,
      dashboardWidget: 'number', dashboardColor: 'chart-1',
      warningThreshold: 2.0, criticalThreshold: 1.5,
      aiCorrelation: ['speed', 'ambient_temp'],
      description: 'Front right tire pressure from TPMS sensor',
      ecuModule: 'BCM',
    },
    {
      did: 0x2102, name: 'Tire Pressure RL', shortName: 'TPRL',
      bytes: 2, type: 'uint16', scaling: 0.01, offset: 0, unit: 'bar',
      range: [0, 5], pollFrequencyMs: 30000,
      dashboardWidget: 'number', dashboardColor: 'chart-1',
      warningThreshold: 2.0, criticalThreshold: 1.5,
      aiCorrelation: ['speed', 'ambient_temp'],
      description: 'Rear left tire pressure from TPMS sensor',
      ecuModule: 'BCM',
    },
    {
      did: 0x2103, name: 'Tire Pressure RR', shortName: 'TPRR',
      bytes: 2, type: 'uint16', scaling: 0.01, offset: 0, unit: 'bar',
      range: [0, 5], pollFrequencyMs: 30000,
      dashboardWidget: 'number', dashboardColor: 'chart-1',
      warningThreshold: 2.0, criticalThreshold: 1.5,
      aiCorrelation: ['speed', 'ambient_temp'],
      description: 'Rear right tire pressure from TPMS sensor',
      ecuModule: 'BCM',
    },
    {
      did: 0xF421, name: 'Distance with MIL', shortName: 'DMIL',
      bytes: 2, type: 'uint16', scaling: 1, offset: 0, unit: 'km',
      range: [0, 65535], pollFrequencyMs: 60000,
      dashboardWidget: 'number', dashboardColor: 'destructive',
      warningThreshold: 100, criticalThreshold: 500,
      aiCorrelation: ['dtc_count'],
      description: 'Distance traveled while MIL is illuminated',
      ecuModule: 'PCM', obdPid: 0x21,
    },
    {
      did: 0xF41F, name: 'Run Time Since Start', shortName: 'RTIME',
      bytes: 2, type: 'uint16', scaling: 1, offset: 0, unit: 's',
      range: [0, 65535], pollFrequencyMs: 10000,
      dashboardWidget: 'number', dashboardColor: 'muted',
      warningThreshold: null, criticalThreshold: null,
      aiCorrelation: ['coolant_temp', 'oil_temp'],
      description: 'Time since engine started',
      ecuModule: 'PCM', obdPid: 0x1F,
    },
  ],

  // ═══════════════════════════════════════
  // 3. DTC CODES
  // ═══════════════════════════════════════
  dtcCodes: [
    // ── Powertrain ──
    { code: 'P0300', type: 'P', system: 'powertrain', description: 'Random/Multiple Cylinder Misfire Detected', severity: 'high',
      possibleCause: 'Worn spark plugs, faulty ignition coils, vacuum leaks, fuel injector issues, low compression',
      recommendedAction: 'Check spark plugs and coils. Inspect for vacuum leaks. Test fuel pressure and injectors.',
      relatedDIDs: [0xF40C, 0xF411, 0xF404], relatedSensors: ['RPM', 'Engine Load', 'Throttle'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0301', type: 'P', system: 'powertrain', description: 'Cylinder 1 Misfire Detected', severity: 'high',
      possibleCause: 'Spark plug, ignition coil, injector, or compression issue on cylinder 1',
      recommendedAction: 'Swap coil/plug with adjacent cylinder. If code follows, replace component.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0302', type: 'P', system: 'powertrain', description: 'Cylinder 2 Misfire Detected', severity: 'high',
      possibleCause: 'Spark plug, ignition coil, injector, or compression issue on cylinder 2',
      recommendedAction: 'Swap coil/plug with adjacent cylinder to isolate.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0303', type: 'P', system: 'powertrain', description: 'Cylinder 3 Misfire Detected', severity: 'high',
      possibleCause: 'Spark plug, ignition coil, injector, or compression issue on cylinder 3',
      recommendedAction: 'Swap coil/plug with adjacent cylinder to isolate.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0304', type: 'P', system: 'powertrain', description: 'Cylinder 4 Misfire Detected', severity: 'high',
      possibleCause: 'Spark plug, ignition coil, injector, or compression issue on cylinder 4',
      recommendedAction: 'Swap coil/plug with adjacent cylinder to isolate.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0305', type: 'P', system: 'powertrain', description: 'Cylinder 5 Misfire Detected', severity: 'high',
      possibleCause: 'Spark plug, ignition coil, injector, or compression issue on cylinder 5',
      recommendedAction: 'Swap coil/plug. Check wiring harness for V6 rear bank access issues.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0306', type: 'P', system: 'powertrain', description: 'Cylinder 6 Misfire Detected', severity: 'high',
      possibleCause: 'Spark plug, ignition coil, injector, or compression issue on cylinder 6',
      recommendedAction: 'Swap coil/plug. Common on 3.6L Pentastar rear bank.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0128', type: 'P', system: 'powertrain', description: 'Coolant Thermostat Below Regulating Temperature', severity: 'medium',
      possibleCause: 'Stuck open thermostat, low coolant level, faulty ECT sensor',
      recommendedAction: 'Replace thermostat. Very common on 3.6L Pentastar. Check coolant level.',
      relatedDIDs: [0xF405], relatedSensors: ['Coolant Temperature'],
      affectsModels: ['both'], yearRange: [2010, 2025], commonInMileage: '60,000–100,000 mi' },
    { code: 'P0171', type: 'P', system: 'powertrain', description: 'System Too Lean (Bank 1)', severity: 'medium',
      possibleCause: 'Vacuum leak, weak fuel pump, dirty/faulty MAF sensor, exhaust leak before O2',
      recommendedAction: 'Smoke test for vacuum leaks. Clean MAF. Check fuel trims and pressure.',
      relatedDIDs: [0xF410, 0xF411], relatedSensors: ['MAF Air Flow', 'Throttle Position'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0172', type: 'P', system: 'powertrain', description: 'System Too Rich (Bank 1)', severity: 'medium',
      possibleCause: 'Leaking fuel injector, faulty O2 sensor, high fuel pressure, stuck PCV',
      recommendedAction: 'Check fuel pressure. Inspect injectors for leaks. Test O2 sensors.',
      relatedDIDs: [0xF410, 0xF411], relatedSensors: ['MAF Air Flow', 'Throttle Position'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0340', type: 'P', system: 'powertrain', description: 'Camshaft Position Sensor A Circuit', severity: 'high',
      possibleCause: 'Failed CMP sensor, wiring damage, timing chain stretch',
      recommendedAction: 'Replace CMP sensor. If recurring, inspect timing chain and guides.',
      relatedDIDs: [0xF40C], relatedSensors: ['RPM'],
      affectsModels: ['both'], yearRange: [2010, 2025], commonInMileage: '80,000–150,000 mi' },
    { code: 'P0420', type: 'P', system: 'powertrain', description: 'Catalyst System Efficiency Below Threshold (Bank 1)', severity: 'medium',
      possibleCause: 'Worn catalytic converter, O2 sensor degradation, exhaust leaks',
      recommendedAction: 'Compare upstream/downstream O2 sensor waveforms. Replace cat if confirmed.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025], commonInMileage: '100,000+ mi' },
    { code: 'P0440', type: 'P', system: 'powertrain', description: 'Evaporative Emission System Malfunction', severity: 'low',
      possibleCause: 'Loose or damaged gas cap, EVAP canister leak, purge valve stuck',
      recommendedAction: 'Check gas cap seal. Smoke test EVAP system.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0455', type: 'P', system: 'powertrain', description: 'EVAP System Large Leak Detected', severity: 'medium',
      possibleCause: 'Missing gas cap, disconnected EVAP hose, cracked canister',
      recommendedAction: 'Visual inspection of EVAP lines. Smoke test.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0456', type: 'P', system: 'powertrain', description: 'EVAP System Small Leak Detected', severity: 'low',
      possibleCause: 'Deteriorated gas cap O-ring, small crack in EVAP hose',
      recommendedAction: 'Replace gas cap first. If persists, smoke test EVAP.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0520', type: 'P', system: 'powertrain', description: 'Engine Oil Pressure Sensor/Switch Circuit', severity: 'high',
      possibleCause: 'Faulty oil pressure sensor, low oil, wiring issue, oil pump failure',
      recommendedAction: 'Verify oil level. Replace sensor. If pressure truly low, do NOT drive.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0562', type: 'P', system: 'powertrain', description: 'System Voltage Low', severity: 'medium',
      possibleCause: 'Weak/dying battery, failing alternator, corroded terminals, parasitic draw',
      recommendedAction: 'Load test battery. Test alternator output. Check terminal connections.',
      relatedDIDs: [0xF442], relatedSensors: ['Battery Voltage'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0563', type: 'P', system: 'powertrain', description: 'System Voltage High', severity: 'medium',
      possibleCause: 'Faulty voltage regulator (internal to alternator), wiring short',
      recommendedAction: 'Test alternator voltage output. Replace alternator/regulator if >15V.',
      relatedDIDs: [0xF442], relatedSensors: ['Battery Voltage'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0700', type: 'P', system: 'powertrain', description: 'Transmission Control System Malfunction', severity: 'high',
      possibleCause: 'TCM internal fault, wiring issue, solenoid failure. Meta code — check trans DTCs.',
      recommendedAction: 'Scan TCM for specific codes. Check trans fluid level and condition.',
      relatedDIDs: [0xF4A6, 0xF4A4], relatedSensors: ['Transmission Temperature', 'Gear Position'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0730', type: 'P', system: 'powertrain', description: 'Incorrect Gear Ratio', severity: 'high',
      possibleCause: 'Low transmission fluid, worn clutch packs, solenoid stuck, valve body issue',
      recommendedAction: 'Check trans fluid. Known issue on 62TE (T&C). May need valve body or rebuild.',
      relatedDIDs: [0xF4A6, 0xF40D, 0xF40C], relatedSensors: ['Transmission Temperature', 'Vehicle Speed', 'RPM'],
      affectsModels: ['tc'], yearRange: [2010, 2016], commonInMileage: '80,000–140,000 mi' },
    { code: 'P0944', type: 'P', system: 'powertrain', description: 'Hydraulic Pressure Unit Loss of Pressure', severity: 'critical',
      possibleCause: 'Transmission pump failure, severe internal leak, critically low fluid',
      recommendedAction: 'Do NOT drive. Tow to shop. Internal transmission failure likely.',
      relatedDIDs: [0xF4A6], relatedSensors: ['Transmission Temperature'],
      affectsModels: ['tc'], yearRange: [2010, 2016] },
    { code: 'P2096', type: 'P', system: 'powertrain', description: 'Post Catalyst Fuel Trim System Too Lean (Bank 1)', severity: 'medium',
      possibleCause: 'Exhaust leak after cat, failing downstream O2 sensor, catalyst deterioration',
      recommendedAction: 'Check for exhaust leaks. Test downstream O2.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P2135', type: 'P', system: 'powertrain', description: 'Throttle/Pedal Position Sensor Correlation', severity: 'critical',
      possibleCause: 'Faulty TPS, damaged wiring, corroded connector, throttle body failure',
      recommendedAction: 'CRITICAL — vehicle may enter limp mode. Replace throttle body or TPS immediately.',
      relatedDIDs: [0xF411], relatedSensors: ['Throttle Position'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'P0456', type: 'P', system: 'powertrain', description: 'EVAP System Small Leak Detected', severity: 'low',
      possibleCause: 'Gas cap, EVAP hose', recommendedAction: 'Replace gas cap.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },

    // ── Body ──
    { code: 'B1004', type: 'B', system: 'body', description: 'Battery Voltage Out of Range (BCM)', severity: 'medium',
      possibleCause: 'Battery, alternator, wiring, BCM power supply issue',
      recommendedAction: 'Check battery and alternator. Inspect BCM connector for corrosion.',
      relatedDIDs: [0xF442], relatedSensors: ['Battery Voltage'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'B1B50', type: 'B', system: 'body', description: 'Passenger Airbag Deactivation Indicator Open', severity: 'medium',
      possibleCause: 'Faulty seat occupancy sensor, wiring under seat, ORC module issue',
      recommendedAction: 'Check connector under passenger seat. Common after seat removal or cleaning.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'B1A3E', type: 'B', system: 'body', description: 'Sliding Door Motor Overcurrent (Left)', severity: 'medium',
      possibleCause: 'Binding door track, faulty motor, low battery voltage during operation',
      recommendedAction: 'Lubricate track. Check motor. Common on T&C with heavy use.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['tc', 'pacifica'], yearRange: [2010, 2025], commonInMileage: '50,000+ mi' },
    { code: 'B1A3F', type: 'B', system: 'body', description: 'Sliding Door Motor Overcurrent (Right)', severity: 'medium',
      possibleCause: 'Binding door track, faulty motor, low battery voltage during operation',
      recommendedAction: 'Lubricate track. Check motor.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['tc', 'pacifica'], yearRange: [2010, 2025], commonInMileage: '50,000+ mi' },
    { code: 'B1A44', type: 'B', system: 'body', description: 'Power Liftgate Motor Stuck', severity: 'medium',
      possibleCause: 'Strut failure, motor issue, latch stuck, obstructed path',
      recommendedAction: 'Check liftgate struts and latch mechanism. Lubricate.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'B2204', type: 'B', system: 'body', description: 'HVAC Blend Door Actuator Circuit', severity: 'low',
      possibleCause: 'Failed blend door actuator (clicking noise behind dash)',
      recommendedAction: 'Replace blend door actuator. Extremely common on T&C.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['tc'], yearRange: [2010, 2016], commonInMileage: '40,000–80,000 mi' },
    { code: 'B100E', type: 'B', system: 'body', description: 'TPMS Sensor Signal Not Received', severity: 'low',
      possibleCause: 'Dead TPMS sensor battery, sensor not programmed after tire rotation',
      recommendedAction: 'Reprogram TPMS sensors. Replace if battery dead.',
      relatedDIDs: [0x2100, 0x2101, 0x2102, 0x2103], relatedSensors: ['Tire Pressure FL', 'Tire Pressure FR', 'Tire Pressure RL', 'Tire Pressure RR'],
      affectsModels: ['both'], yearRange: [2010, 2025] },

    // ── Chassis ──
    { code: 'C0034', type: 'C', system: 'chassis', description: 'RF Wheel Speed Sensor Circuit', severity: 'high',
      possibleCause: 'Damaged wheel speed sensor, corroded connector, damaged tone ring, bearing play',
      recommendedAction: 'Inspect sensor and connector. Check for metal debris on sensor tip.',
      relatedDIDs: [0xF40D], relatedSensors: ['Vehicle Speed'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'C0035', type: 'C', system: 'chassis', description: 'RF Wheel Speed Sensor Performance', severity: 'high',
      possibleCause: 'Intermittent signal, excessive air gap, cracked tone ring',
      recommendedAction: 'Check air gap. Inspect tone ring for damage.',
      relatedDIDs: [0xF40D], relatedSensors: ['Vehicle Speed'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'C0040', type: 'C', system: 'chassis', description: 'LF Wheel Speed Sensor Circuit', severity: 'high',
      possibleCause: 'Damaged wheel speed sensor, corroded connector, damaged tone ring',
      recommendedAction: 'Inspect sensor and connector.',
      relatedDIDs: [0xF40D], relatedSensors: ['Vehicle Speed'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'C0051', type: 'C', system: 'chassis', description: 'LF Wheel Speed Sensor Circuit Malfunction', severity: 'high',
      possibleCause: 'Wheel speed sensor failure, tone ring damage, wiring fault',
      recommendedAction: 'Replace sensor. Check wheel bearing.',
      relatedDIDs: [0xF40D], relatedSensors: ['Vehicle Speed'],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'C1014', type: 'C', system: 'chassis', description: 'ABS Pump Motor Circuit', severity: 'critical',
      possibleCause: 'ABS module failure, pump motor burnout, relay fault',
      recommendedAction: 'ABS non-functional. Replace ABS module/pump assembly.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'C2116', type: 'C', system: 'chassis', description: 'Steering Angle Sensor Plausibility', severity: 'medium',
      possibleCause: 'Steering angle sensor needs calibration, clock spring issue',
      recommendedAction: 'Perform steering angle sensor calibration. Check clock spring.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'C2200', type: 'C', system: 'chassis', description: 'ESC Malfunction', severity: 'high',
      possibleCause: 'ABS/ESC module failure, sensor input error, wiring',
      recommendedAction: 'Scan ABS module for sub-codes. May need module replacement.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },

    // ── Network ──
    { code: 'U0100', type: 'U', system: 'network', description: 'Lost Communication with ECM/PCM', severity: 'critical',
      possibleCause: 'CAN bus fault (open/short), PCM power supply, PCM failure, damaged harness',
      recommendedAction: 'CRITICAL — check CAN bus integrity at DLC. Verify PCM power and ground.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'U0101', type: 'U', system: 'network', description: 'Lost Communication with TCM', severity: 'high',
      possibleCause: 'CAN bus issue, TCM failure, connector corrosion',
      recommendedAction: 'Check CAN wiring to TCM. Common after water intrusion.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'U0121', type: 'U', system: 'network', description: 'Lost Communication with ABS Module', severity: 'high',
      possibleCause: 'CAN bus fault, ABS module failure, connector issue',
      recommendedAction: 'Check CAN bus. Inspect ABS module connector for corrosion.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'U0140', type: 'U', system: 'network', description: 'Lost Communication with BCM', severity: 'high',
      possibleCause: 'CAN bus fault, BCM failure, blown fuse, water damage',
      recommendedAction: 'Check BCM fuse. Inspect for water intrusion in BCM area.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'U0141', type: 'U', system: 'network', description: 'Lost Communication with Front Body Control Module', severity: 'medium',
      possibleCause: 'CAN bus, module failure, connector',
      recommendedAction: 'Check CAN wiring and module connector.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['pacifica'], yearRange: [2017, 2025] },
    { code: 'U0155', type: 'U', system: 'network', description: 'Lost Communication with Instrument Cluster', severity: 'medium',
      possibleCause: 'CAN bus, cluster failure, connector issue',
      recommendedAction: 'Check CAN wiring to instrument cluster.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'U0401', type: 'U', system: 'network', description: 'Invalid Data Received from ECM/PCM', severity: 'medium',
      possibleCause: 'CAN bus interference, ECM software issue, intermittent wiring',
      recommendedAction: 'Check CAN bus for noise. May need PCM reflash.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
    { code: 'U1424', type: 'U', system: 'network', description: 'Implausible Data Received from IPC', severity: 'low',
      possibleCause: 'Instrument cluster glitch, CAN noise',
      recommendedAction: 'Clear and monitor. Usually transient.',
      relatedDIDs: [], relatedSensors: [],
      affectsModels: ['both'], yearRange: [2010, 2025] },
  ],

  // ═══════════════════════════════════════
  // 5. AI / REVERSE ENGINEERING PLACEHOLDERS
  // ═══════════════════════════════════════
  aiPlaceholders: [
    { did: 0xF190, name: 'VIN (Vehicle Identification Number)', bytes: 17, discoveredType: 'ascii', scaling: null, variance: 0, correlationHints: [], confidence: 1.0, lastSeen: null, notes: 'Standard VIN. Static.' },
    { did: 0xF191, name: 'ECU Hardware Number', bytes: 11, discoveredType: 'ascii', scaling: null, variance: 0, correlationHints: [], confidence: 0.95, lastSeen: null, notes: 'PCM part number.' },
    { did: 0xF193, name: 'ECU Software Version', bytes: 4, discoveredType: 'ascii', scaling: null, variance: 0, correlationHints: [], confidence: 0.9, lastSeen: null, notes: 'Firmware version.' },
    { did: 0xF100, name: 'Unknown Config Block 1', bytes: 8, discoveredType: null, scaling: null, variance: null, correlationHints: ['may contain feature flags'], confidence: 0, lastSeen: null, notes: 'Discovered during scan. Needs analysis.' },
    { did: 0xF101, name: 'Unknown Config Block 2', bytes: 4, discoveredType: null, scaling: null, variance: null, correlationHints: [], confidence: 0, lastSeen: null, notes: 'Discovered during scan.' },
    { did: 0xF450, name: 'Unknown Live Sensor A', bytes: 2, discoveredType: null, scaling: null, variance: null, correlationHints: ['possible pressure or temp'], confidence: 0, lastSeen: null, notes: 'High variance observed. Likely live value.' },
    { did: 0xF451, name: 'Unknown Live Sensor B', bytes: 2, discoveredType: null, scaling: null, variance: null, correlationHints: ['correlates with RPM'], confidence: 0, lastSeen: null, notes: 'Changes with engine running.' },
    { did: 0xF452, name: 'Unknown Live Sensor C', bytes: 1, discoveredType: null, scaling: null, variance: null, correlationHints: ['possible boolean or enum'], confidence: 0, lastSeen: null, notes: 'Low variance, few distinct values.' },
    { did: 0x2110, name: 'Unknown Body Module Data', bytes: 4, discoveredType: null, scaling: null, variance: null, correlationHints: [], confidence: 0, lastSeen: null, notes: 'Found on BCM scan.' },
    { did: 0x2111, name: 'Unknown Body Module Data 2', bytes: 2, discoveredType: null, scaling: null, variance: null, correlationHints: [], confidence: 0, lastSeen: null, notes: 'Found on BCM scan.' },
  ],
};

// ═══════════════════════════════════════
// Helper functions for app integration
// ═══════════════════════════════════════

export function getCodingDID(did: number): CodingDIDEntry | undefined {
  return CHRYSLER_DATABASE.codingDIDs.find(d => d.did === did);
}

export function getLiveSensor(did: number): LiveSensorDID | undefined {
  return CHRYSLER_DATABASE.liveSensors.find(d => d.did === did);
}

export function getDTCInfo(code: string): DTCEntry | undefined {
  return CHRYSLER_DATABASE.dtcCodes.find(d => d.code === code);
}

export function getDTCsBySystem(system: DTCEntry['system']): DTCEntry[] {
  return CHRYSLER_DATABASE.dtcCodes.filter(d => d.system === system);
}

export function getDTCsByModel(model: 'tc' | 'pacifica'): DTCEntry[] {
  return CHRYSLER_DATABASE.dtcCodes.filter(d => d.affectsModels.includes(model) || d.affectsModels.includes('both' as any));
}

export function getSafeCodingDIDs(): CodingDIDEntry[] {
  return CHRYSLER_DATABASE.codingDIDs.filter(d => d.writeSafe && !d.restrictedOnPacifica);
}

export function getCriticalDTCs(): DTCEntry[] {
  return CHRYSLER_DATABASE.dtcCodes.filter(d => d.severity === 'critical' || d.severity === 'high');
}

export function decodeLiveSensorValue(did: number, rawBytes: number[]): number | null {
  const sensor = getLiveSensor(did);
  if (!sensor) return null;
  let raw = 0;
  if (sensor.bytes === 1 && rawBytes.length >= 1) {
    raw = rawBytes[0];
  } else if (sensor.bytes === 2 && rawBytes.length >= 2) {
    raw = (rawBytes[0] << 8) | rawBytes[1];
  }
  return raw * sensor.scaling + sensor.offset;
}

export function getAIPlaceholder(did: number): AIPlaceholderDID | undefined {
  return CHRYSLER_DATABASE.aiPlaceholders.find(d => d.did === did);
}

export function addDiscoveredDID(did: number, name: string, bytes: number): AIPlaceholderDID {
  const entry: AIPlaceholderDID = {
    did, name, bytes,
    discoveredType: null, scaling: null, variance: null,
    correlationHints: [], confidence: 0, lastSeen: Date.now(),
    notes: 'Dynamically discovered during live session',
  };
  CHRYSLER_DATABASE.aiPlaceholders.push(entry);
  return entry;
}
