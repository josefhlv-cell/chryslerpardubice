// BLE Manager for OBD2 adapter communication
// Supports Vgate / IOS-Vlink / ELM327 BLE adapters
// Uses @capacitor-community/bluetooth-le on native, simulates on web

import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
import { logObdDebugEvent, resetObdDebugThrottle } from '@/lib/obd/debug/obd-debug-logger';

export type BLEDeviceInfo = {
  deviceId: string;
  name: string;
  rssi: number;
  connected: boolean;
};

export type BLEConnectionState =
  | 'disconnected'
  | 'scanning'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

export type BLEEvent = {
  type: 'stateChange' | 'deviceFound' | 'data' | 'error' | 'reconnecting' | 'debug';
  payload: any;
};

type BLEListener = (event: BLEEvent) => void;

type OBDProfile = {
  name: string;
  serviceUuid: string;
  notifyUuid: string;
  writeUuid: string;
};

const OBD_PROFILES: OBDProfile[] = [
  {
    name: 'FFF0 / FFF1 notify / FFF2 write',
    serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    notifyUuid: '0000fff1-0000-1000-8000-00805f9b34fb',
    writeUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'FFF0 / FFF2 notify / FFF1 write',
    serviceUuid: '0000fff0-0000-1000-8000-00805f9b34fb',
    notifyUuid: '0000fff2-0000-1000-8000-00805f9b34fb',
    writeUuid: '0000fff1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'FFE0 / FFE1 single characteristic',
    serviceUuid: '0000ffe0-0000-1000-8000-00805f9b34fb',
    notifyUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
    writeUuid: '0000ffe1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'iOS-VLink 18F0',
    serviceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    notifyUuid: '00002af0-0000-1000-8000-00805f9b34fb',
    writeUuid: '00002af1-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'iOS-VLink 18F0 swapped',
    serviceUuid: '000018f0-0000-1000-8000-00805f9b34fb',
    notifyUuid: '00002af1-0000-1000-8000-00805f9b34fb',
    writeUuid: '00002af0-0000-1000-8000-00805f9b34fb',
  },
  {
    name: 'VLink custom',
    serviceUuid: 'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
    notifyUuid: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
    writeUuid: 'bef8d6c9-9c21-4c9e-b632-bd58c1009f9f',
  },
  {
    name: 'Nordic UART',
    serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    notifyUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
    writeUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  },
];

const OBD_NAME_HINTS = [
  'obd',
  'elm',
  'icar',
  'vgate',
  'vlink',
  'ios-vlink',
  'car',
  'diagnostic',
];

const MAX_RECONNECT_ATTEMPTS = 3;
const RECONNECT_DELAY_MS = 2000;

class BLEManager {
  private state: BLEConnectionState = 'disconnected';
  private listeners: BLEListener[] = [];
  private connectedDevice: BLEDeviceInfo | null = null;
  private responseBuffer = '';
  private isNative = false;
  private bleInitialized = false;
  private autoReconnect = true;
  private reconnectAttempts = 0;
  private lastDeviceId: string | null = null;
  private activeProfile: OBDProfile | null = null;

  constructor() {
    this.isNative =
      typeof (window as any).Capacitor !== 'undefined' &&
      (window as any).Capacitor.isNativePlatform?.();
  }

  getState(): BLEConnectionState {
    return this.state;
  }

  getConnectedDevice(): BLEDeviceInfo | null {
    return this.connectedDevice;
  }

  setAutoReconnect(enabled: boolean) {
    this.autoReconnect = enabled;
  }

