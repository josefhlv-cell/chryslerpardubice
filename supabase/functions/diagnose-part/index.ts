// diagnose-part: per-part diagnostic & repair suggestion engine.
// Actions:
//   - analyze:  rule-based + AI-assisted analysis, writes part_diagnostics row
//   - apply:    applies diagnostic suggestions, but ONLY after running db-backup
//
// Backup is MANDATORY before apply. The backup_path is stored on the diagnostic row.

import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const KNOWN_KEYWORDS = [
  "brzd", "destič", "kotouč", "třmen", "filtr", "olej", "svíčk", "alternát",
  "startér", "tlumič", "rameno", "pružin", "ložisk", "spojk", "hadic", "čerpadl",
  "termostat", "chladič", "vstřikov", "zapalov", "převod",
];

function ruleBasedAnalysis(part: any) {
  const name = String(part.name || "").trim();
  const oem = String(part.oem_number || "").trim();
  const desc = String(part.description || "").trim();
  const cat = String(part.category || "").trim();

  const nameLow = name.toLowerCase();
  const hasKeyword = KNOWN_KEYWORDS.some((k) => nameLow.includes(k));
  const isGeneric = /^(díl|part|náhradn[ií]|item|product)$/i.test(name) || name.length < 3;

  return {
    name_status: !name ? "incorrect" : isGeneric ? "suspicious" : hasKeyword ? "ok" : "suspicious",
    category_status: !cat ? "mismatch" : "ok",
    description_status: !desc || desc.length < 10 ? "poor" : "ok",
    oem_status: !oem ? "missing" : oem.length < 4 ? "invalid" : "matched",
  };
}

async function aiSuggestions(part: any) {
  const sys = `Jsi expert na americké náhradní díly. Navrhni opravy pro tento díl.
Vrať vždy validní hodnoty, i když jsou stejné jako stávající (means OK).`;

  const usr = `Díl:
OEM: ${part.oem_number}
Název: ${part.name}
Kategorie: ${part.category || "(prázdné)"}
Popis: ${part.description || "(prázdné)"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: usr },
      ],
      tools: [{
        type: "function",
        function: {
          name: "suggest",
          parameters: {
            type: "object",
            properties: {
              suggested_name: { type: "string" },
              suggested_category: { type: "string" },
              suggested_description: { type: "string" },
              notes: { type: "string" },
            },
            required: ["suggested_name", "suggested_category"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "suggest" } },
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  return args ? JSON.parse(args) : null;
}

async function triggerBackup(): Promise<string | null> {
  // Internal server-to-server call: use the service key explicitly so db-backup
  // does not try to validate it as an end-user JWT.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/db-backup`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${SERVICE_ROLE}`,
        "apikey": SERVICE_ROLE,
      },
      body: JSON.stringify({ action: "backup", trigger: "diagnose-part-apply" }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.success === false) {
      console.error("[diagnose-part] backup failed:", res.status, data);
      return null;
    }
    return data?.path || data?.file || `manual-${Date.now()}`;
  } catch (e) {
    console.error("[diagnose-part] backup exception:", e);
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const action: string = body.action || "analyze";
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

    if (action === "analyze") {
      const partIds: string[] = body.partIds || (body.partId ? [body.partId] : []);
      if (partIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "Missing partIds" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: parts } = await supabase
        .from("parts_new")
        .select("id, name, oem_number, category, description")
        .in("id", partIds);

      const results = [];
      for (const p of parts || []) {
        const rb = ruleBasedAnalysis(p);
        let suggestions: any = null;
        // Only call AI if there's something suspicious
        if (rb.name_status !== "ok" || rb.description_status !== "ok" || rb.category_status !== "ok") {
          suggestions = await aiSuggestions(p).catch(() => null);
        }
        const row = {
          part_id: p.id,
          name_status: rb.name_status,
          category_status: rb.category_status,
          description_status: rb.description_status,
          oem_status: rb.oem_status,
          suggested_name: suggestions?.suggested_name || null,
          suggested_category: suggestions?.suggested_category || null,
          suggested_description: suggestions?.suggested_description || null,
          notes: suggestions?.notes || null,
        };
        const { data: saved } = await supabase
          .from("part_diagnostics")
          .insert(row)
          .select("*")
          .single();
        results.push(saved);
      }

      return new Response(JSON.stringify({ success: true, diagnostics: results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "apply") {
      const diagnosticIds: string[] = body.diagnosticIds || [];
      const userId: string | null = body.userId || null;
      if (diagnosticIds.length === 0) {
        return new Response(JSON.stringify({ success: false, error: "Missing diagnosticIds" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // 🚨 MANDATORY BACKUP
      const backupPath = await triggerBackup();
      // Even if backup invoke fails, we still record the attempt — but block apply.
      if (!backupPath) {
        return new Response(
          JSON.stringify({ success: false, error: "Záloha selhala — oprava zablokována", fallback: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const { data: diags } = await supabase
        .from("part_diagnostics")
        .select("*")
        .in("id", diagnosticIds)
        .eq("applied", false);

      let applied = 0;
      for (const d of diags || []) {
        const updates: any = {};
        if (d.suggested_name) updates.name = d.suggested_name;
        if (d.suggested_category) updates.category = d.suggested_category;
        if (d.suggested_description) updates.description = d.suggested_description;
        if (Object.keys(updates).length === 0) continue;

        const { error } = await supabase
          .from("parts_new")
          .update(updates)
          .eq("id", d.part_id);
        if (error) continue;

        await supabase.from("part_diagnostics").update({
          applied: true,
          applied_at: new Date().toISOString(),
          applied_by: userId,
          backup_path: backupPath,
        }).eq("id", d.id);
        applied++;
      }

      return new Response(
        JSON.stringify({ success: true, applied, backupPath }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (action === "list") {
      const { data } = await supabase
        .from("part_diagnostics")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return new Response(JSON.stringify({ success: true, diagnostics: data || [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Unknown action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[diagnose-part] error:", e);
    return new Response(JSON.stringify({ success: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
