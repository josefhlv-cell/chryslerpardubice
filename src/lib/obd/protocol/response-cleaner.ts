/**
 * Response cleaner — odstraní echo příkazu, prompt '>', SEARCHING…, prázdné řádky.
 * Zachovává hlavičky (7E8 …) — parsování hlaviček dělá ISO-TP parser.
 */

export function cleanElmResponse(raw: string, command?: string): string {
  if (!raw) return "";
  const cmdUpper = command?.toUpperCase().replace(/\s/g, "");
  return raw
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.replace(/>/g, "").trim())
    .filter((line) => {
      if (!line) return false;
      const upper = line.toUpperCase();
      if (upper.startsWith("SEARCHING")) return false;
      if (cmdUpper && upper.replace(/\s/g, "") === cmdUpper) return false; // echo
      return true;
    })
    .join("\n");
}

/** Vrátí pole hex bajtů z jedné cleaned řádky (bez pomlček/mezer). */
export function hexLineToBytes(line: string): number[] {
  const clean = line.replace(/[^0-9A-Fa-f]/g, "");
  const out: number[] = [];
  for (let i = 0; i + 1 < clean.length; i += 2) {
    out.push(parseInt(clean.substring(i, i + 2), 16));
  }
  return out;
}

export function bytesToHex(bytes: number[], sep = " "): string {
  return bytes
    .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
    .join(sep);
}
