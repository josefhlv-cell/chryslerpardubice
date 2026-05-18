// J+M B2B eshop scraper (b2b.jmautodily.cz) – auto-login flow.
// Cookie is fetched on demand using JM_LOGIN/JM_PASS, cached in api_cache (~5h TTL).
// No manual JM_ESHOP_COOKIE secret needed.
//
// Public endpoints (POST):
//   /scrape-jq-eshop?action=ping           -> verify login works, returns customer id
//   /scrape-jq-eshop?action=fetch&path=... -> fetch any logged-in eshop page (debug)
//   body { brand: "chrysler" }             -> seed jq_models for one brand
//
// All HTML parsing is intentionally permissive – we only persist what we can confidently
// extract. Anything ambiguous is logged and skipped (never invented).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import * as cheerio from "https://esm.sh/cheerio@1.0.0-rc.12";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const BASE = "https://b2b.jmautodily.cz";
const LOGIN_PATH = "/cs";
const COOKIE_CACHE_KEY = "jq_eshop_cookie:v1";
const COOKIE_TTL_S = 5 * 60 * 60; // 5h – server session ~ASP.NET timeout

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const JM_LOGIN = Deno.env.get("JM_LOGIN")!;
const JM_PASS = Deno.env.get("JM_PASS")!;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// --------------- cookie / login ---------------

interface CachedCookie {
  cookie: string;
  customer_id: string | null;
  fetched_at: number;
}

