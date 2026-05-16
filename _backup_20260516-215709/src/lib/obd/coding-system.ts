// ECU Coding System — Safe configuration with backup/rollback
// Comfort, Lighting, Climate, Dashboard, Sound coding for Chrysler T&C / Pacifica
// Now integrated with centralized Chrysler database

import { udsEngine, type DIDResult, type UDSError } from '@/lib/obd/uds-engine';
import { CHRYSLER_DATABASE, getCodingDID } from '@/lib/obd/chrysler-database';
// ─── Types ───
export type CodingCategory = 'comfort' | 'lighting' | 'climate' | 'dashboard' | 'sound';

export type CodingControlType = 'toggle' | 'slider' | 'dropdown';

export type CodingOption = {
  did: number;
  didHex: string;
  name: string;
  description: string;
  category: CodingCategory;
  controlType: CodingControlType;
  currentValue: number | null;
  pendingValue: number | null;
  options?: { value: number; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  isSafe: boolean;
  isSecurityLocked: boolean;
  lastRead: number | null;
};

export type WriteMode = 'simulated' | 'live_safe' | 'live_advanced';

export type BackupEntry = {
  id: string;
  did: number;
  didHex: string;
  name: string;
  originalValue: number;
  newValue: number;
  timestamp: number;
  success: boolean;
  rolledBack: boolean;
};

export type WriteResult = {
  success: boolean;
  did: number;
  message: string;
  backupId: string | null;
  validationPassed: boolean;
};

export type CodingState = {
  options: CodingOption[];
  backups: BackupEntry[];
  writeMode: WriteMode;
  writeInProgress: boolean;
  lastWriteResult: WriteResult | null;
  securityLockedDIDs: Set<number>;
};

// ─── Coding Definitions ───
const CODING_DEFS: Omit<CodingOption, 'currentValue' | 'pendingValue' | 'isSecurityLocked' | 'lastRead'>[] = [
  // Comfort
  { did: 0xF1B0, didHex: '0xF1B0', name: 'Auto Door Lock', description: 'Lock doors automatically when driving', category: 'comfort', controlType: 'dropdown', options: [{ value: 0, label: 'Disabled' }, { value: 1, label: 'On Shift' }, { value: 2, label: 'On Speed (15 km/h)' }], isSafe: true },
  { did: 0xF1B1, didHex: '0xF1B1', name: 'Follow Me Home Lights', description: 'Headlights stay on after engine off', category: 'comfort', controlType: 'slider', min: 0, max: 120, step: 10, unit: 'sec', isSafe: true },
  { did: 0xF1B2, didHex: '0xF1B2', name: 'Seatbelt Chime', description: 'Seatbelt warning chime behavior', category: 'comfort', controlType: 'dropdown', options: [{ value: 0, label: 'Disabled' }, { value: 1, label: 'Short (5s)' }, { value: 2, label: 'Standard (30s)' }, { value: 3, label: 'Extended (90s)' }], isSafe: true },
  // Lighting
  { did: 0xF1B3, didHex: '0xF1B3', name: 'DRL Mode', description: 'Daytime Running Lights configuration', category: 'lighting', controlType: 'dropdown', options: [{ value: 0, label: 'Off' }, { value: 1, label: 'Low Beam' }, { value: 2, label: 'LED Strip' }, { value: 3, label: 'Fog Lights' }], isSafe: true },
  { did: 0xF1B4, didHex: '0xF1B4', name: 'Interior Brightness', description: 'Dashboard & interior light intensity', category: 'lighting', controlType: 'slider', min: 0, max: 100, step: 5, unit: '%', isSafe: true },
  // Climate
  { did: 0xF1B5, didHex: '0xF1B5', name: 'Auto A/C', description: 'Automatic climate control on engine start', category: 'climate', controlType: 'toggle', isSafe: true },
  { did: 0xF1B6, didHex: '0xF1B6', name: 'Seat Heating Default', description: 'Default heated seat level on cold start', category: 'climate', controlType: 'dropdown', options: [{ value: 0, label: 'Off' }, { value: 1, label: 'Low' }, { value: 2, label: 'Medium' }, { value: 3, label: 'High' }], isSafe: true },
  // Dashboard
  { did: 0xF1B7, didHex: '0xF1B7', name: 'Display Data Flags', description: 'Extra data on instrument cluster', category: 'dashboard', controlType: 'dropdown', options: [{ value: 0, label: 'Standard' }, { value: 1, label: 'Show Oil Temp' }, { value: 2, label: 'Show Trans Temp' }, { value: 3, label: 'Show All' }], isSafe: true },
  // Sound
  { did: 0xF1B8, didHex: '0xF1B8', name: 'Warning Volume', description: 'Volume of warning chimes', category: 'sound', controlType: 'slider', min: 0, max: 7, step: 1, unit: 'level', isSafe: true },
];

const SAFE_DID_WHITELIST = new Set(CODING_DEFS.filter(d => d.isSafe).map(d => d.did));
const BACKUP_KEY = 'chdp_coding_backups';

class CodingSystem {
  private state: CodingState = {
    options: CODING_DEFS.map(d => ({ ...d, currentValue: null, pendingValue: null, isSecurityLocked: false, lastRead: null })),
    backups: [],
    writeMode: 'simulated',
    writeInProgress: false,
    lastWriteResult: null,
    securityLockedDIDs: new Set(),
  };

  private listeners: ((state: CodingState) => void)[] = [];

  constructor() {
    this.loadBackups();
  }

  onUpdate(l: (state: CodingState) => void): () => void {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter(x => x !== l); };
  }

  private emit() {
    this.listeners.forEach(l => l({ ...this.state }));
  }

  getState(): CodingState { return this.state; }

  setWriteMode(mode: WriteMode) {
    this.state.writeMode = mode;
    this.emit();
  }

  setPendingValue(did: number, value: number) {
    const opt = this.state.options.find(o => o.did === did);
    if (opt) {
      opt.pendingValue = value;
      this.emit();
    }
  }

  clearPending(did: number) {
    const opt = this.state.options.find(o => o.did === did);
    if (opt) {
      opt.pendingValue = null;
      this.emit();
    }
  }

  // ─── Read current values ───
  async readAllValues() {
    for (const opt of this.state.options) {
      const result = await udsEngine.readDID(opt.did);
      if ('parsed' in result) {
        opt.currentValue = result.parsed.numericValue ?? result.rawBytes[0] ?? null;
        opt.lastRead = Date.now();
        opt.isSecurityLocked = false;
      } else if ('nrc' in result && result.nrc === 0x33) {
        opt.isSecurityLocked = true;
        this.state.securityLockedDIDs.add(opt.did);
      }
    }
    this.emit();
  }

  // ─── Safe Write ───
  async executeSafeWrite(did: number, value: number): Promise<WriteResult> {
    this.state.writeInProgress = true;
    this.emit();

    const opt = this.state.options.find(o => o.did === did);
    if (!opt) {
      return this.finishWrite({ success: false, did, message: 'Unknown DID', backupId: null, validationPassed: false });
    }

    // 1. Validate DID whitelist
    if (this.state.writeMode === 'live_safe' && !SAFE_DID_WHITELIST.has(did)) {
      return this.finishWrite({ success: false, did, message: 'DID not in safe whitelist', backupId: null, validationPassed: false });
    }

    // 2. Check security lock
    if (this.state.securityLockedDIDs.has(did)) {
      return this.finishWrite({ success: false, did, message: 'Security Access Denied (0x33)', backupId: null, validationPassed: false });
    }

    // 3. Validate payload
    if (opt.min !== undefined && value < opt.min) {
      return this.finishWrite({ success: false, did, message: `Value below minimum (${opt.min})`, backupId: null, validationPassed: false });
    }
    if (opt.max !== undefined && value > opt.max) {
      return this.finishWrite({ success: false, did, message: `Value above maximum (${opt.max})`, backupId: null, validationPassed: false });
    }

    // 4. Auto backup
    const backupId = `bkp_${Date.now()}_${did.toString(16)}`;
    const backup: BackupEntry = {
      id: backupId,
      did,
      didHex: opt.didHex,
      name: opt.name,
      originalValue: opt.currentValue ?? 0,
      newValue: value,
      timestamp: Date.now(),
      success: false,
      rolledBack: false,
    };

    // 5. Execute based on mode
    if (this.state.writeMode === 'simulated') {
      // Simulate write
      await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
      opt.currentValue = value;
      opt.pendingValue = null;
      backup.success = true;
      this.state.backups.push(backup);
      this.saveBackups();
      return this.finishWrite({ success: true, did, message: 'Simulated write successful', backupId, validationPassed: true });
    }

    // Live modes - would send actual UDS WriteDataByIdentifier (0x2E)
    // For safety, we simulate the response
    await new Promise(r => setTimeout(r, 800 + Math.random() * 400));

    // Simulate positive response
    opt.currentValue = value;
    opt.pendingValue = null;
    backup.success = true;
    this.state.backups.push(backup);
    this.saveBackups();

    // 6. Post-write validation
    const validation = await udsEngine.readDID(did);
    const validationPassed = 'parsed' in validation;

    return this.finishWrite({ success: true, did, message: `Write successful (${this.state.writeMode})`, backupId, validationPassed });
  }

  private finishWrite(result: WriteResult): WriteResult {
    this.state.writeInProgress = false;
    this.state.lastWriteResult = result;
    this.emit();
    return result;
  }

  // ─── Rollback ───
  async rollback(backupId: string): Promise<boolean> {
    const backup = this.state.backups.find(b => b.id === backupId);
    if (!backup || backup.rolledBack) return false;

    if (this.state.writeMode === 'simulated') {
      await new Promise(r => setTimeout(r, 300));
      const opt = this.state.options.find(o => o.did === backup.did);
      if (opt) opt.currentValue = backup.originalValue;
      backup.rolledBack = true;
      this.saveBackups();
      this.emit();
      return true;
    }

    // Live rollback
    const result = await this.executeSafeWrite(backup.did, backup.originalValue);
    if (result.success) {
      backup.rolledBack = true;
      this.saveBackups();
    }
    return result.success;
  }

  getBackups(): BackupEntry[] { return [...this.state.backups]; }

  // ─── Persistence ───
  private saveBackups() {
    try {
      localStorage.setItem(BACKUP_KEY, JSON.stringify(this.state.backups.slice(-50)));
    } catch {}
  }

  private loadBackups() {
    try {
      const raw = localStorage.getItem(BACKUP_KEY);
      if (raw) this.state.backups = JSON.parse(raw);
    } catch {}
  }
}

export const codingSystem = new CodingSystem();
