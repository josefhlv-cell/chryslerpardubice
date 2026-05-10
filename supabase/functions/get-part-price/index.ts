// supabase/functions/get-part-price/index.ts
// Real-time cena + dostupnost J+M dílu přes jm-proxy (Nextis API).
// Zapisuje do jq_prices. Veřejné pro přihlášené.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// MARŽE: <=4000 Kč => +70 %, jinak +40 %
function applyMargin(basePriceWithVat: number) {
  if (!basePriceWithVat || basePriceWithVat <= 0) {
    return { final: 0, markup: 0 };
  }
  const markup = basePriceWithVat <= 4000 ? 70 : 40;
  return {
    final: Number((basePriceWithVat * (1 + markup / 100)).toFixed(2)),
    markup,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { partId, oem } = await req.json();
    if (!partId && !oem) {
      return new Response(JSON.stringify({ error: "partId or oem required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    let oemNumber = oem as string | undefined;
    let partRow: { id: string; oem_number: string } | null = null;
    if (partId) {
      const { data } = await sb
        .from("jq_parts_basic")
        .select("id, oem_number")
        .eq("id", partId)
        .maybeSingle();
      if (data) {
        partRow = data;
        oemNumber = data.oem_number;
      }
    }
    if (!oemNumber) {
      return new Response(JSON.stringify({ error: "Part not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Volej jm-proxy
    const { data: proxy, error } = await sb.functions.invoke("jm-proxy", {
      body: { action: "priceAndStock", payload: { codes: [oemNumber] } },
    });
    if (error) throw new Error(error.message);

    const item = proxy?.data?.items?.[0] || proxy?.items?.[0] || {};
    const basePriceWithVat = Number(item.priceWithVat || item.price_with_vat || 0);
    const basePriceWithoutVat = Number(
      item.priceWithoutVat || item.price_without_vat || 0,
    );
    const { final, markup } = applyMargin(basePriceWithVat);
    const availability = item.availability || (item.stock > 0 ? "Skladem" : "Na objednávku");

    if (partRow) {
      await sb.from("jq_prices").upsert(
        {
          part_id: partRow.id,
          price_without_vat: basePriceWithoutVat,
          price_with_vat: final,
          availability,
          quantity: item.stock ?? null,
          delivery_days: item.deliveryDays ?? null,
          last_updated: new Date().toISOString(),
        },
        { onConflict: "part_id" },
      );
    }

    return new Response(
      JSON.stringify({
        oem: oemNumber,
        price_with_vat: final,
        base_price_with_vat: basePriceWithVat,
        markup_percent: markup,
        availability,
        quantity: item.stock ?? null,
        delivery_days: item.deliveryDays ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