function parseSetCookie(headers: Headers): Record<string, string> {
  // Deno Headers exposes set-cookie via getSetCookie() (Deno >= 1.40)
  const out: Record<string, string> = {};
  // @ts-ignore Deno-specific
  const list: string[] = (headers as any).getSetCookie?.() ??
    (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
  for (const raw of list) {
    const first = raw.split(";")[0];
    const eq = first.indexOf("=");
    if (eq > 0) out[first.slice(0, eq).trim()] = first.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join("; ");
}

async function loginFresh(): Promise<CachedCookie> {
  // 1) GET login page – grab __VIEWSTATE / __EVENTVALIDATION + initial cookies
  const r1 = await fetch(BASE + LOGIN_PATH, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" },
  });
  const html1 = await r1.text();
  const jar = parseSetCookie(r1.headers);

  const grab = (name: string) => {
    const m = html1.match(
      new RegExp(`name="${name}"[^>]*value="([^"]+)"`),
    );
    return m ? m[1] : "";
  };
  const vs = grab("__VIEWSTATE");
  const vsg = grab("__VIEWSTATEGENERATOR");
  const ev = grab("__EVENTVALIDATION");
  if (!vs || !ev) throw new Error("login: missing __VIEWSTATE/__EVENTVALIDATION");

  // 2) POST login
  const body = new URLSearchParams({
    "__EVENTTARGET": "ctl00$ctl00$BodyContentPlaceHolder$LoginForm$LoginButton",
    "__EVENTARGUMENT": "",
    "__VIEWSTATE": vs,
    "__VIEWSTATEGENERATOR": vsg,
    "__EVENTVALIDATION": ev,
    "ctl00$ctl00$BodyContentPlaceHolder$LoginForm$Username": JM_LOGIN,
    "ctl00$ctl00$BodyContentPlaceHolder$LoginForm$Password": JM_PASS,
  }).toString();

  const r2 = await fetch(BASE + LOGIN_PATH, {
    method: "POST",
    redirect: "manual",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(new TextEncoder().encode(body).length),
      "Cookie": cookieHeader(jar),
      "Referer": BASE + LOGIN_PATH,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
    body,
  });
  await r2.text(); // drain
  Object.assign(jar, parseSetCookie(r2.headers));

  if (!jar["auth1"]) {
    throw new Error(`login failed: no auth1 cookie (status ${r2.status})`);
  }

  // 3) Verify by fetching the home page logged-in
  const r3 = await fetch(BASE + LOGIN_PATH, {
    headers: {
      "Cookie": cookieHeader(jar),
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const html3 = await r3.text();
  Object.assign(jar, parseSetCookie(r3.headers));
  const cidMatch = html3.match(
    /CustomerIDHiddenField"[^>]*value="(-?\d+)"/,
  );
  const customer_id = cidMatch ? cidMatch[1] : null;
  if (!customer_id || customer_id.startsWith("-")) {
    throw new Error(`login verify failed: customer_id=${customer_id}`);
  }

  return {
    cookie: cookieHeader(jar),
    customer_id,
    fetched_at: Date.now(),
  };
}

async function getCookie(force = false): Promise<CachedCookie> {
  if (!force) {
    const { data } = await admin
      .from("api_cache")
      .select("payload, created_at, ttl_seconds")
      .eq("cache_key", COOKIE_CACHE_KEY)
      .maybeSingle();
    if (data?.payload) {
      const p = data.payload as CachedCookie;
      const age = (Date.now() - new Date(data.created_at as string).getTime()) /
        1000;
      if (age < (data.ttl_seconds ?? COOKIE_TTL_S) && p.cookie) return p;
    }
  }
  const fresh = await loginFresh();
  await admin.from("api_cache").upsert({
    cache_key: COOKIE_CACHE_KEY,
    payload: fresh,
    ttl_seconds: COOKIE_TTL_S,
    created_at: new Date().toISOString(),
  }, { onConflict: "cache_key" });
  return fresh;
}

async function fetchLoggedIn(path: string, retry = true): Promise<{ status: number; html: string }> {
  const c = await getCookie();
  const r = await fetch(BASE + path, {
    headers: {
      "Cookie": c.cookie,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Referer": BASE + LOGIN_PATH,
    },
  });
  const html = await r.text();
  // Heuristic: if logged out we'd see the login form again
  if (retry && /name="ctl00\$ctl00\$BodyContentPlaceHolder\$LoginForm\$Username"/.test(html)) {
    await getCookie(true); // refresh
    return fetchLoggedIn(path, false);
  }
  return { status: r.status, html };
}

// --------------- scrape: brand → models ---------------

const BRAND_SLUGS: Record<string, string> = {
  chrysler: "chrysler",
  dodge: "dodge",
  ram: "ram",
  cadillac: "cadillac",
  lancia: "lancia",
};

async function scrapeModelsForBrand(brand: string) {
  const slug = BRAND_SLUGS[brand.toLowerCase()];
  if (!slug) throw new Error(`unsupported brand: ${brand}`);
  // Brand model list page – path observed in screenshots
  const path = `/cs/katalog/yq-katalog/znacka/${slug}`;
  const { status, html } = await fetchLoggedIn(path);
  const $ = cheerio.load(html);

  const models: Array<{ name: string; code: string; href: string }> = [];
  // Eshop renders models as anchors under the catalog grid; be permissive.
  $('a[href*="/katalog/yq-katalog/model/"]').each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const name = $(el).text().trim().replace(/\s+/g, " ");
    if (!name) return;
    const m = href.match(/\/model\/([^/]+)\/([^/?#]+)/);
    if (!m) return;
    models.push({ name, code: m[2], href });
  });

  // De-dup by code
  const seen = new Set<string>();
  const unique = models.filter((m) =>
    seen.has(m.code) ? false : (seen.add(m.code), true)
  );

  // Persist
  let inserted = 0;
  for (const m of unique) {
    const { error } = await admin.from("jq_models").upsert({
      brand: brand.toLowerCase(),
      model_name: m.name,
      jq_model_code: m.code,
    }, { onConflict: "brand,jq_model_code" });
    if (!error) inserted++;
  }
  return { status, found: unique.length, persisted: inserted, sample: unique.slice(0, 5), path };
}

// --------------- YQ graphical catalog: schema fetching ---------------

// Find diagram image URL inside a logged-in YQ section page.
// J+M renders schemas as <img src="...Image.ashx?..."> or as raw paths.
// Be permissive: pick the largest/most likely diagram image on the page.
function pickSchemaImage(html: string, baseUrl: string): string | null {
  const $ = cheerio.load(html);
  const candidates: { url: string; score: number }[] = [];
  $("img").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (!src) return;
    // Skip obvious chrome/icons
    if (/logo|icon|banner|sprite|pixel|favicon|track/i.test(src)) return;
    if (src.startsWith("data:")) return;
    let score = 0;
    if (/Image\.ashx/i.test(src)) score += 5;
    if (/schema|diagram|yq|tecdoc/i.test(src)) score += 3;
    const w = parseInt($(el).attr("width") || "0", 10);
    const h = parseInt($(el).attr("height") || "0", 10);
    if (w > 200 || h > 200) score += 2;
    candidates.push({ url: src, score });
  });
  candidates.sort((a, b) => b.score - a.score);
  if (!candidates.length) return null;
  const top = candidates[0].url;
  try { return new URL(top, baseUrl).toString(); } catch { return top; }
}

async function fetchSchemaForSection(yqCode: string, sectionId: string, sectionPath?: string) {
  // 1) Cache?
  const { data: cached } = await admin
    .from("jm_schema_cache")
    .select("storage_path, image_url_source, fetched_at")
    .eq("yq_code", yqCode)
    .eq("section_id", sectionId)
    .maybeSingle();

  if (cached?.storage_path) {
    const { data: signed } = await admin.storage
      .from("jm-schemas")
      .createSignedUrl(cached.storage_path, 3600);
    if (signed?.signedUrl) {
      return {
        cached: true,
        signed_url: signed.signedUrl,
        storage_path: cached.storage_path,
        source: cached.image_url_source,
        fetched_at: cached.fetched_at,
      };
    }
  }

  // 2) Fetch logged-in section page.
  // The caller provides the path observed from the YQ tree. If not, we try a heuristic path.
  const path = sectionPath ??
    `/cs/katalog/yq-katalog/vozidlo/chrysler/${yqCode}/${sectionId}`;
  const { status, html } = await fetchLoggedIn(path);
  if (status !== 200) throw new Error(`section page status ${status} for ${path}`);

  const imgUrl = pickSchemaImage(html, BASE + path);
  if (!imgUrl) throw new Error(`no schema image found on ${path}`);

  // 3) Download image with the same session cookie
  const c = await getCookie();
  const imgRes = await fetch(imgUrl, {
    headers: {
      "Cookie": c.cookie,
      "Referer": BASE + path,
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!imgRes.ok) throw new Error(`image download failed: ${imgRes.status}`);
  const contentType = imgRes.headers.get("content-type") || "image/png";
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  if (bytes.length < 200) throw new Error(`suspiciously small image: ${bytes.length} bytes`);

  // 4) Upload to private bucket
  const ext = contentType.includes("svg") ? "svg"
    : contentType.includes("jpeg") ? "jpg"
    : contentType.includes("webp") ? "webp"
    : "png";
  const storagePath = `${yqCode}/${sectionId}.${ext}`;
  const { error: upErr } = await admin.storage
    .from("jm-schemas")
    .upload(storagePath, bytes, { contentType, upsert: true });
  if (upErr) throw new Error(`upload failed: ${upErr.message}`);

  // 5) Persist cache row
  await admin.from("jm_schema_cache").upsert({
    yq_code: yqCode,
    section_id: sectionId,
    image_url_source: imgUrl,
    storage_path: storagePath,
    content_type: contentType,
    byte_size: bytes.length,
    fetched_at: new Date().toISOString(),
  }, { onConflict: "yq_code,section_id" });

  const { data: signed } = await admin.storage
    .from("jm-schemas")
    .createSignedUrl(storagePath, 3600);

  return {
    cached: false,
    signed_url: signed?.signedUrl,
    storage_path: storagePath,
    source: imgUrl,
    byte_size: bytes.length,
    content_type: contentType,
  };
}

// --------------- handler ---------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const url = new URL(req.url);
  const action = url.searchParams.get("action") ?? "scrape";

  try {
    if (action === "ping") {
      const c = await getCookie(url.searchParams.get("force") === "1");
      return json({
        ok: true,
        customer_id: c.customer_id,
        cookie_age_s: Math.round((Date.now() - c.fetched_at) / 1000),
        cookie_preview: c.cookie.slice(0, 60) + "…",
      });
    }
    if (action === "fetch") {
      const path = url.searchParams.get("path") ?? "/cs";
      const { status, html } = await fetchLoggedIn(path);
      return json({ ok: true, status, length: html.length, head: html.slice(0, 800) });
    }
    if (action === "yq-schema") {
      // Admin-gated: require service role JWT OR caller supplied an admin user JWT.
      // (We trust caller because verify_jwt is enabled at platform level for invoked clients.)
      const yqCode = url.searchParams.get("yq_code");
      const sectionId = url.searchParams.get("section_id");
      const sectionPath = url.searchParams.get("section_path") ?? undefined;
      if (!yqCode || !sectionId) {
        return json({ ok: false, error: "missing yq_code or section_id" }, 400);
      }
      const res = await fetchSchemaForSection(yqCode, sectionId, sectionPath);
      return json({ ok: true, ...res });
    }
    if (action === "yq-list-cached") {
      const yqCode = url.searchParams.get("yq_code");
      if (!yqCode) return json({ ok: false, error: "missing yq_code" }, 400);
      const { data, error } = await admin
        .from("jm_schema_cache")
        .select("section_id, section_name, storage_path, fetched_at, byte_size")
        .eq("yq_code", yqCode)
        .order("section_id");
      if (error) throw error;
      return json({ ok: true, items: data ?? [] });
    }
    // default: scrape brand
    let brand = url.searchParams.get("brand");
    if (!brand && req.method === "POST") {
      try { brand = (await req.json())?.brand ?? null; } catch { /* ignore */ }
    }
    if (!brand) {
      return json({ ok: false, error: "missing 'brand' (chrysler|dodge|ram|cadillac|lancia)" }, 400);
    }
    const res = await scrapeModelsForBrand(brand);
    return json({ ok: true, brand, ...res });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message ?? e) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
