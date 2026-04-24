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

// Phase 1 strict whitelist (Jeep + Hummer removed per scope decision)
const ALLOWED_BRANDS = [
  "chrysler", "dodge", "ram", "cadillac", "lancia",
];

const UNIVERSAL_BRANDS = ["bosch", "mann", "mahle", "denso", "ngk", "gates", "febi", "valeo"];

function isAllowedBrand(producer: string | null | undefined): boolean {
  if (!producer) return true;
  const p = producer.toLowerCase().trim();
  return ALLOWED_BRANDS.some((b) => p.includes(b)) || UNIVERSAL_BRANDS.some((b) => p.includes(b));
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
    return (res.items || []).filter((p) => isAllowedBrand(p.brand));
  },

  /** Search parts by vehicle (VIN or brand/model/year). */
  async searchByVehicle(params: {
    vin?: string;
    brand?: string;
    model?: string;
    year?: number;
  }): Promise<UnifiedPart[]> {
    const res = await callProxy<{ items: UnifiedPart[] }>("searchByVehicle", params);
    return (res.items || []).filter((p) => isAllowedBrand(p.brand));
  },

  /** Get current price + stock for a list of OEM codes. */
  async getPriceAndStock(codes: string[]): Promise<unknown> {
    return await callProxy("priceAndStock", { codes });
  },

  /**
   * Sync Nextis vehicle hierarchy (brand → model → engine) into catalog_categories.
   * Only allowed brands are persisted. Idempotent (uses upsert).
   */
  async syncCategories(): Promise<{ synced: number; skipped: number; endpoint: string }> {
    return await callProxy("syncCategories", {});
  },

  /**
   * Read the unified catalog tree directly from the DB.
   * Returns brand/model/engine nodes + global categories (Náplně, Pneu, ...).
   */
  async fetchCategoryTree() {
    const { data, error } = await supabase
      .from("catalog_categories")
      .select("id, parent_id, slug, name_cs, name_en, node_type, vehicle_brand, vehicle_model, vehicle_engine, is_global, sort_order")
      .order("sort_order", { ascending: true })
      .order("name_cs", { ascending: true });
    if (error) throw new Error(error.message);
    return data || [];
  },

  /**
   * OEM-FIRST sort comparator. Mopar/OEM (rank=1) is always pushed to top.
   * Use as Array.sort callback on combined results from multiple adapters.
   */
  oemFirstSort(a: { supplier?: string; catalog_source?: string }, b: { supplier?: string; catalog_source?: string }): number {
    const rank = (s?: string) => {
      const v = (s || "").toLowerCase();
      if (v === "mopar" || v === "mopar_oem") return 1;
      if (v === "csv") return 2;
      if (v === "sag") return 3;
      if (v === "autokelly") return 4;
      if (v === "jm") return 5;
      if (v === "epc") return 6;
      if (v === "ai") return 9;
      return 10;
    };
    return rank(a.supplier || a.catalog_source) - rank(b.supplier || b.catalog_source);
  },
};

export default jmAdapter;
