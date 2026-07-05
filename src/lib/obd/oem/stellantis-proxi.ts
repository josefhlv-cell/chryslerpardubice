/**
 * Stellantis Proxi buffer — POUZE LOKÁLNÍ v paměti.
 *
 * NIKDY se nesmí odeslat do vozidla.
 * `computeChecksum()` vyhazuje chybu, protože Stellantis Proxi CRC polynomial
 * není v tomto projektu dostupný (viz Delphi-OBD OBD.OEM.Coding.Stellantis.pas).
 */
export class StellantisProxiBuffer {
  private data: number[];

  private constructor(bytes: number[]) {
    this.data = [...bytes];
  }

  static create(length: number): StellantisProxiBuffer {
    return new StellantisProxiBuffer(new Array(length).fill(0));
  }

  static createFromHex(hex: string): StellantisProxiBuffer {
    const clean = hex.replace(/[^0-9A-Fa-f]/g, "");
    const bytes: number[] = [];
    for (let i = 0; i + 1 < clean.length; i += 2) {
      bytes.push(parseInt(clean.substring(i, i + 2), 16));
    }
    return new StellantisProxiBuffer(bytes);
  }

  getByte(index: number): number {
    return this.data[index] ?? 0;
  }

  setByte(index: number, value: number): void {
    if (index < 0 || index >= this.data.length) return;
    this.data[index] = value & 0xff;
  }

  getBit(byteIndex: number, bitIndex: number): 0 | 1 {
    return (((this.data[byteIndex] ?? 0) >> bitIndex) & 1) as 0 | 1;
  }

  setBit(byteIndex: number, bitIndex: number, value: 0 | 1): void {
    if (byteIndex < 0 || byteIndex >= this.data.length) return;
    if (value) this.data[byteIndex] |= 1 << bitIndex;
    else this.data[byteIndex] &= ~(1 << bitIndex) & 0xff;
  }

  toHex(): string {
    return this.data.map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
  }

  setChecksum(crc: number, offset: number): void {
    this.setByte(offset, (crc >> 8) & 0xff);
    this.setByte(offset + 1, crc & 0xff);
  }

  computeChecksum(): never {
    throw new Error(
      "Stellantis Proxi CRC algorithm is not available. Proxi writing is disabled.",
    );
  }
}
