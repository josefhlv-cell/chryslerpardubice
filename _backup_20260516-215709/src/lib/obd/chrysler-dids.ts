// Chrysler-specific DID Database
// ISO 14229 Data Identifier definitions for Town & Country / Pacifica

export type DIDDataType = 'ascii' | 'uint8' | 'uint16' | 'uint32' | 'int8' | 'int16' | 'float_scaled' | 'bitfield' | 'hex' | 'bcd';

export type DIDScaling = {
  factor: number;
  offset: number;
  unit: string;
  min?: number;
  max?: number;
};

export type BitfieldDef = {
  bit: number;
  length: number;
  name: string;
  values?: Record<number, string>;
};

export type DIDDefinition = {
  did: number;
  name: string;
  shortName: string;
  category: 'identification' | 'software' | 'hardware' | 'sensor' | 'config' | 'extended' | 'dtc';
  dataType: DIDDataType;
  length?: number; // expected byte length
  scaling?: DIDScaling;
  bitfields?: BitfieldDef[];
  description?: string;
};

// ─── Scan Ranges ───
export const DID_SCAN_RANGES: { label: string; start: number; end: number }[] = [
  { label: 'Identification (F100–F1FF)', start: 0xF100, end: 0xF1FF },
  { label: 'Calibration (F400–F4FF)', start: 0xF400, end: 0xF4FF },
  { label: 'Extended Data (2100–21FF)', start: 0x2100, end: 0x21FF },
];

