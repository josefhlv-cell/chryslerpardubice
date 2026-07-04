import { elm327 } from '@/lib/obd/elm327-engine';

export type CustomPidStatus =
  | 'supported'
  | 'unsupported'
  | 'invalid'
  | 'error';

export type ChryslerCustomPidKey =
  | 'transmissionOilTemp'
  | 'oilPressure';

export type ChryslerCustomPidResult = {
  key: ChryslerCustomPidKey;
  label: string;
  supported: boolean;
  status: CustomPidStatus;
  value: number | null;
  unit: string;
  raw: string;
  header: string;
  command: string;
  reason?: string;
};

export type ChryslerCustomPidDefinition = {
  key: ChryslerCustomPidKey;
  label: string;
  header: string;
  command: string;
  responsePrefix: string;
  unit: string;
  min: number;
  max: number;
  decoder: (bytes: number[]) => number | null;
};

function cleanHex(raw: string): string {
  return raw.replace(/[^0-9A-Fa-f]/g, '').toUpperCase();
}

function extractBytes(raw: string, responsePrefix: string): number[] | null {
  const clean = cleanHex(raw);
  const prefix = responsePrefix.toUpperCase();
  const index = clean.indexOf(prefix);

  if (index < 0) return null;

  const payload = clean.slice(index + prefix.length);
  const bytes: number[] = [];

  for (let i = 0; i + 1 < payload.length; i += 2) {
    const byte = parseInt(payload.slice(i, i + 2), 16);
    if (Number.isNaN(byte)) return null;
    bytes.push(byte);
  }

  return bytes;
}

function isBadResponse(raw: string): boolean {
  return /NO\s*DATA|UNABLE|ERROR|STOPPED|SEARCHING|\?/i.test(raw || '');
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export const CHRYSLER_CUSTOM_PIDS: ChryslerCustomPidDefinition[] = [
  {
    key: 'transmissionOilTemp',
    label: 'Teplota oleje pÅevodovky',
    header: '7E1',
    command: '221940',
    responsePrefix: '621940',
    unit: 'Â°C',
    min: -40,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        const raw = bytes[0] * 256 + bytes[1];
        return round1(raw / 10 - 40);
      }

      if (bytes.length >= 1) {
        return round1(bytes[0] - 40);
      }

      return null;
    },
  },
  {
    key: 'transmissionOilTemp',
    label: 'Teplota oleje pÅevodovky',
    header: '7E1',
    command: '2130',
    responsePrefix: '6130',
    unit: 'Â°C',
    min: -40,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 1) return null;
      return round1(bytes[0] - 40);
    },
  },
  {
    key: 'transmissionOilTemp',
    label: 'Teplota oleje pÅevodovky',
    header: '7E2',
    command: '221940',
    responsePrefix: '621940',
    unit: 'Â°C',
    min: -40,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        const raw = bytes[0] * 256 + bytes[1];
        return round1(raw / 10 - 40);
      }

      if (bytes.length >= 1) {
        return round1(bytes[0] - 40);
      }

      return null;
    },
  },
  {
    key: 'transmissionOilTemp',
    label: 'Teplota oleje pÅevodovky',
    header: '7E1',
    command: '22F40C',
    responsePrefix: '62F40C',
    unit: 'Â°C',
    min: -40,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 1) return null;
      return round1(bytes[0] - 40);
    },
  },
  {
    key: 'oilPressure',
    label: 'Tlak oleje',
    header: '7E0',
    command: '22115C',
    responsePrefix: '62115C',
    unit: 'kPa',
    min: 0,
    max: 1000,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        return round1(bytes[0] * 256 + bytes[1]);
      }

      if (bytes.length >= 1) {
        return round1(bytes[0]);
      }

      return null;
    },
  },
  {
    key: 'oilPressure',
    label: 'Tlak oleje',
    header: '7E0',
    command: '22115D',
    responsePrefix: '62115D',
    unit: 'kPa',
    min: 0,
    max: 1000,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        return round1(bytes[0] * 256 + bytes[1]);
      }

      if (bytes.length >= 1) {
        return round1(bytes[0]);
      }

      return null;
    },
  },
];

export async function testChryslerCustomPid(
  definition: ChryslerCustomPidDefinition,
): Promise<ChryslerCustomPidResult> {
  try {
    console.log(
      `[OBD CUSTOM PID] testing ${definition.key} header=${definition.header} command=${definition.command}`,
    );

    await elm327.sendCommand(`ATSH${definition.header}`, 'high');

    const raw = await elm327.sendCommand(definition.command, 'high');

    console.log(`[OBD CUSTOM PID] raw response=${raw}`);

    if (!raw || isBadResponse(raw)) {
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: 'unsupported',
        value: null,
        unit: definition.unit,
        raw,
        header: definition.header,
        command: definition.command,
        reason: 'PID neodpovÄdÄl nebo nenÃ­ podporovanÃ½.',
      };
    }

    const bytes = extractBytes(raw, definition.responsePrefix);

    if (!bytes) {
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: 'invalid',
        value: null,
        unit: definition.unit,
        raw,
        header: definition.header,
        command: definition.command,
        reason: 'OdpovÄÄ nemÃ¡ oÄekÃ¡vanÃ½ prefix.',
      };
    }

    const value = definition.decoder(bytes);

    if (
      value === null ||
      Number.isNaN(value) ||
      value < definition.min ||
      value > definition.max
    ) {
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: 'invalid',
        value: null,
        unit: definition.unit,
        raw,
        header: definition.header,
        command: definition.command,
        reason: 'Hodnota je mimo reÃ¡lnÃ½ rozsah.',
      };
    }

    console.log(
      `[OBD CUSTOM PID] selected=${definition.key} value=${value}${definition.unit}`,
    );

    return {
      key: definition.key,
      label: definition.label,
      supported: true,
      status: 'supported',
      value,
      unit: definition.unit,
      raw,
      header: definition.header,
      command: definition.command,
    };
  } catch (error) {
    return {
      key: definition.key,
      label: definition.label,
      supported: false,
      status: 'error',
      value: null,
      unit: definition.unit,
      raw: '',
      header: definition.header,
      command: definition.command,
      reason: error instanceof Error ? error.message : 'NeznÃ¡mÃ¡ chyba.',
    };
  } finally {
    try {
      await elm327.sendCommand('ATSH7DF', 'low');
    } catch {
      // Header reset error ignorujeme.
    }
  }
}
