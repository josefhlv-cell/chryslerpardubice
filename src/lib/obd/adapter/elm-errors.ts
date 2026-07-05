/**
 * ELM327 error mapping — podle Delphi-OBD principu.
 * Nikdy nevracet 0 nebo "OK", pokud adapter vrátil chybu.
 */

export type ElmStatus =
  | "ok"
  | "no_data"
  | "unsupported"
  | "adapter_error"
  | "bus_error"
  | "timeout"
  | "invalid_response"
  | "security_denied"
  | "response_pending"
  | "error";

const PATTERNS: Array<{ re: RegExp; status: ElmStatus }> = [
  { re: /NO\s*DATA/i, status: "no_data" },
  { re: /UNABLE\s+TO\s+CONNECT/i, status: "adapter_error" },
  { re: /CAN\s*ERROR/i, status: "bus_error" },
  { re: /BUS\s*(INIT|ERROR)/i, status: "bus_error" },
  { re: /BUFFER\s*FULL/i, status: "adapter_error" },
  { re: /STOPPED/i, status: "adapter_error" },
  { re: /TIMEOUT/i, status: "timeout" },
  { re: /\?/, status: "invalid_response" },
  { re: /ERROR/i, status: "error" },
];

/** Vrátí ElmStatus nebo null, pokud odpověď není chyba. */
export function detectElmError(raw: string): ElmStatus | null {
  if (!raw) return "no_data";
  const upper = raw.toUpperCase();
  if (/SEARCHING/.test(upper) && upper.replace(/SEARCHING\.*/g, "").trim() === "") {
    return "timeout";
  }
  for (const { re, status } of PATTERNS) {
    if (re.test(upper)) return status;
  }
  return null;
}

export function humanElmStatus(status: ElmStatus): string {
  switch (status) {
    case "ok":
      return "V pořádku";
    case "no_data":
      return "Řídicí jednotka nevrátila data pro tento režim. Chyba může být v jiné jednotce nebo vyžaduje rozšířenou diagnostiku.";
    case "unsupported":
      return "Tato jednotka tento údaj neposkytla.";
    case "adapter_error":
      return "Chyba OBD adaptéru.";
    case "bus_error":
      return "Chyba CAN sběrnice.";
    case "timeout":
      return "Vypršel čas odpovědi.";
    case "invalid_response":
      return "Adaptér nerozuměl příkazu.";
    case "security_denied":
      return "Přístup byl odmítnut (security access).";
    case "response_pending":
      return "Řídicí jednotka odpověď zpracovává.";
    case "error":
    default:
      return "Neznámá chyba adaptéru.";
  }
}
