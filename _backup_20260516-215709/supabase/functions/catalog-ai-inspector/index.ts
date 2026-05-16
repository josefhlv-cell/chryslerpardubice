// catalog-ai-inspector — uses Lovable AI Gateway to detect anomalies in part data
// (name vs OEM, category mismatch, suspicious description, price outliers).
// Stores findings in catalog_anomalies. Can also auto-apply suggested fixes
// when ai_confidence >= threshold.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY")!;

const CANONICAL = [
  "Brzdový systém","Chlazení","Elektroinstalace","Filtry","Interiér","Karoserie",
  "Klimatizace","Motor","Odpružení","Osvětlení","Palivový systém","Převodovka",
  "Řízení","Údržba","Výfuk","Náplně a kapaliny","Pneumatiky a disky",
  "Příslušenství a nářadí","Náprava","Ostatní",
];

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

const SYSTEM = `You are a senior automotive parts catalog auditor (TecDoc-grade).
Given a list of parts (oem, name, category, description, price), evaluate each:
- Is the assigned category correct? (must be one of: ${CANONICAL.join(", ")})
- Is the name plausible for the OEM and consistent with the category?
- Is the description coherent and free of placeholder/spam text?
- Is the price suspicious (e.g. extreme outlier vs similar parts)?

Reply in STRICT JSON: { "items": [ { "oem": "...", "anomalies": [ { "type": "category|name|description|price", "severity": "low|medium|high", "field": "category", "current": "...", "suggested": "...", "reason": "...", "confidence": 0..1 } ] } ] }
If no anomalies, return empty anomalies array. Do not include any other text.`;

async function callAI(payload: unknown) {
  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: JSON.stringify(payload) },
      ],
      response_format: { type: "json_object" },
    }),
  });
  if (!r.ok) {
    const txt = await r.text();
    throw new Error(`AI ${r.status}: ${txt.slice(0, 300)}`);
  }
  const j = await r.json();
  const content = j.choices?.[0]?.message?.content ?? "{}";
  try { return JSON.parse(content); } catch { return { items: [] }; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = body.action || "scan";
  const limit = Math.min(Number(body.limit ?? 50), 200);
  const autoApply = Boolean(body.autoApply);
  const minConfidence = Number(body.minConfidence ?? 0.85);

  try {
    if (action === "list") {
      const { data } = await supabase.from("catalog_anomalies")
        .select("*").eq("status", body.status || "open")
        .order("severity", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(500);
      return json({ anomalies: data ?? [] });
    }
    if (action === "resolve") {
      const { error } = await supabase.from("catalog_anomalies")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", body.id);
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    // scan: pick a batch of parts (skip ones already scanned today optionally)
    const { data: parts } = await supabase.from("parts_new")
      .select("id, oem_number, name, category, description, price_with_vat, catalog_source")
      .not("name", "is", null)
      .limit(limit);

    const payload = (parts ?? []).map((p: any) => ({
      oem: p.oem_number, name: p.name, category: p.category,
      description: (p.description || "").slice(0, 240), price: p.price_with_vat,
    }));
    if (!payload.length) return json({ ok: true, scanned: 0 });

    // Chunk into groups of 20 to stay under token limits
    const findings: any[] = [];
    for (let i = 0; i < payload.length; i += 20) {
      const chunk = payload.slice(i, i + 20);
      try {
        const result = await callAI({ parts: chunk });
        for (const item of result.items ?? []) {
          const part = parts!.find((p: any) => p.oem_number === item.oem);
          if (!part) continue;
          for (const a of item.anomalies ?? []) {
            findings.push({
              part_id: part.id, oem_number: part.oem_number,
              anomaly_type: a.type, severity: a.severity || "medium",
              field: a.field, current_value: String(a.current ?? ""),
              suggested_value: String(a.suggested ?? ""),
              ai_reason: a.reason, ai_confidence: Number(a.confidence ?? 0),
              status: "open",
            });
          }
        }
      } catch (e) {
        console.error("AI chunk failed:", (e as Error).message);
      }
    }

    if (findings.length) {
      await supabase.from("catalog_anomalies").insert(findings);
    }

    let applied = 0;
    if (autoApply && findings.length) {
      for (const f of findings) {
        if (f.ai_confidence < minConfidence) continue;
        if (f.field === "category" && CANONICAL.includes(f.suggested_value)) {
          await supabase.from("parts_new").update({ category: f.suggested_value }).eq("id", f.part_id);
          await supabase.from("catalog_fix_log").insert({
            fix_type: "ai_apply_category", entity_type: "parts_new", entity_id: f.part_id,
            before_value: { category: f.current_value }, after_value: { category: f.suggested_value },
            reason: `AI ${Math.round(f.ai_confidence * 100)}%: ${f.ai_reason}`,
          });
          await supabase.from("catalog_anomalies").update({ status: "auto_applied", resolved_at: new Date().toISOString() })
            .eq("part_id", f.part_id).eq("field", "category").eq("status", "open");
          applied++;
        }
      }
    }

    return json({ ok: true, scanned: payload.length, found: findings.length, applied });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message) }, 500);
  }
});
