// BLE Manager for OBD2 adapter communication
// Supports Vgate / IOS-Vlink / ELM327 BLE adapters
// Uses @capacitor-community/bluetooth-le on native, simulates on web
import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';
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
  type: 'stateChange' | 'deviceFound' | 'data' | 'error' | 'reconnecting';
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
  private setState(state: BLEConnectionState) {
    this.state = state;
    this.emit({ type: 'stateChange', payload: state });
  }
  private async ensureInitialized(): Promise<void> {
    if (this.bleInitialized) return;
    if (this.isNative) {
      await BleClient.initialize({ androidNeverForLocation: true });
      this.bleInitialized = true;
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
      });
      this.setState('disconnected');
      return simDevices.sort((a, b) => this.scoreDevice(b) - this.scoreDevice(a));
    }
    try {
      await this.ensureInitialized();
      try {
        await BleClient.stopLEScan();
      } catch {}
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
          console.log('[BLE RAW SCAN]', {
            name: dev.name,
            deviceId: dev.deviceId,
            rssi: dev.rssi,
            uuids: result.uuids,
          });
        }
      );
      await new Promise(r => setTimeout(r, duration));
      try {
        await BleClient.stopLEScan();
      } catch {}
    } catch (e) {
      console.error('BLE scan error:', e);
      this.emit({ type: 'error', payload: e });
      try {
        await BleClient.stopLEScan();
      } catch {}
    }
    this.setState('disconnected');
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
      await BleClient.connect(deviceId, disconnectedId => {
        console.log('[BLE] Disconnected:', disconnectedId);
        this.connectedDevice = null;
        this.activeProfile = null;
        this.setState('disconnected');
        this.tryAutoReconnect();
      });
      try {
        const services = await BleClient.getServices(deviceId);
        console.log('[BLE SERVICES]', services);
      } catch (serviceErr) {
        console.warn('[BLE] getServices warning:', serviceErr);
      }
      const profile = await this.findWorkingProfile(deviceId);
      if (!profile) {
        throw new Error('No supported OBD BLE profile found.');
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
      await this.initializeELM327();
      return true;
    } catch (e) {
      console.error('BLE connect error:', e);
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
  private async findWorkingProfile(deviceId: string): Promise<OBDProfile | null> {
    for (const profile of OBD_PROFILES) {
      try {
        console.log('[BLE] Trying profile:', profile.name);
        await BleClient.startNotifications(
          deviceId,
          profile.serviceUuid,
          profile.notifyUuid,
          value => {
            const text = new TextDecoder().decode(value);
            this.responseBuffer += text;
            this.emit({ type: 'data', payload: text });
          }
        );
        console.log('[BLE] Working profile:', profile.name);
        return profile;
      } catch (err) {
        console.warn('[BLE] Profile failed:', profile.name, err);
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
  private async initializeELM327(): Promise<void> {
    const commands = ['ATZ', 'ATE0', 'ATL0', 'ATS0', 'ATH0', 'ATSP0'];
    for (const command of commands) {
      try {
        await this.write(command);
        await this.readResponse(command === 'ATZ' || command === 'ATSP0' ? 3000 : 2000);
      } catch (err) {
        console.warn(`[BLE] OBD init command failed: ${command}`, err);
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
    console.log(
      `[BLE] Auto-reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`
    );
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
        console.error('BLE disconnect error:', e);
      }
    }
    this.connectedDevice = null;
    this.activeProfile = null;
    this.responseBuffer = '';
    this.lastDeviceId = null;
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
    const encoded = new TextEncoder().encode(data + '\r');
    const dataView = new DataView(encoded.buffer);
    try {
      await BleClient.write(
        this.connectedDevice.deviceId,
        this.activeProfile.serviceUuid,
        this.activeProfile.writeUuid,
        dataView
      );
    } catch (writeErr) {
      console.warn('[BLE] write failed, trying writeWithoutResponse:', writeErr);
      await BleClient.writeWithoutResponse(
        this.connectedDevice.deviceId,
        this.activeProfile.serviceUuid,
        this.activeProfile.writeUuid,
        dataView
      );
    }
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
          const response = this.responseBuffer
            .trim()
            .replace(/>$/, '')
            .trim();
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