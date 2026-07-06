/**
 * Chrysler / Mopar 62TE custom PID kandidáti.
 * VŽDY validujeme reálnou odpovědí – nikdy nevracet fake hodnotu.
 *
 * Odmítnout:
 * - odpověď 7F… (negative response)
 * - NO DATA / UNABLE / ERROR / STOPPED / SEARCHING / ?
 * - příliš krátká odpověď
 * - byte 0x00 nebo 0xFF (invalidní)
 * - dekódovaná hodnota mimo reálný rozsah -20…180 °C pro teplotu převodovky
 * - odpověď 613000 nesmí být brána jako validní teplota
 */
import { elmQueue } from "@/lib/obd/adapter/elm-queue";

export type CustomPidStatus = "supported" | "unsupported" | "invalid" | "error";

export type ChryslerCustomPidKey = "transmissionOilTemp" | "oilPressure";

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
  return raw.replace(/[^0-9A-Fa-f]/g, "").toUpperCase();
}

function isBadResponse(raw: string): boolean {
  if (!raw) return true;
  if (/NO\s*DATA|UNABLE|ERROR|STOPPED|SEARCHING|\?/i.test(raw)) return true;
  const clean = cleanHex(raw);
  // Negative response 7F <service> <NRC>
  if (/(^|[^0-9A-F])7F[0-9A-F]{4}/.test(clean)) return true;
  return false;
}

