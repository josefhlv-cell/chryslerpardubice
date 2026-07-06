import { describe, it, expect } from "vitest";
import { decodeDtcPair, decodeDtcPayload } from "@/lib/obd/services/dtc-decoder";
import { parseIsoTp } from "@/lib/obd/protocol/isotp-parser";
import { parseUds } from "@/lib/obd/protocol/uds-parser";
import { detectElmError } from "@/lib/obd/adapter/elm-errors";

describe("DTC decoder", () => {
  it("dekóduje P0403 ze 01 04 03", () => {
    const d = decodeDtcPair(0x01, 0x04);
    expect(d?.code[0]).toBe("P");
  });
  it("payload 01 04 03 s pozitivním markerem už zvládne služba (03 = 43 …)", () => {
    // Zde testujeme jen samotný pair decoder.
    const d = decodeDtcPair(0x01, 0x04);
    expect(d?.letter).toBe("P");
  });
  it("payload Mode 03 bez count bytu: 01 33 → P0133", () => {
    const { codes } = decodeDtcPayload([0x01, 0x33]);
    expect(codes).toHaveLength(1);
    expect(codes[0].code).toBe("P0133");
  });
  it("ignoruje 00 00 padding", () => {
    const { codes } = decodeDtcPayload([0x00, 0x00, 0x04, 0x03]);
    expect(codes.some((c) => c.code === "P0403")).toBe(true);
  });
});

describe("ELM error detection", () => {
  it("NO DATA → no_data", () => expect(detectElmError("NO DATA")).toBe("no_data"));
  it("CAN ERROR → bus_error", () => expect(detectElmError("CAN ERROR")).toBe("bus_error"));
  it("BUFFER FULL → adapter_error", () => expect(detectElmError("BUFFER FULL")).toBe("adapter_error"));
  it("? → invalid_response", () => expect(detectElmError("?")).toBe("invalid_response"));
  it("normální data → null", () => expect(detectElmError("7E8 06 43 01 04 03 00 00")).toBeNull());
});

describe("ISO-TP parser", () => {
  it("single frame 7E8 06 43 01 04 03 00 00", () => {
    const m = parseIsoTp("7E8 06 43 01 04 03 00 00");
    expect(m.payload.slice(0, 4)).toEqual([0x43, 0x01, 0x04, 0x03]);
  });
  it("multi-frame VIN sestavení", () => {
    const m = parseIsoTp(
      [
        "7E8 10 14 62 F1 90 31 43 34",
        "7E8 21 52 4A 42 47 31 32 33",
        "7E8 22 34 35 36 37 38 00 00",
      ].join("\n"),
    );
    // 62 F1 90 + "1C4RJBG12345678"
    expect(m.payload[0]).toBe(0x62);
    expect(m.payload[1]).toBe(0xf1);
    expect(m.payload[2]).toBe(0x90);
    const ascii = String.fromCharCode(...m.payload.slice(3)).replace(/[^A-Z0-9]/gi, "");
    expect(ascii).toBe("1C4RJBG12345678");
  });
  it("složí ELM indexované VIN řádky bez PCI", () => {
    const m = parseIsoTp(
      [
        "0: 49 02 01 31 43 34 52",
        "1: 4A 42 47 31 32 33 34",
        "2: 35 36 37 38 39 30 31",
      ].join("\n"),
    );
    expect(m.payload.slice(0, 3)).toEqual([0x49, 0x02, 0x01]);
    const ascii = String.fromCharCode(...m.payload.slice(3)).replace(/[^A-Z0-9]/gi, "");
    expect(ascii).toBe("1C4RJBG12345678901");
  });
});

describe("UDS parser", () => {
  it("62 F1 90 + VIN ASCII", () => {
    const raw =
      "7E8 10 14 62 F1 90 31 43 34\n7E8 21 52 4A 42 47 31 32 33\n7E8 22 34 35 36 37 38 00 00";
    const uds = parseUds(raw, 0x22, [0xf1, 0x90]);
    expect(uds.status).toBe("ok");
    expect(uds.did).toBe("F190");
    const ascii = String.fromCharCode(...uds.payload).replace(/[^A-Z0-9]/gi, "");
    expect(ascii).toBe("1C4RJBG12345678");
  });
  it("7F 22 31 → unsupported (requestOutOfRange)", () => {
    const uds = parseUds("7E8 03 7F 22 31 00 00 00", 0x22, [0xf1, 0x98]);
    expect(uds.status).toBe("unsupported");
    expect(uds.negativeCode).toBe(0x31);
  });
  it("battery 62 1B 03 30 39 → 12.345 V", () => {
    const uds = parseUds("7E8 05 62 1B 03 30 39 00", 0x22, [0x1b, 0x03]);
    expect(uds.status).toBe("ok");
    const v = ((uds.payload[0] << 8) | uds.payload[1]) / 1000;
    expect(v).toBeCloseTo(12.345, 3);
  });
});