// ─── Chrysler DID Database ───
export const CHRYSLER_DIDS: Record<number, DIDDefinition> = {
  // === Identification Block (F1xx) ===
  0xF100: {
    did: 0xF100, name: 'Boot Software ID', shortName: 'BOOT_SW',
    category: 'software', dataType: 'ascii', length: 16,
    description: 'ECU boot software identification',
  },
  0xF101: {
    did: 0xF101, name: 'Boot Software Fingerprint', shortName: 'BOOT_FP',
    category: 'software', dataType: 'hex', length: 10,
  },
  0xF110: {
    did: 0xF110, name: 'ECU Serial Number', shortName: 'ECU_SN',
    category: 'identification', dataType: 'ascii', length: 20,
  },
  0xF111: {
    did: 0xF111, name: 'ECU Manufacturing Date', shortName: 'MFG_DATE',
    category: 'identification', dataType: 'bcd', length: 4,
    description: 'BCD encoded: YYYYMMDD',
  },
  0xF112: {
    did: 0xF112, name: 'ECU Hardware Number', shortName: 'HW_NUM',
    category: 'hardware', dataType: 'ascii', length: 12,
  },
  0xF113: {
    did: 0xF113, name: 'ECU Hardware Version', shortName: 'HW_VER',
    category: 'hardware', dataType: 'ascii', length: 4,
  },
  0xF120: {
    did: 0xF120, name: 'Supplier ID', shortName: 'SUPP_ID',
    category: 'identification', dataType: 'ascii', length: 10,
  },
  0xF180: {
    did: 0xF180, name: 'Boot Software ID (Alt)', shortName: 'BOOT_SW2',
    category: 'software', dataType: 'ascii', length: 16,
  },
  0xF186: {
    did: 0xF186, name: 'Active Diagnostic Session', shortName: 'DIAG_SESS',
    category: 'config', dataType: 'uint8', length: 1,
    description: '01=Default, 03=Extended, 02=Programming',
  },
  0xF187: {
    did: 0xF187, name: 'Spare Part Number', shortName: 'SPARE_PN',
    category: 'identification', dataType: 'ascii', length: 14,
  },
  0xF188: {
    did: 0xF188, name: 'Application SW ID', shortName: 'APP_SW',
    category: 'software', dataType: 'ascii', length: 16,
    description: 'Main application software version',
  },
  0xF189: {
    did: 0xF189, name: 'Application SW Fingerprint', shortName: 'APP_FP',
    category: 'software', dataType: 'hex', length: 10,
  },
  0xF18A: {
    did: 0xF18A, name: 'System Supplier ID', shortName: 'SYS_SUPP',
    category: 'identification', dataType: 'ascii', length: 10,
  },
  0xF18B: {
    did: 0xF18B, name: 'ECU Manufacturing Date (ISO)', shortName: 'MFG_ISO',
    category: 'identification', dataType: 'ascii', length: 10,
  },
  0xF18C: {
    did: 0xF18C, name: 'ECU Serial Number (ISO)', shortName: 'SN_ISO',
    category: 'identification', dataType: 'ascii', length: 16,
  },
  0xF190: {
    did: 0xF190, name: 'Vehicle Identification Number', shortName: 'VIN',
    category: 'identification', dataType: 'ascii', length: 17,
    description: 'ISO 3779 VIN — 17 characters',
  },
  0xF191: {
    did: 0xF191, name: 'Vehicle Manufacturer HW Number', shortName: 'VM_HW',
    category: 'hardware', dataType: 'ascii', length: 12,
  },
  0xF192: {
    did: 0xF192, name: 'System Supplier HW Number', shortName: 'SS_HW',
    category: 'hardware', dataType: 'ascii', length: 12,
  },
  0xF193: {
    did: 0xF193, name: 'System Supplier HW Version', shortName: 'SS_HW_V',
    category: 'hardware', dataType: 'ascii', length: 4,
  },
  0xF194: {
    did: 0xF194, name: 'System Supplier SW Number', shortName: 'SS_SW',
    category: 'software', dataType: 'ascii', length: 16,
  },
  0xF195: {
    did: 0xF195, name: 'System Supplier SW Version', shortName: 'SS_SW_V',
    category: 'software', dataType: 'ascii', length: 4,
  },
  0xF197: {
    did: 0xF197, name: 'System Name', shortName: 'SYS_NAME',
    category: 'identification', dataType: 'ascii', length: 20,
  },
  0xF198: {
    did: 0xF198, name: 'Repair Shop Code', shortName: 'SHOP',
    category: 'identification', dataType: 'hex', length: 6,
  },
  0xF199: {
    did: 0xF199, name: 'Programming Date', shortName: 'PROG_DATE',
    category: 'identification', dataType: 'bcd', length: 4,
  },
  0xF19E: {
    did: 0xF19E, name: 'Application Data ID', shortName: 'APP_DATA',
    category: 'software', dataType: 'ascii', length: 16,
  },

  // === Calibration Block (F4xx) — Chrysler sensor data ===
  0xF420: {
    did: 0xF420, name: 'Engine Coolant Temp (Raw)', shortName: 'ECT_RAW',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.1, offset: -40, unit: '°C', min: -40, max: 215 },
  },
  0xF421: {
    did: 0xF421, name: 'Intake Air Temp (Raw)', shortName: 'IAT_RAW',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.1, offset: -40, unit: '°C', min: -40, max: 215 },
  },
  0xF422: {
    did: 0xF422, name: 'MAP Sensor', shortName: 'MAP',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.1, offset: 0, unit: 'kPa', min: 0, max: 300 },
  },
  0xF423: {
    did: 0xF423, name: 'Barometric Pressure', shortName: 'BARO',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.1, offset: 0, unit: 'kPa', min: 0, max: 120 },
  },
  0xF424: {
    did: 0xF424, name: 'Throttle Position Sensor', shortName: 'TPS',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.01, offset: 0, unit: '%', min: 0, max: 100 },
  },
  0xF425: {
    did: 0xF425, name: 'Battery Voltage (Sensor)', shortName: 'BATT_S',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.001, offset: 0, unit: 'V', min: 0, max: 20 },
  },
  0xF426: {
    did: 0xF426, name: 'Engine Speed (Sensor)', shortName: 'RPM_S',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.25, offset: 0, unit: 'rpm', min: 0, max: 8000 },
  },
  0xF427: {
    did: 0xF427, name: 'Vehicle Speed (Sensor)', shortName: 'VSS_S',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.01, offset: 0, unit: 'km/h', min: 0, max: 300 },
  },
  0xF428: {
    did: 0xF428, name: 'Fuel Rail Pressure', shortName: 'FRP',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.1, offset: 0, unit: 'kPa', min: 0, max: 1000 },
  },
  0xF429: {
    did: 0xF429, name: 'O2 Sensor B1S1 Voltage', shortName: 'O2_B1S1',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.001, offset: 0, unit: 'V', min: 0, max: 5 },
  },
  0xF42A: {
    did: 0xF42A, name: 'O2 Sensor B1S2 Voltage', shortName: 'O2_B1S2',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.001, offset: 0, unit: 'V', min: 0, max: 5 },
  },
  0xF42B: {
    did: 0xF42B, name: 'Trans Fluid Temp', shortName: 'TFT',
    category: 'sensor', dataType: 'int16', length: 2,
    scaling: { factor: 0.1, offset: 0, unit: '°C', min: -40, max: 200 },
  },
  0xF42C: {
    did: 0xF42C, name: 'A/C High Side Pressure', shortName: 'AC_HP',
    category: 'sensor', dataType: 'uint16', length: 2,
    scaling: { factor: 0.1, offset: 0, unit: 'kPa', min: 0, max: 3500 },
  },
  0xF42D: {
    did: 0xF42D, name: 'Steering Angle', shortName: 'SAS',
    category: 'sensor', dataType: 'int16', length: 2,
    scaling: { factor: 0.1, offset: 0, unit: '°', min: -780, max: 780 },
  },
  0xF42E: {
    did: 0xF42E, name: 'Fuel Level', shortName: 'FUEL_LVL',
    category: 'sensor', dataType: 'uint8', length: 1,
    scaling: { factor: 0.392, offset: 0, unit: '%', min: 0, max: 100 },
  },

  // === Extended Data Blocks (21xx) — Chrysler proprietary ===
  0x2101: {
    did: 0x2101, name: 'Engine Data Block 1', shortName: 'ENG_BLK1',
    category: 'extended', dataType: 'hex', length: 32,
    description: 'Multi-value engine data: RPM, load, timing, fuel trims',
  },
  0x2102: {
    did: 0x2102, name: 'Engine Data Block 2', shortName: 'ENG_BLK2',
    category: 'extended', dataType: 'hex', length: 32,
    description: 'Coolant, IAT, MAP, fuel pressure, injector pulse',
  },
  0x2103: {
    did: 0x2103, name: 'Transmission Data Block', shortName: 'TRANS_BLK',
    category: 'extended', dataType: 'hex', length: 24,
    description: 'Gear, TCC, line pressure, fluid temp, turbine speed',
  },
  0x2104: {
    did: 0x2104, name: 'Emissions Data Block', shortName: 'EMIS_BLK',
    category: 'extended', dataType: 'hex', length: 28,
    description: 'Cat temps, O2 sensors, EVAP data',
  },
  0x2105: {
    did: 0x2105, name: 'Body Control Data Block', shortName: 'BCM_BLK',
    category: 'extended', dataType: 'hex', length: 20,
    description: 'Door states, lamps, HVAC, windows',
    bitfields: [
      { bit: 0, length: 1, name: 'Driver Door', values: { 0: 'Closed', 1: 'Open' } },
      { bit: 1, length: 1, name: 'Passenger Door', values: { 0: 'Closed', 1: 'Open' } },
      { bit: 2, length: 1, name: 'Rear Left Door', values: { 0: 'Closed', 1: 'Open' } },
      { bit: 3, length: 1, name: 'Rear Right Door', values: { 0: 'Closed', 1: 'Open' } },
      { bit: 4, length: 1, name: 'Trunk/Liftgate', values: { 0: 'Closed', 1: 'Open' } },
      { bit: 5, length: 1, name: 'Hood', values: { 0: 'Closed', 1: 'Open' } },
      { bit: 8, length: 1, name: 'Headlights', values: { 0: 'Off', 1: 'On' } },
      { bit: 9, length: 1, name: 'High Beams', values: { 0: 'Off', 1: 'On' } },
      { bit: 10, length: 1, name: 'Fog Lamps', values: { 0: 'Off', 1: 'On' } },
    ],
  },
  0x2106: {
    did: 0x2106, name: 'ABS/Stability Data Block', shortName: 'ABS_BLK',
    category: 'extended', dataType: 'hex', length: 16,
    description: 'Wheel speeds, brake pressure, stability flags',
  },
  0x2107: {
    did: 0x2107, name: 'HVAC Data Block', shortName: 'HVAC_BLK',
    category: 'extended', dataType: 'hex', length: 12,
    description: 'Blower speed, temps, mode, A/C clutch',
  },
  0x2108: {
    did: 0x2108, name: 'Instrument Cluster Data', shortName: 'IC_BLK',
    category: 'extended', dataType: 'hex', length: 16,
    description: 'Odometer, trip, fuel consumption, warnings',
  },
  0x2109: {
    did: 0x2109, name: 'Power Steering Data', shortName: 'EPS_BLK',
    category: 'extended', dataType: 'hex', length: 8,
    description: 'Steering torque, assist current, angle',
  },
  0x210A: {
    did: 0x210A, name: 'Tire Pressure Data', shortName: 'TPMS_BLK',
    category: 'extended', dataType: 'hex', length: 16,
    description: 'Individual tire pressures and temps',
  },
  0x210B: {
    did: 0x210B, name: 'Electrical System Data', shortName: 'ELEC_BLK',
    category: 'extended', dataType: 'hex', length: 12,
    description: 'Alternator output, battery state, parasitic draw',
  },
};

