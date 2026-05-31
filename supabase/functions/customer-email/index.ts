// Odešle zákazníkovi zprávu nebo souhrn faktury přes Resend.
// POST body: { user_id, subject, body, order_id?, kind: 'message' | 'invoice' }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { user_id, subject, body, order_id, kind = "message" } = await req.json();
    if (!user_id || !subject || !body) {
      return new Response(JSON.stringify({ error: "user_id, subject and body are required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: profile } = await supabase
      .from("profiles").select("email, full_name").eq("user_id", user_id).maybeSingle();

    if (!profile?.email) {
      return new Response(JSON.stringify({ error: "Customer e-mail not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // In-app notifikace
    await supabase.from("notifications").insert({
      user_id,
      title: subject,
      message: body.substring(0, 500),
      link: order_id ? `/my-orders` : null,
      event_type: kind === "invoice" ? "invoice_sent" : "admin_message",
    });

    // Email
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    let emailSent = false;
    if (RESEND_API_KEY) {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_API_KEY}` },
        body: JSON.stringify({
          from: "Chrysler Pardubice <onboarding@resend.dev>",
          to: [profile.email],
          subject,
          text: body,
        }),
      });
      emailSent = r.ok;
      if (!r.ok) console.error("Resend failed:", await r.text());
    }

    return new Response(JSON.stringify({ ok: true, email: profile.email, emailSent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("customer-email error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
