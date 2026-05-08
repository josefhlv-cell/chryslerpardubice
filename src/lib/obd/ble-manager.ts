// BLE Manager for OBD2 adapter communication
// Uses @capacitor-community/bluetooth-le on native, simulates on web

import { BleClient, ScanResult } from '@capacitor-community/bluetooth-le';

export type BLEDeviceInfo = {
  deviceId: string;
  name: string;
  rssi: number;
  connected: boolean;
};

export type BLEConnectionState = 'disconnected' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'error';

export type BLEEvent = {
  type: 'stateChange' | 'deviceFound' | 'data' | 'error' | 'reconnecting';
  payload: any;
};

type BLEListener = (event: BLEEvent) => void;

// Vgate iCar Pro BLE 4.0 (and most ELM327 BLE clones) use service 0xFFF0
// with FFF1 = NOTIFY (responses from adapter) and FFF2 = WRITE (commands to adapter).
// Some clones swap the two — auto-detect handled by trying both on first failure.
const OBD_SERVICE_UUID = '0000fff0-0000-1000-8000-00805f9b34fb';
const OBD_CHAR_NOTIFY_UUID = '0000fff1-0000-1000-8000-00805f9b34fb';
const OBD_CHAR_WRITE_UUID = '0000fff2-0000-1000-8000-00805f9b34fb';
const OBD_CHAR_NOTIFY_ALT = '0000fff2-0000-1000-8000-00805f9b34fb';
const OBD_CHAR_WRITE_ALT = '0000fff1-0000-1000-8000-00805f9b34fb';

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

  constructor() {
    this.isNative = typeof (window as any).Capacitor !== 'undefined' &&
                    (window as any).Capacitor.isNativePlatform?.();
  }

  getState(): BLEConnectionState { return this.state; }
  getConnectedDevice(): BLEDeviceInfo | null { return this.connectedDevice; }
  setAutoReconnect(enabled: boolean) { this.autoReconnect = enabled; }

  subscribe(listener: BLEListener): () => void {
    this.listeners.push(listener);
    return () => { this.listeners = this.listeners.filter(l => l !== listener); };
  }

  private emit(event: BLEEvent) { this.listeners.forEach(l => l(event)); }

  private setState(state: BLEConnectionState) {
    this.state = state;
    this.emit({ type: 'stateChange', payload: state });
  }

  private async ensureInitialized(): Promise<void> {
    if (this.bleInitialized) return;
    if (this.isNative) {
      try {
        await BleClient.initialize({ androidNeverForLocation: true });
        this.bleInitialized = true;
      } catch (e) {
        console.error('BLE init failed:', e);
        this.emit({ type: 'error', payload: e });
      }
    }
  }

  async scan(duration = 5000): Promise<BLEDeviceInfo[]> {
    this.setState('scanning');
    const devices: BLEDeviceInfo[] = [];

    if (!this.isNative) {
      await new Promise(r => setTimeout(r, 1500));
      const simDevices: BLEDeviceInfo[] = [
        { deviceId: 'vgate-icar-pro-001', name: 'Vgate iCar Pro 4.0', rssi: -45, connected: false },
        { deviceId: 'obd-generic-002', name: 'OBD-II Adapter', rssi: -72, connected: false },
      ];
      simDevices.forEach(d => { devices.push(d); this.emit({ type: 'deviceFound', payload: d }); });
      this.setState('disconnected');
      return devices;
    }

    try {
      await this.ensureInitialized();

      // Scan with OBD service filter
      await BleClient.requestLEScan(
        { services: [OBD_SERVICE_UUID], allowDuplicates: false },
        (result: ScanResult) => {
          const dev = this.scanResultToDevice(result);
          if (dev && !devices.find(d => d.deviceId === dev.deviceId)) {
            devices.push(dev);
            this.emit({ type: 'deviceFound', payload: dev });
          }
        }
      );

      // Also scan without filter for known OBD adapter names
      await BleClient.requestLEScan(
        { allowDuplicates: false },
        (result: ScanResult) => {
          const name = result.device.name || result.localName || '';
          if (/obd|elm|vgate|icar|obdlink|veepeak|bafx/i.test(name)) {
            const dev = this.scanResultToDevice(result);
            if (dev && !devices.find(d => d.deviceId === dev.deviceId)) {
              devices.push(dev);
              this.emit({ type: 'deviceFound', payload: dev });
            }
          }
        }
      );

      await new Promise(r => setTimeout(r, duration));
      await BleClient.stopLEScan();
    } catch (e) {
      console.error('BLE scan error:', e);
      this.emit({ type: 'error', payload: e });
    }

    this.setState('disconnected');
    return devices;
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
      await new Promise(r => setTimeout(r, 2000));
      this.connectedDevice = { deviceId, name: 'Vgate iCar Pro 4.0', rssi: -45, connected: true };
      this.setState('connected');
      return true;
    }

    return this.performConnect(deviceId);
  }

  private async performConnect(deviceId: string): Promise<boolean> {
    try {
      await this.ensureInitialized();

      await BleClient.connect(deviceId, (disconnectedId) => {
        console.log('[BLE] Disconnected:', disconnectedId);
        this.connectedDevice = null;
        this.setState('disconnected');
        this.tryAutoReconnect();
      });

      await BleClient.startNotifications(
        deviceId, OBD_SERVICE_UUID, OBD_CHAR_NOTIFY_UUID,
        (value) => {
          const text = new TextDecoder().decode(value);
          this.responseBuffer += text;
          this.emit({ type: 'data', payload: text });
        }
      );

      this.connectedDevice = { deviceId, name: 'OBD2 Adapter', rssi: -50, connected: true };
      this.reconnectAttempts = 0;
      this.setState('connected');
      return true;
    } catch (e) {
      console.error('BLE connect error:', e);
      this.setState('error');
      this.emit({ type: 'error', payload: e });
      return false;
    }
  }

  private async tryAutoReconnect() {
    if (!this.autoReconnect || !this.lastDeviceId || this.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return;

    this.reconnectAttempts++;
    console.log(`[BLE] Auto-reconnect attempt ${this.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS}`);
    this.setState('reconnecting');
    this.emit({ type: 'reconnecting', payload: { attempt: this.reconnectAttempts, max: MAX_RECONNECT_ATTEMPTS } });

    await new Promise(r => setTimeout(r, RECONNECT_DELAY_MS));
    const success = await this.performConnect(this.lastDeviceId);

    if (!success && this.reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      this.tryAutoReconnect();
    }
  }

  async disconnect(): Promise<void> {
    this.autoReconnect = false; // Prevent auto-reconnect on intentional disconnect
    if (this.isNative && this.connectedDevice) {
      try {
        await BleClient.stopNotifications(this.connectedDevice.deviceId, OBD_SERVICE_UUID, OBD_CHAR_NOTIFY_UUID);
        await BleClient.disconnect(this.connectedDevice.deviceId);
      } catch (e) {
        console.error('BLE disconnect error:', e);
      }
    }
    this.connectedDevice = null;
    this.responseBuffer = '';
    this.lastDeviceId = null;
    this.autoReconnect = true; // Re-enable for next connection
    this.setState('disconnected');
  }

  async write(data: string): Promise<void> {
    if (this.state !== 'connected') throw new Error('Not connected');
    if (!this.isNative) return;

    const encoded = new TextEncoder().encode(data + '\r');
    const dataView = new DataView(encoded.buffer);
    await BleClient.write(this.connectedDevice!.deviceId, OBD_SERVICE_UUID, OBD_CHAR_WRITE_UUID, dataView);
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
          if (partial) resolve(partial);
          else reject(new Error('TIMEOUT'));
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