// Get DID definition, return generic if unknown
export function getDIDDef(did: number): DIDDefinition {
  if (CHRYSLER_DIDS[did]) return CHRYSLER_DIDS[did];
  return {
    did,
    name: `Unknown DID 0x${did.toString(16).toUpperCase().padStart(4, '0')}`,
    shortName: `0x${did.toString(16).toUpperCase().padStart(4, '0')}`,
    category: 'identification',
    dataType: 'hex',
  };
}

// Simulated responses for known DIDs (web preview)
export const SIMULATED_DID_RESPONSES: Record<number, number[]> = {
  0xF190: Array.from('2C4RC1BG9LR123456').map(c => c.charCodeAt(0)), // VIN
  0xF188: Array.from('APP_SW_V03.02.01').map(c => c.charCodeAt(0)),
  0xF186: [0x01], // Default session
  0xF100: Array.from('BOOT_V01.00.00  ').map(c => c.charCodeAt(0)),
  0xF112: Array.from('68238712AA  ').map(c => c.charCodeAt(0)),
  0xF113: Array.from('v2.1').map(c => c.charCodeAt(0)),
  0xF197: Array.from('PCM - 3.6L Pentastar').map(c => c.charCodeAt(0)),
  0xF420: [0x03, 0x48], // 84.0°C coolant
  0xF421: [0x01, 0xC2], // 45.0°C intake
  0xF422: [0x03, 0xE8], // 100.0 kPa MAP
  0xF424: [0x06, 0x2C], // 15.88% throttle
  0xF425: [0x31, 0x08], // 12.552V
  0xF426: [0x0B, 0xB8], // 750 rpm
  0xF427: [0x00, 0x00], // 0 km/h
  0xF42E: [0x99],       // 38.8% fuel
  0x2101: Array(32).fill(0).map((_, i) => (i * 7 + 0x10) & 0xFF),
  0x2105: [0x05, 0x00, ...Array(18).fill(0)], // Driver door open + passenger
  // Coding DIDs (F1B0–F1B8) — simulated current values
  0xF1B0: [0x01], // Auto door lock: On Shift
  0xF1B1: [0x1E], // Follow me home: 30 sec
  0xF1B2: [0x02], // Seatbelt chime: Standard
  0xF1B3: [0x01], // DRL mode: Low Beam
  0xF1B4: [0x50], // Interior brightness: 80 (out of 100)
  0xF1B5: [0x01], // Auto AC: On
  0xF1B6: [0x01], // Seat heating default: Low
  0xF1B7: [0x00], // Display data flags: Standard
  0xF1B8: [0x04], // Warning volume: 4
};
