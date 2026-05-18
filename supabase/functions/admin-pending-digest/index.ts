import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Pending orders (nova)
    const { data: pendingOrders } = await supabase
      .from("orders")
      .select("id, oem_number, created_at, status")
      .eq("status", "nova")
      .order("created_at", { ascending: true });

    // Pending service bookings
    const { data: pendingBookings } = await supabase
      .from("service_bookings")
      .select("id, customer_name, service_date, created_at, status")
      .eq("status", "pending")
      .order("created_at", { ascending: true });

    const ordersCount = pendingOrders?.length ?? 0;
    const bookingsCount = pendingBookings?.length ?? 0;

    if (ordersCount === 0 && bookingsCount === 0) {
      return new Response(JSON.stringify({ ok: true, message: "no pending items" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const oldestOrder = pendingOrders?.[0];
    const oldestBooking = pendingBookings?.[0];

    const title = `📋 Nevyřízené: ${ordersCount} obj. / ${bookingsCount} rezervací`;
    const lines: string[] = [];
    if (ordersCount > 0) {
      lines.push(`🛒 ${ordersCount} nevyřízených objednávek`);
      if (oldestOrder) {
        const age = Math.floor(
          (Date.now() - new Date(oldestOrder.created_at).getTime()) / 86400000,
        );
        lines.push(`   Nejstarší: ${age} dní (OEM ${oldestOrder.oem_number ?? "—"})`);
      }
    }
    if (bookingsCount > 0) {
      lines.push(`🔧 ${bookingsCount} nevyřízených rezervací servisu`);
      if (oldestBooking) {
        const age = Math.floor(
          (Date.now() - new Date(oldestBooking.created_at).getTime()) / 86400000,
        );
        lines.push(`   Nejstarší: ${age} dní (${oldestBooking.customer_name ?? "—"})`);
      }
    }
    const message = lines.join("\n");

    const { data: admins } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    const adminIds = (admins ?? []).map((a: any) => a.user_id);
    if (adminIds.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "no admins" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Deduplicate: skip if same-title notification was sent in last 20h
    const since = new Date(Date.now() - 20 * 3600 * 1000).toISOString();
    const { data: recent } = await supabase
      .from("notifications")
      .select("user_id")
      .eq("title", title)
      .gte("created_at", since);
    const alreadyNotified = new Set((recent ?? []).map((r: any) => r.user_id));

    const toInsert = adminIds
      .filter((id) => !alreadyNotified.has(id))
      .map((user_id) => ({ user_id, title, message }));

    if (toInsert.length > 0) {
      await supabase.from("notifications").insert(toInsert);
    }

    return new Response(
      JSON.stringify({ ok: true, notified: toInsert.length, orders: ordersCount, bookings: bookingsCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e: any) {
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
