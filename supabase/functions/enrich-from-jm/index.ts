// Enrich parts_new with images, descriptions, and OE numbers from J+M.
// CRITICAL: Never touches prices. Only fills image_urls / description /
// compatible_vehicles when missing.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface JmItem {
  oem_number?: string;
  image?: string;
  category?: string;
  name?: string;
  oe_numbers?: string[] | null;
  compatible_vehicles?: string[];
}

async function callJmProxy(
  action: string,
  payload: unknown,
): Promise<{ items: JmItem[] } | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ action, payload }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j?.success) return null;
    return j.data as { items: JmItem[] };
  } catch (_e) {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);
  const onlyMissingImage = url.searchParams.get("scope") !== "all";

  // Fetch parts that need enrichment (missing image OR description)
  let q = sb
    .from("parts_new")
    .select("id, oem_number, image_urls, description, compatible_vehicles, name")
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (onlyMissingImage) {
    q = q.or("image_urls.is.null,description.is.null");
  }

  const { data: parts, error } = await q;
  if (error) {
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let updated = 0;
  let scanned = 0;
  const errors: string[] = [];

  for (const p of parts || []) {
    scanned++;
    if (!p.oem_number) continue;
    const res = await callJmProxy("searchByCode", { code: p.oem_number });
    if (!res?.items?.length) continue;

    // Find item whose oem_number or oe_numbers matches our part's OEM
    const norm = (s: string) => String(s || "").toUpperCase().replace(/[\s\-._/]/g, "");
    const target = norm(p.oem_number);
    const match = res.items.find((it) => {
      if (norm(it.oem_number || "") === target) return true;
      if (Array.isArray(it.oe_numbers) && it.oe_numbers.some((c) => norm(c) === target)) return true;
      return false;
    }) || res.items[0];

    const patch: Record<string, unknown> = {};
    const hasImg = Array.isArray(p.image_urls) && p.image_urls.length > 0;
    if (!hasImg && match.image) {
      patch.image_urls = [match.image];
    }
    if (!p.description && match.name && match.name !== p.name) {
      patch.description = match.name;
    }
    if (!p.compatible_vehicles && Array.isArray(match.compatible_vehicles) && match.compatible_vehicles.length) {
      patch.compatible_vehicles = match.compatible_vehicles.join("; ");
    }

    if (Object.keys(patch).length > 0) {
      const { error: uerr } = await sb
        .from("parts_new")
        .update(patch)
        .eq("id", p.id);
      if (uerr) errors.push(`${p.oem_number}: ${uerr.message}`);
      else updated++;
    }
  }

  await sb.from("catalog_event_log").insert({
    source: "enrich-from-jm",
    event: "batch_done",
    level: "info",
    message: `Enriched ${updated}/${scanned}`,
    details: { updated, scanned, errors: errors.slice(0, 10) },
  });

  return new Response(
    JSON.stringify({ success: true, scanned, updated, errors: errors.slice(0, 10) }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
