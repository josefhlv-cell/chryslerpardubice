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
    } else {
      // Generic notification
      subject = record.title || "Nová notifikace";
      body = record.message || "";
    }

    // Use Lovable AI to send email via fetch to a simple SMTP relay
    // For now, store the email intent as a notification log
    // The in-app notification is already created by the DB trigger
    console.log(`Email notification prepared for: ${adminEmails.join(", ")}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body: ${body}`);

    return new Response(
      JSON.stringify({ ok: true, emails: adminEmails, subject }),
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
