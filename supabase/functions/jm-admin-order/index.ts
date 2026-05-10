// supabase/functions/jm-admin-order/index.ts
// Admin schvaluje a posílá J+M objednávku na Nextis API.
// Uloží záznam do jq_orders (vytvoří se jednoduchá tabulka v migration později pokud bude třeba),
// teď jen proxy do jm-proxy/createOrder.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sb = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claims } = await sb.auth.getClaims(token);
    const uid = claims?.claims?.sub;
    if (!uid) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: isAdmin } = await sbAdmin.rpc("has_role", {
      _user_id: uid,
      _role: "admin",
    });
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { items, validateOnly } = body as {
      items: { oem: string; quantity: number }[];
      validateOnly?: boolean;
    };

    if (!items?.length) {
      return new Response(JSON.stringify({ error: "items required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const action = validateOnly ? "validateOrder" : "createOrder";
    const { data, error } = await sbAdmin.functions.invoke("jm-proxy", {
      body: { action, payload: { items } },
    });
    if (error) throw new Error(error.message);

    return new Response(
      JSON.stringify({ success: true, validateOnly: !!validateOnly, result: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
