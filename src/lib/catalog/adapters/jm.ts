/**
 * J+M Autodíly / Nextis catalog adapter
 * Calls the `jm-proxy` Edge Function. All credentials stay server-side.
 */
import { supabase } from "@/integrations/supabase/client";

export interface UnifiedPart {
  supplier: "jm";
  oem_number: string;
  brand: string;
  name: string;
  price_without_vat: number;
  price_with_vat: number;
  stock: number;
  availability: string;
  image: string;
  category: string;
  compatible_vehicles: string[];
}

const US_BRANDS = [
  "chrysler", "dodge", "jeep", "ram", "cadillac", "chevrolet", "chevy",
  "gmc", "buick", "ford", "lincoln", "mercury", "pontiac", "hummer",
  "tesla", "oldsmobile", "plymouth", "saturn", "mopar",
];

const UNIVERSAL_BRANDS = ["bosch", "mann", "mahle", "denso", "ngk", "gates", "febi", "valeo"];

function isUsBrand(producer: string | null | undefined): boolean {
  if (!producer) return true;
  const p = producer.toLowerCase().trim();
  return US_BRANDS.some((b) => p.includes(b)) || UNIVERSAL_BRANDS.some((b) => p.includes(b));
}

async function callProxy<T>(action: string, payload: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke("jm-proxy", {
    body: { action, payload },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || "jm-proxy failed");
  return data.data as T;
}

export const jmAdapter = {
  async ping(): Promise<{ ok: boolean; hasToken: boolean }> {
    return await callProxy("ping", {});
  },

  /** Search parts by OEM / item code. Returns only US-brand items. */
  async searchByCode(code: string): Promise<UnifiedPart[]> {
    const res = await callProxy<{ items: UnifiedPart[] }>("searchByCode", { code });
    return (res.items || []).filter((p) => isUsBrand(p.brand));
  },

  /** Search parts by vehicle (VIN or brand/model/year). */
  async searchByVehicle(params: {
    vin?: string;
    brand?: string;
    model?: string;
    year?: number;
  }): Promise<UnifiedPart[]> {
    const res = await callProxy<{ items: UnifiedPart[] }>("searchByVehicle", params);
    return (res.items || []).filter((p) => isUsBrand(p.brand));
  },

  /** Get current price + stock for a list of OEM codes. */
  async getPriceAndStock(codes: string[]): Promise<unknown> {
    return await callProxy("priceAndStock", { codes });
  },
};

export default jmAdapter;
