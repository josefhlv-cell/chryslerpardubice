// Auto-dispatch zaplacené J+M položky na Nextis API.
// Volá se trigger z public.orders po přechodu status -> 'zaplacena'.
// Pro každou orders row s catalog_source='jm' vytvoří záznam v jm_orders
// a pošle ji přes jm-proxy createOrder. Idempotentní (kontroluje existující jm_orders).

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callJmProxy(action: string, payload: unknown) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${SERVICE_KEY}`,
      apikey: SERVICE_KEY,
    },
    body: JSON.stringify({ action, payload }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json?.success === false) {
    throw new Error(json?.error || `jm-proxy ${action} failed (${res.status})`);
  }
  return json.data;
}

async function dispatchOrder(sb: any, orderId: string) {
  const { data: order, error } = await sb
    .from("orders")
    .select("id, user_id, status, catalog_source, oem_number, part_name, quantity, price_with_vat, customer_note")
    .eq("id", orderId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!order) return { skipped: "not_found" };
  if (order.catalog_source !== "jm") return { skipped: "not_jm" };
  if (order.status !== "zaplacena") return { skipped: `status=${order.status}` };
  if (!order.oem_number) return { skipped: "no_oem" };

  // Idempotency
  const { data: existing } = await sb
    .from("jm_orders")
    .select("id, status, nextis_order_id")
    .eq("order_id", orderId)
    .in("status", ["pending", "sent"])
    .maybeSingle();
  if (existing && existing.status === "sent") {
    return { skipped: "already_sent", nextisOrderId: existing.nextis_order_id };
  }

  // Insert/update pending row
  let jmRowId = existing?.id as string | undefined;
  if (!jmRowId) {
    const { data: inserted, error: insErr } = await sb
      .from("jm_orders")
      .insert({
        order_id: order.id,
        user_id: order.user_id,
        status: "pending",
        items: [{ code: order.oem_number, qty: order.quantity, name: order.part_name }],
        total_price: order.price_with_vat,
        user_note: order.customer_note ?? null,
        attempts: 0,
      })
      .select("id")
      .single();
    if (insErr) throw new Error(insErr.message);
    jmRowId = inserted.id;
  }

  try {
    const reqPayload = {
      items: [{ code: order.oem_number, qty: order.quantity }],
      orderType: "General",
      userOrder: order.id.slice(0, 8),
      userNote: order.customer_note ?? `Order ${order.id}`,
      keepBackOrder: true,
    };

    const data = await callJmProxy("createOrder", reqPayload);

    await sb.from("jm_orders").update({
      status: "sent",
      nextis_order_id: data?.nextisOrderId ?? null,
      request_payload: reqPayload,
      response_payload: data?.raw ?? null,
      sent_at: new Date().toISOString(),
      attempts: (existing?.attempts ?? 0) + 1,
    }).eq("id", jmRowId);

    await sb.from("orders").update({
      status: "odeslana",
      admin_note: `Odesláno na J+M (${data?.nextisOrderId ?? "—"})`,
    }).eq("id", order.id);

    return { ok: true, jmRowId, nextisOrderId: data?.nextisOrderId ?? null };
  } catch (err) {
    const msg = (err as Error).message;
    await sb.from("jm_orders").update({
      status: "failed",
      error_message: msg.slice(0, 1000),
      attempts: (existing?.attempts ?? 0) + 1,
    }).eq("id", jmRowId);
    return { ok: false, error: msg, jmRowId };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);
    const body = await req.json().catch(() => ({}));

    // mode=process_pending: scan jm_orders pending/failed and retry (cron-friendly)
    if (body?.mode === "process_pending") {
      const { data: rows } = await sb
        .from("jm_orders")
        .select("order_id")
        .in("status", ["pending", "failed"])
        .lt("attempts", 5)
        .order("created_at", { ascending: true })
        .limit(20);
      const results = [];
      for (const r of rows || []) {
        results.push(await dispatchOrder(sb, r.order_id).catch((e) => ({ error: String(e) })));
      }
      return new Response(JSON.stringify({ processed: results.length, results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const orderId = body?.order_id || body?.orderId;
    if (!orderId) {
      return new Response(JSON.stringify({ error: "order_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const out = await dispatchOrder(sb, orderId);
    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