  subscribe(listener: BLEListener): () => void {
    this.listeners.push(listener);

    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private emit(event: BLEEvent) {
    this.listeners.forEach(l => l(event));
  }

  private safeStringify(value: any): string {
    try {
      if (value instanceof Error) return value.message;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }

  private debug(message: string, data?: any) {
    const text = data === undefined ? message : `${message} ${this.safeStringify(data)}`;
    console.log(text);
    this.emit({ type: 'debug', payload: text });
  }

  private warn(message: string, data?: any) {
    const text = data === undefined ? message : `${message} ${this.safeStringify(data)}`;
    console.warn(text);
    this.emit({ type: 'debug', payload: text });
  }

  private setState(state: BLEConnectionState) {
    this.state = state;
    this.emit({ type: 'stateChange', payload: state });
    this.debug('[BLE] STATE', state);
  }

  private async ensureInitialized(): Promise<void> {
    if (this.bleInitialized) return;

    if (this.isNative) {
      this.debug('[BLE] INITIALIZE');
      await BleClient.initialize({ androidNeverForLocation: true });
      this.bleInitialized = true;
      this.debug('[BLE] INITIALIZED');
    }
  }

  private isLikelyOBDName(name: string): boolean {
    const lower = name.toLowerCase();
    return OBD_NAME_HINTS.some(hint => lower.includes(hint));
  }

  private scoreDevice(device: BLEDeviceInfo): number {
    let score = device.rssi || -100;

    if (this.isLikelyOBDName(device.name)) {
      score += 1000;
    }

    return score;
  }

  async scan(duration = 10000): Promise<BLEDeviceInfo[]> {
    this.setState('scanning');

    const devices = new Map<string, BLEDeviceInfo>();

    if (!this.isNative) {
      await new Promise(r => setTimeout(r, 1500));

      const simDevices: BLEDeviceInfo[] = [
        {
          deviceId: 'ios-vlink-001',
          name: 'IOS-Vlink',
          rssi: -45,
          connected: false,
        },
        {
          deviceId: 'vgate-icar-pro-001',
          name: 'Vgate iCar Pro 4.0',
          rssi: -50,
          connected: false,
        },
        {
          deviceId: 'obd-generic-002',
          name: 'OBD-II Adapter',
          rssi: -72,
          connected: false,
        },
      ];

      simDevices.forEach(d => {
        devices.set(d.deviceId, d);
        this.emit({ type: 'deviceFound', payload: d });
        this.debug('[BLE] DEVICE FOUND', d);
      });

      this.setState('disconnected');
      return simDevices.sort((a, b) => this.scoreDevice(b) - this.scoreDevice(a));
    }

    try {
      await this.ensureInitialized();

      try {
        await BleClient.stopLEScan();
      } catch {}

      this.debug('[BLE] SCAN START');

      await BleClient.requestLEScan(
        {
          allowDuplicates: true,
        },
        (result: ScanResult) => {
          const dev = this.scanResultToDevice(result);
          const existing = devices.get(dev.deviceId);

          if (!existing || dev.rssi > existing.rssi) {
            devices.set(dev.deviceId, dev);
            this.emit({ type: 'deviceFound', payload: dev });
          }

          this.debug('[BLE] RAW SCAN', {
            name: dev.name,
            deviceId: dev.deviceId,
            rssi: dev.rssi,
            uuids: result.uuids,
          });
        }
      );

      await new Promise(r => setTimeout(r, duration));
    } catch (e) {
      this.warn('[BLE] SCAN ERROR', e);
      this.emit({ type: 'error', payload: e });
    } finally {
      try {
        await BleClient.stopLEScan();
      } catch {}

      this.debug('[BLE] SCAN END', {
        count: devices.size,
      });

      this.setState('disconnected');
    }

    return Array.from(devices.values()).sort(
      (a, b) => this.scoreDevice(b) - this.scoreDevice(a)
    );
  }

  private scanResultToDevice(result: ScanResult): BLEDeviceInfo {
    return {
      deviceId: result.device.deviceId,
      name: result.device.name || result.localName || 'Neznámé zařízení',
      rssi: result.rssi ?? -100,
      connected: false,
    };
  }

  async connect(deviceId: string): Promise<boolean> {
    this.setState('connecting');
    this.lastDeviceId = deviceId;
    localStorage.setItem("last_obd_device_id", deviceId);
    this.reconnectAttempts = 0;

    if (!this.isNative) {
      await new Promise(r => setTimeout(r, 1200));

      this.connectedDevice = {
        deviceId,
        name: 'IOS-Vlink',
        rssi: -45,
        connected: true,
      };

      this.setState('connected');
      return true;
    }

    return this.performConnect(deviceId);
  }

private async performConnect(deviceId: string): Promise<boolean> {
  try {
    await this.ensureInitialized();

    this.debug('[BLE] CONNECT START', deviceId);

    await BleClient.connect(deviceId, disconnectedId => {
      this.warn('[BLE] DISCONNECTED', disconnectedId);

      this.connectedDevice = null;
      this.activeProfile = null;
      this.setState('disconnected');
      this.tryAutoReconnect();
    });

    await new Promise(resolve => setTimeout(resolve, 800));

    this.debug('[BLE] CONNECT OK');

    try {
      const services = await BleClient.getServices(deviceId);
      this.debug('[BLE] SERVICES', services);
    } catch (serviceErr) {
      this.warn('[BLE] GET SERVICES WARNING', serviceErr);
    }

    const profile = await Promise.race([
      this.findWorkingProfile(deviceId),
      new Promise<null>(resolve => {
        setTimeout(() => resolve(null), 12000);
      }),
    ]);

    if (!profile) {
      throw new Error('Adaptér byl nalezen, ale neodpovídá jako ELM327 / OBD adaptér.');
    }

    this.activeProfile = profile;

    this.connectedDevice = {
      deviceId,
      name: 'OBD adaptér',
      rssi: -50,
      connected: true,
    };

    this.reconnectAttempts = 0;
    this.setState('connected');

    try {
      await this.initializeELM327();
    } catch (initError) {
      this.warn('[BLE] ELM327 INIT FAILED, KEEPING CONNECTION', initError);
    }

    return true;
  } catch (e) {
    this.warn('[BLE] CONNECT ERROR', e);

    try {
      await BleClient.disconnect(deviceId);
    } catch {}

    this.connectedDevice = null;
    this.activeProfile = null;
    this.setState('error');
    this.emit({ type: 'error', payload: e });

    return false;
  }
}


  async reconnectLastDevice(): Promise<boolean> {
  try {
    const devices = await BleClient.getConnectedDevices([]);

    if (!devices.length) {
      return false;
    }

    return await this.connect(devices[0].deviceId);
  } catch {
    return false;
  }
}

  private async findWorkingProfile(deviceId: string): Promise<OBDProfile | null> {
    for (const profile of OBD_PROFILES) {
      try {
        this.debug('[BLE] TRY PROFILE', profile.name);

        this.responseBuffer = '';

        await BleClient.startNotifications(
          deviceId,
          profile.serviceUuid,
          profile.notifyUuid,
          value => {
            const text = new TextDecoder().decode(value);
            this.responseBuffer += text;
            this.emit({ type: 'data', payload: text });
            this.debug('[BLE] RX', text);
          }
        );

        await new Promise(r => setTimeout(r, 250));

        const ok = await this.probeProfile(deviceId, profile);

        if (ok) {
          this.debug('[BLE] WORKING OBD PROFILE', profile.name);
          return profile;
        }

        this.warn('[BLE] PROFILE AT PROBE FAILED', profile.name);

        try {
          await BleClient.stopNotifications(
            deviceId,
            profile.serviceUuid,
            profile.notifyUuid
          );
        } catch {}
      } catch (err) {
        this.warn(`[BLE] PROFILE FAILED ${profile.name}`, err);

        try {
          await BleClient.stopNotifications(
            deviceId,
            profile.serviceUuid,
            profile.notifyUuid
          );
        } catch {}
      }
    }

    return null;
  }

  private async probeProfile(deviceId: string, profile: OBDProfile): Promise<boolean> {
    const commands = ['AT', 'ATI', 'ATZ'];

    for (const command of commands) {
      this.responseBuffer = '';

      try {
        this.debug('[BLE] TX PROBE', {
          profile: profile.name,
          command,
        });

        await this.writeToProfile(deviceId, profile, command);

        const response = await this.readResponse(1800).catch(() => '');
        const normalized = response.toUpperCase();

        this.debug('[BLE] PROBE RESPONSE', {
          profile: profile.name,
          command,
          response,
        });

        if (
          normalized.includes('OK') ||
          normalized.includes('ELM') ||
          normalized.includes('OBD') ||
          normalized.includes('VLINK') ||
          normalized.includes('IOS') ||
          normalized.includes('>') ||
          normalized.length > 0
        ) {
          this.debug('[BLE] AT PROBE OK', {
            profile: profile.name,
            response,
          });

          return true;
        }
      } catch (err) {
        this.warn(`[BLE] AT PROBE FAILED ${profile.name} ${command}`, err);
      }
    }

    return false;
  }

  private async writeToProfile(
    deviceId: string,
    profile: OBDProfile,
    data: string
  ): Promise<void> {
    const command = data.endsWith('\r') ? data : `${data}\r`;
    const encoded = new TextEncoder().encode(command);
    const dataView = new DataView(encoded.buffer);

    try {
      this.debug('[BLE] TX WRITE', {
        profile: profile.name,
        command: data,
        mode: 'write',
      });

      await BleClient.write(
        deviceId,
        profile.serviceUuid,
        profile.writeUuid,
        dataView
      );
    } catch (writeErr) {
      this.warn('[BLE] WRITE FAILED, TRYING WITHOUT RESPONSE', writeErr);

      this.debug('[BLE] TX WRITE', {
        profile: profile.name,
        command: data,
        mode: 'writeWithoutResponse',
      });

      await BleClient.writeWithoutResponse(
        deviceId,
        profile.serviceUuid,
        profile.writeUuid,
        dataView
      );
    }
  }

  private async initializeELM327(): Promise<void> {
    const commands = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'];

    for (const command of commands) {
      try {
        this.responseBuffer = '';
        this.debug('[BLE] INIT CMD', command);

        await this.write(command);

        const response = await this.readResponse(
          command === 'ATZ' || command === 'ATSP0' ? 3000 : 2000
        );

        this.debug('[BLE] INIT RESPONSE', {
          command,
          response,
        });
      } catch (err) {
        this.warn(`[BLE] OBD INIT COMMAND FAILED ${command}`, err);
      }
    }
  }

  private async tryAutoReconnect() {
    if (
      !this.autoReconnect ||
      !this.lastDeviceId ||
      this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS
    ) {
      return;
    }

    this.reconnectAttempts++;
    this.setState('reconnecting');

    this.emit({
      type: 'reconnecting',
      payload: {
        attempt: this.reconnectAttempts,
        max: MAX_RECONNECT_ATTEMPTS,
      },
    });

    await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));

    const success = await this.performConnect(this.lastDeviceId);

    if (!success && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.tryAutoReconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false;

    if (this.isNative && this.connectedDevice && this.activeProfile) {
      try {
        await BleClient.stopNotifications(
          this.connectedDevice.deviceId,
          this.activeProfile.serviceUuid,
          this.activeProfile.notifyUuid
        );
      } catch {}

      try {
        await BleClient.disconnect(this.connectedDevice.deviceId);
      } catch (e) {
        this.warn('[BLE] DISCONNECT ERROR', e);
      }
    }

    this.connectedDevice = null;
    this.activeProfile = null;
    this.responseBuffer = '';
    this.autoReconnect = true;

    this.setState('disconnected');
  }

  async write(data: string): Promise<void> {
    if (this.state !== 'connected') {
      throw new Error('Not connected');
    }

    if (!this.isNative) return;

    if (!this.connectedDevice || !this.activeProfile) {
      throw new Error('BLE profile not ready');
    }

    // Vyčistit buffer PŘED zápisem, aby další příkaz nezachytil stale data
    this.responseBuffer = '';

    await this.writeToProfile(
      this.connectedDevice.deviceId,
      this.activeProfile,
      data
    );
  }

  async readResponse(timeout = 2000): Promise<string> {
    if (!this.isNative) {
      await new Promise(r => setTimeout(r, 50 + Math.random() * 30));
      return '';
    }

    return new Promise((resolve, reject) => {
      const startTime = Date.now();

      const check = setInterval(() => {
        if (this.responseBuffer.includes('>')) {
          clearInterval(check);

          const response = this.responseBuffer.trim().replace(/>$/, '').trim();

          this.responseBuffer = '';
          resolve(response);
        } else if (Date.now() - startTime > timeout) {
          clearInterval(check);

          const partial = this.responseBuffer.trim();
          this.responseBuffer = '';

          if (partial) {
            resolve(partial);
          } else {
            reject(new Error('TIMEOUT'));
          }
        }
      }, 20);
    });
  }

  getSignalQuality(): number {
    if (!this.connectedDevice) return 0;

    const rssi = this.connectedDevice.rssi;

    if (rssi >= -50) return 100;
    if (rssi >= -60) return 80;
    if (rssi >= -70) return 60;
    if (rssi >= -80) return 40;
    if (rssi >= -90) return 20;

    return 10;
  }
}

export const bleManager = new BLEManager();