function extractBytes(raw: string, responsePrefix: string): number[] | null {
  const clean = cleanHex(raw);
  const prefix = responsePrefix.toUpperCase();
  const index = clean.indexOf(prefix);
  if (index < 0) return null;
  const payload = clean.slice(index + prefix.length);
  const bytes: number[] = [];
  for (let i = 0; i + 1 < payload.length; i += 2) {
    const b = parseInt(payload.slice(i, i + 2), 16);
    if (Number.isNaN(b)) return null;
    bytes.push(b);
  }
  return bytes;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function invalidByte(b: number): boolean {
  return b === 0x00 || b === 0xff;
}

export const CHRYSLER_CUSTOM_PIDS: ChryslerCustomPidDefinition[] = [
  // A0) Chrysler Mode 22 PID 1302 – teplota ATF (byte 0 = raw, °C = raw - 40)
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (Mode 22 – 1302)",
    header: "7E1",
    command: "221302",
    responsePrefix: "621302",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 1) return null;
      const raw = bytes[0];
      if (invalidByte(raw)) return null;
      return round1(raw - 40);
    },
  },
  // A) Chrysler TCM 21 30 data record – byte 12 (index 9 v payload) obsahuje ATF temp
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (62TE / 21 30)",
    header: "7E1",
    command: "2130",
    responsePrefix: "6130",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      // Krátká odpověď typu 613000 = neplatné (viz specifikace uživatele)
      if (bytes.length < 10) return null;
      const raw = bytes[9];
      if (invalidByte(raw)) return null;
      return round1(raw - 40);
    },
  },
  // B) ScanGauge / XGauge 22 91 10 – bytes[0..1], F = raw / 64, C = (F-32)*5/9
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (XGauge 22 91 10)",
    header: "7E1",
    command: "229110",
    responsePrefix: "629110",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 2) return null;
      const raw = bytes[0] * 256 + bytes[1];
      if (raw === 0x0000 || raw === 0xffff) return null;
      const f = raw / 64;
      return round1(((f - 32) * 5) / 9);
    },
  },
  // C) Totéž přes PCM header
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (PCM 22 91 10)",
    header: "7E0",
    command: "229110",
    responsePrefix: "629110",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 2) return null;
      const raw = bytes[0] * 256 + bytes[1];
      if (raw === 0x0000 || raw === 0xffff) return null;
      const f = raw / 64;
      return round1(((f - 32) * 5) / 9);
    },
  },
  // D–I) Mode 22 kandidáti (méně pravděpodobní, ale vyzkoušené)
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (22 19 40)",
    header: "7E1",
    command: "221940",
    responsePrefix: "621940",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        const raw = bytes[0] * 256 + bytes[1];
        if (raw === 0x0000 || raw === 0xffff) return null;
        return round1(raw / 10 - 40);
      }
      if (bytes.length >= 1) {
        if (invalidByte(bytes[0])) return null;
        return round1(bytes[0] - 40);
      }
      return null;
    },
  },
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (22 F4 0C)",
    header: "7E1",
    command: "22F40C",
    responsePrefix: "62F40C",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 1 || invalidByte(bytes[0])) return null;
      return round1(bytes[0] - 40);
    },
  },
  // G) ZF 8HP TCM na novějších FCA/Stellantis (2017+) — TCM přeadresován na 7E2
  //    (viz Delphi-OBD catalogs/stellantis.json, ECU 0x7E2 = TCM ZF 8HP/9HP)
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (7E2 / 22 19 40)",
    header: "7E2",
    command: "221940",
    responsePrefix: "621940",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        const raw = bytes[0] * 256 + bytes[1];
        if (raw === 0x0000 || raw === 0xffff) return null;
        return round1(raw / 10 - 40);
      }
      if (bytes.length >= 1) {
        if (invalidByte(bytes[0])) return null;
        return round1(bytes[0] - 40);
      }
      return null;
    },
  },
  // H) Stellantis Service 22 DID 0x4005 (Delphi catalog: live_oil_temp),
  //    na TCM (7E2) v některých vozech vrací TFT (transmission fluid temp).
  {
    key: "transmissionOilTemp",
    label: "Teplota oleje převodovky (7E2 / 22 40 05)",
    header: "7E2",
    command: "224005",
    responsePrefix: "624005",
    unit: "°C",
    min: -20,
    max: 180,
    decoder: (bytes) => {
      if (bytes.length < 1) return null;
      // int8 signed
      const raw = bytes[0];
      if (raw === 0xff) return null;
      const signed = raw > 127 ? raw - 256 : raw;
      return round1(signed);
    },
  },
  // Tlak motorového oleje – Chrysler Mode 22 PID 1101 (raw / 100 = bar)
  {
    key: "oilPressure",
    label: "Tlak oleje (Mode 22 – 1101)",
    header: "7E0",
    command: "221101",
    responsePrefix: "621101",
    unit: "bar",
    min: 0.2,
    max: 10,
    decoder: (bytes) => {
      if (bytes.length < 1) return null;
      const raw = bytes[0];
      if (invalidByte(raw)) return null;
      const bar = raw / 100;
      return round1(bar);
    },
  },
  // Tlak oleje – kandidát 22115C
  {
    key: "oilPressure",
    label: "Tlak oleje (22 11 5C)",
    header: "7E0",
    command: "22115C",
    responsePrefix: "62115C",
    unit: "kPa",
    min: 10,
    max: 1000,
    decoder: (bytes) => {
      if (bytes.length >= 2) {
        const raw = bytes[0] * 256 + bytes[1];
        if (raw === 0x0000 || raw === 0xffff) return null;
        return round1(raw);
      }
      if (bytes.length >= 1) {
        if (invalidByte(bytes[0])) return null;
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
      `[PID DISCOVERY] testing key=${definition.key} header=${definition.header} command=${definition.command}`,
    );

    const header = await elmQueue.send(`ATSH${definition.header}`, { timeoutMs: 650, commandType: "stellantis_did" });
    if (header.status === "adapter_error") {
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: "unsupported",
        value: null,
        unit: definition.unit,
        raw: header.raw,
        header: definition.header,
        command: definition.command,
        reason: "Adaptér nebyl po předchozím dotazu klidný – PID se přeskočil.",
      };
    }
    const res = await elmQueue.send(definition.command, { timeoutMs: 1200, commandType: "stellantis_did" });
    const raw = res.raw;

    console.log(`[PID DISCOVERY] raw=${raw}`);

    if (isBadResponse(raw)) {
      console.log(`[PID DISCOVERY] rejected reason=bad_response`);
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: "unsupported",
        value: null,
        unit: definition.unit,
        raw,
        header: definition.header,
        command: definition.command,
        reason: "Odpověď 7F/NO DATA/ERROR – PID není podporovaný.",
      };
    }

    const bytes = extractBytes(raw, definition.responsePrefix);
    if (!bytes) {
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: "invalid",
        value: null,
        unit: definition.unit,
        raw,
        header: definition.header,
        command: definition.command,
        reason: "Odpověď nemá očekávaný prefix.",
      };
    }

    const value = definition.decoder(bytes);
    if (
      value === null ||
      Number.isNaN(value) ||
      value < definition.min ||
      value > definition.max
    ) {
      console.log(`[PID DISCOVERY] rejected reason=out_of_range value=${value}`);
      return {
        key: definition.key,
        label: definition.label,
        supported: false,
        status: "invalid",
        value: null,
        unit: definition.unit,
        raw,
        header: definition.header,
        command: definition.command,
        reason: "Hodnota mimo reálný rozsah nebo krátká odpověď.",
      };
    }

    console.log(
      `[PID DISCOVERY] selected key=${definition.key} header=${definition.header} command=${definition.command} value=${value}${definition.unit}`,
    );

    return {
      key: definition.key,
      label: definition.label,
      supported: true,
      status: "supported",
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
      status: "error",
      value: null,
      unit: definition.unit,
      raw: "",
      header: definition.header,
      command: definition.command,
      reason: error instanceof Error ? error.message : "Neznámá chyba.",
    };
  } finally {
    try {
      await elmQueue.send("ATSH7DF", { timeoutMs: 650, commandType: "stellantis_did" });
    } catch {
      /* header reset ignore */
    }
  }
}
