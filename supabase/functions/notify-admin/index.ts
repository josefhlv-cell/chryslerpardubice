import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { type, record } = await req.json();

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Get admin emails from profiles
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");

    if (!adminRoles || adminRoles.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No admins found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminIds = adminRoles.map((r: any) => r.user_id);

    const { data: adminProfiles } = await supabase
      .from("profiles")
      .select("email, full_name")
      .in("user_id", adminIds);

    const adminEmails = (adminProfiles || [])
      .map((p: any) => p.email)
      .filter(Boolean);

    if (adminEmails.length === 0) {
      return new Response(JSON.stringify({ ok: true, message: "No admin emails" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build email content based on type
    let subject = "";
    let body = "";

    if (type === "buyback") {
      subject = `Nový požadavek na výkup: ${record.brand} ${record.model} (${record.year})`;
      body = `
Nový požadavek na výkup vozu:

Značka: ${record.brand}
Model: ${record.model}
Rok: ${record.year}
Stav: ${record.condition}
Nájezd: ${record.mileage?.toLocaleString()} km
VIN: ${record.vin || "—"}

Kontakt: ${record.name || "—"}
E-mail: ${record.email || "—"}
Telefon: ${record.phone || "—"}

Poznámka: ${record.note || "—"}
      `.trim();
    } else if (type === "import") {
      subject = `Nový požadavek na dovoz: ${record.brand} ${record.model}`;
      body = `
Nový požadavek na individuální dovoz:

Značka: ${record.brand}
Model: ${record.model}
Rok: ${record.year_from || "—"} – ${record.year_to || "—"}
Rozpočet: ${record.budget_from || "—"} – ${record.budget_to || "—"} Kč
Palivo: ${record.fuel || "—"}
Převodovka: ${record.transmission || "—"}
Barva: ${record.color || "—"}
Výbava: ${record.extras || "—"}

Kontakt: ${record.name || "—"}
E-mail: ${record.email || "—"}
Telefon: ${record.phone || "—"}

Poznámka: ${record.note || "—"}
      `.trim();
    } else if (type === "order") {
      const sourceLabel = record.catalog_source === "autokelly" ? "AutoKelly"
        : record.catalog_source === "mopar" ? "Mopar OE"
        : record.catalog_source === "csv" ? "CSV Import"
        : record.catalog_source || "Neznámý";
      subject = `Nová objednávka: ${record.part_name || "díl"} (${sourceLabel})`;
      body = `
Nová objednávka dílu:

Název: ${record.part_name || "—"}
OEM: ${record.oem_number || "—"}
Typ: ${record.order_type === "used" ? "Použitý díl" : "Nový díl"}
Množství: ${record.quantity || 1}
Cena bez DPH: ${record.unit_price ? record.unit_price + " Kč" : "—"}

🔧 ZDROJ DÍLU: ${sourceLabel}
${record.catalog_source === "autokelly" ? "→ Objednat přes AutoKelly" : ""}
${record.catalog_source === "mopar" ? "→ Objednat přes Mopar katalog" : ""}

Poznámka zákazníka: ${record.customer_note || "—"}
      `.trim();
    } else {
      // Generic notification
      subject = record.title || "Nová notifikace";
      body = record.message || "";
    }

    // Create in-app notifications for all admins
    const notifRows = adminIds.map((uid: string) => ({
      user_id: uid,
      title: subject,
      message: body.substring(0, 500),
    }));
    await supabase.from("notifications").insert(notifRows);

    console.log(`Notification sent to ${adminIds.length} admin(s): ${subject}`);

    return new Response(
      JSON.stringify({ ok: true, admins: adminIds.length, subject }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-admin:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
