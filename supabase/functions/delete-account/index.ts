import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/** Tabulky s přímým sloupcem user_id, které patří zákazníkovi. */
const USER_TABLES = [
  "obd_debug_logs",
  "obd_remote_commands",
  "obd_live_sessions",
  "obd_live_consents",
  "obd_permissions",
  "obd_pid_cache",
  "ai_conversations",
  "delphi_dev_executions",
  "device_tokens",
  "user_push_tokens",
  "admin_fcm_tokens",
  "admin_push_subscriptions",
  "admin_sessions",
  "notifications",
  "mileage_history",
  "service_history",
  "service_plans",
  "service_reviews",
  "service_bookings",
  "fault_reports",
  "tow_requests",
  "jm_orders",
  "new_part_orders",
  "used_part_requests",
  "vehicle_inquiries",
  "vehicle_buyback_requests",
  "vehicle_import_requests",
  "orders",
  "user_vehicles",
  "user_roles",
  "employees",
  "profiles",
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ověření uživatele podle jeho vlastního JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    const user = userData?.user;
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const uid = user.id;
    const email = user.email ?? null;
    const errors: Record<string, string> = {};

    // 1) Auditní záznam (zůstává i po smazání účtu, bez FK na auth.users)
    await admin.from("account_deletion_requests").insert({
      user_id: uid,
      email,
      status: "completed",
      metadata: {
        source: "in_app_self_service",
        deleted_at: new Date().toISOString(),
        user_agent: req.headers.get("user-agent"),
      },
    });

    // 2) Závislá data navázaná přes jiné tabulky
    const { data: convs } = await admin
      .from("support_conversations")
      .select("id")
      .eq("user_id", uid);
    const convIds = (convs ?? []).map((c: { id: string }) => c.id);
    if (convIds.length) {
      await admin.from("support_messages").delete().in("conversation_id", convIds);
      await admin.from("support_conversations").delete().in("id", convIds);
    }

    const { data: sOrders } = await admin
      .from("service_orders")
      .select("id")
      .eq("user_id", uid);
    const soIds = (sOrders ?? []).map((o: { id: string }) => o.id);
    if (soIds.length) {
      for (const t of [
        "service_order_messages",
        "service_order_parts",
        "service_order_photos",
        "service_order_status_history",
        "service_invoices",
        "service_checkins",
        "mechanic_tasks",
        "work_reports",
      ]) {
        const { error } = await admin.from(t).delete().in("service_order_id", soIds);
        if (error) errors[t] = error.message;
      }
      await admin.from("service_orders").delete().in("id", soIds);
    }

    await admin.from("service_book_shares").delete().eq("owner_id", uid);

    // 3) Hlavní tabulky s user_id
    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", uid);
      if (error) errors[table] = error.message;
    }

    // 4) Smazání účtu v Auth (nevratné)
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error("deleteUser failed", delErr.message, errors);
      return new Response(
        JSON.stringify({ error: `Nepodařilo se smazat účet: ${delErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    console.log("account deleted", uid, "table warnings:", JSON.stringify(errors));

    return new Response(JSON.stringify({ success: true, warnings: errors }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("delete-account error", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
