// supabase/functions/bulk-scrape-jq/index.ts
// MVP bulk-scrape J+M YQ B2B eshopu pro Chrysler/Dodge/RAM.
// Používá Firecrawl + B2B cookie session (admin uloží JM_ESHOP_COOKIE jako secret po přihlášení).
// Admin-only. Async přes EdgeRuntime.waitUntil; progress v jq_scrape_progress.

import { createClient } from "npm:@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const FIRECRAWL_KEY = Deno.env.get("FIRECRAWL_API_KEY");
const JM_ESHOP_COOKIE = Deno.env.get("JM_ESHOP_COOKIE") || "";

const JM_BASE = "https://eshop.jmautodily.cz";
const BRANDS = ["chrysler", "dodge", "ram"];

interface FirecrawlScrapeResult {
  success: boolean;
  data?: { html?: string; markdown?: string; links?: string[] };
  error?: string;
}

async function firecrawlScrape(
  url: string,
  formats: string[] = ["html", "links"],
): Promise<FirecrawlScrapeResult> {
  if (!FIRECRAWL_KEY) {
    return { success: false, error: "FIRECRAWL_API_KEY missing" };
  }
  const headers: Record<string, string> = {};
  if (JM_ESHOP_COOKIE) headers["Cookie"] = JM_ESHOP_COOKIE;

  const res = await fetch("https://api.firecrawl.dev/v2/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${FIRECRAWL_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      formats,
      onlyMainContent: false,
      waitFor: 1500,
      headers,
    }),
  });
  const json = await res.json();
  if (!res.ok) return { success: false, error: json?.error || res.statusText };
  return { success: true, data: json.data };
}

// --- HTML parsery (regex – bez DOMu v Deno edge) ---
// Tyto jsou velmi konzervativní MVP. Po prvních scrape-ech se dají vyladit.

function parseModels(html: string, brand: string) {
  // Hledej odkazy na modely pod /cs/katalog/yq-katalog/model/{brand}/
  const re = new RegExp(
    `href="(/cs/katalog/yq-katalog/model/${brand}/[A-Z0-9_\\-]+)"[^>]*>([^<]+)<`,
    "gi",
  );
  const out: { name: string; slug: string; jqId: string; href: string }[] = [];
  const seen = new Set<string>();
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    if (seen.has(href)) continue;
    seen.add(href);
    const jqId = href.split("/").pop() || "";
    const name = m[2].replace(/\s+/g, " ").trim();
    if (name) out.push({ name, slug: jqId.toLowerCase(), jqId, href });
  }
  return out;
}

function parseEngines(html: string) {
  // Engine row obsahuje výkon kW/HP a kód motoru. Velmi přibližné.
  const re =
    /href="([^"]*\/yq-katalog\/[^"]*)"[^>]*>\s*([\s\S]*?)\s*<\/a>[\s\S]{0,400}?(\d{2,4})\s*kW[\s\S]{0,80}?(\d{2,4})\s*(?:k|HP|PS)/gi;
  const out: {
    code: string;
    href: string;
    powerKw: number;
    powerHp: number;
  }[] = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1];
    const code = m[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!code) continue;
    out.push({
      code: code.slice(0, 60),
      href,
      powerKw: parseInt(m[3], 10),
      powerHp: parseInt(m[4], 10),
    });
  }
  return out;
}

function parseCategories(html: string) {
  // Přibližný strom: text + počet v závorce + odkaz
  const re =
    /href="([^"]+)"[^>]*>\s*([^<\(]+?)\s*(?:\((\d+)\))?\s*<\/a>/g;
  const out: { name: string; href: string; count: number }[] = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    const name = m[2].trim();
    if (name.length < 3 || name.length > 80) continue;
    if (!/[\u00C0-\u017F\u0400-\u04FFa-zA-Z]/.test(name)) continue;
    out.push({
      name,
      href: m[1],
      count: m[3] ? parseInt(m[3], 10) : 0,
    });
  }
  return out;
}

// --- Hlavní worker ---

async function runScrape(brand: string) {
  const sb = createClient(SUPABASE_URL, SERVICE_KEY);
  const progressId = crypto.randomUUID();

  await sb.from("jq_scrape_progress").insert({
    id: progressId,
    brand,
    status: "in_progress",
    stage: "models",
    started_at: new Date().toISOString(),
  });

  try {
    // 1. Modely
    const modelsUrl = `${JM_BASE}/cs/katalog/yq-katalog/vyrobce/${brand}`;
    const modelsRes = await firecrawlScrape(modelsUrl);
    if (!modelsRes.success) throw new Error(modelsRes.error || "scrape failed");
    const models = parseModels(modelsRes.data?.html || "", brand);

    await sb
      .from("jq_scrape_progress")
      .update({ total_items: models.length, stage: "engines" })
      .eq("id", progressId);

    let done = 0;
    for (const m of models) {
      const { data: savedModel } = await sb
        .from("jq_models")
        .upsert(
          {
            brand: brand.charAt(0).toUpperCase() + brand.slice(1),
            model_name: m.name,
            model_slug: m.slug,
            jq_model_id: m.jqId,
            scraped_at: new Date().toISOString(),
          },
          { onConflict: "brand,model_name" },
        )
        .select("id")
        .single();

      if (!savedModel) continue;

      // 2. Motorizace
      const enginesRes = await firecrawlScrape(`${JM_BASE}${m.href}`);
      const engines = parseEngines(enginesRes.data?.html || "");
      for (const e of engines) {
        await sb.from("jq_engines").upsert(
          {
            model_id: savedModel.id,
            engine_code: e.code,
            power_kw: e.powerKw,
            power_hp: e.powerHp,
            jq_engine_id: e.href.split("/").pop(),
            scraped_at: new Date().toISOString(),
          },
          { onConflict: "model_id,engine_code,submodel" },
        );
      }

      done++;
      await sb
        .from("jq_scrape_progress")
        .update({ done_items: done })
        .eq("id", progressId);
    }

    await sb
      .from("jq_scrape_progress")
      .update({
        status: "done",
        finished_at: new Date().toISOString(),
      })
      .eq("id", progressId);
  } catch (err) {
    await sb
      .from("jq_scrape_progress")
      .update({
        status: "error",
        error_message: String(err),
        finished_at: new Date().toISOString(),
      })
      .eq("id", progressId);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth – jen admin
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
    if (!claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleCheck } = await sbAdmin.rpc("has_role", {
      _user_id: claims.claims.sub,
      _role: "admin",
    });
    if (!roleCheck) {
      return new Response(JSON.stringify({ error: "Admin only" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const brands: string[] = body.brands?.length ? body.brands : BRANDS;
    const preview = body.preview === true;

    if (preview) {
      // Náhled: stáhni jen modely první značky a vrať bez ukládání
      const brand = brands[0];
      const r = await firecrawlScrape(
        `${JM_BASE}/cs/katalog/yq-katalog/vyrobce/${brand}`,
      );
      if (!r.success) {
        return new Response(JSON.stringify({ error: r.error }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const models = parseModels(r.data?.html || "", brand);
      return new Response(
        JSON.stringify({ preview: true, brand, count: models.length, models }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Spusť async
    // @ts-ignore EdgeRuntime
    EdgeRuntime.waitUntil(
      (async () => {
        for (const b of brands) await runScrape(b);
      })(),
    );

    return new Response(
      JSON.stringify({ success: true, started: brands }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
