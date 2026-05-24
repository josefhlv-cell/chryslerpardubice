// kitoem-price-sync
// Ceny z vernostsevyplaci.cz pro každý unikátní OEM v `kitoem_parts`.
// Reuses K-prefix variant logiku z `price-sync` (1:1), ale píše do kitoem_parts.
// Nepřepisuje parts_new ani nic jiného. Voláno v dávkách (batchSize default 200).

import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const CATALOG_URL = "https://www.vernostsevyplaci.cz/cnd/";
const CONCURRENCY = 15;
const MAX_RETRIES = 3;
const MIN_DELAY = 150;
const MAX_PRICE = 5_000_000;

const UAS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
];
const randomUA = () => UAS[Math.floor(Math.random() * UAS.length)];

function json(d: unknown, status = 200) {
  return new Response(JSON.stringify(d), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ── Login ───────────────────────────────────────────────────────────────────
async function loginToCatalog(password: string): Promise<string | null> {
  const ua = randomUA();
  const r = await fetch(CATALOG_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": ua },
    body: `password=${encodeURIComponent(password)}&submit-password=P%C5%99ihl%C3%A1sit`,
    redirect: "manual",
  });
  const cookies = r.headers.getSetCookie?.() || [];
  const cookieStr = cookies.map((c) => c.split(";")[0]).join("; ");

  let html = "";
  if (r.status >= 300 && r.status < 400) {
    const loc = r.headers.get("location") || CATALOG_URL;
    const r2 = await fetch(loc, { headers: { Cookie: cookieStr, "User-Agent": ua } });
    html = await r2.text();
  } else {
    html = await r.text();
  }
  const ok = html.includes('name="search"') || html.includes("Zadejte") || html.includes("find-part");
  return ok ? cookieStr : null;
}

async function loginWithRetry(pw: string): Promise<string | null> {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    const c = await loginToCatalog(pw);
    if (c) return c;
    await new Promise((r) => setTimeout(r, 1000 * i));
  }
  return null;
}

// ── Variants (1:1 s price-sync) ─────────────────────────────────────────────
function buildVariants(partNumber: string): string[] {
  const cleanPN = partNumber.replace(/[\s-]/g, "").toUpperCase();
  const stripLeading = (s: string) => s.replace(/^0+(?=.)/, "");
  const noZeros = stripLeading(cleanPN);
  const no00K = cleanPN.replace(/^00K/, "K");
  const noZerosNo00K = stripLeading(no00K);
  const core = noZerosNo00K.replace(/^K/, "");
  const padded = core.length <= 9 ? `0${core}` : core;
  const alreadyK = /^K\d/.test(cleanPN) || /^K\d/.test(no00K);
  const list = alreadyK
    ? [no00K, noZerosNo00K, cleanPN, noZeros, `K${core}`, `K${padded}`, core, `6${core}`, `SP${core}`]
    : [`K${core}`, `K${padded}`, `K${cleanPN}`, core, padded, cleanPN, noZeros, `6${core}`, `SP${core}`];
  return [...new Set(list.filter(Boolean))];
}

function verifyPartInResults(html: string, oem: string, variant: string): boolean {
  const clean = oem.replace(/\s/g, "");
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<[^>]*>/g, " ");
  for (const p of [clean, oem, variant]) {
    if (p.length >= 5 && text.includes(p)) return true;
  }
  const re = new RegExp(`<td[^>]*>[^<]*${clean.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^<]*</td>`, "i");
  return re.test(html);
}

function extractPricesDOM(html: string): number[] {
  const prices: number[] = [];
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (doc) {
      for (const td of doc.querySelectorAll("td")) {
        const t = (td as any).textContent || "";
        const m = t.match(/(\d[\d\s]*[,.]\d{2})/);
        if (m) {
          const p = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
          if (p > 10 && p < MAX_PRICE) prices.push(p);
        }
      }
    }
  } catch { /* ignore */ }
  const text = html.replace(/<[^>]*>/g, " ");
  const kc = /(?<!\d)(\d{1,3}(?:\s\d{3})*[,.]\d{2})\s*Kč/gi;
  let m;
  while ((m = kc.exec(text)) !== null) {
    const p = parseFloat(m[1].replace(/\s/g, "").replace(",", "."));
    if (p > 10 && p < MAX_PRICE) prices.push(p);
  }
  return [...new Set(prices)];
}

function pickBestPrices(prices: number[]): { withVat: number; withoutVat: number } {
  const sorted = [...prices].sort((a, b) => a - b);
  if (sorted.length >= 2) {
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        const r = sorted[j] / sorted[i];
        if (r > 1.18 && r < 1.24) return { withoutVat: sorted[i], withVat: sorted[j] };
      }
    }
    return { withoutVat: sorted[sorted.length - 2], withVat: sorted[sorted.length - 1] };
  }
  return { withVat: sorted[0], withoutVat: Math.round((sorted[0] / 1.21) * 100) / 100 };
}

// ── Per-OEM processing ──────────────────────────────────────────────────────
async function lookupPrice(oem: string, cookie: string): Promise<{
  found: boolean; withVat: number; withoutVat: number; variant: string | null;
}> {
  const ua = randomUA();
  for (const v of buildVariants(oem)) {
    const r = await fetch(CATALOG_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: cookie,
        "User-Agent": ua,
      },
      body: `find-part=${encodeURIComponent(v)}&search-part=Vyhledat`,
    });
    const html = await r.text();
    if (verifyPartInResults(html, oem, v)) {
      const prices = extractPricesDOM(html);
      if (prices.length) {
        const { withVat, withoutVat } = pickBestPrices(prices);
        return { found: true, withVat, withoutVat, variant: v };
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return { found: false, withVat: 0, withoutVat: 0, variant: null };
}

// ── Pool ─────────────────────────────────────────────────────────────────────
async function runPool<T>(items: string[], fn: (it: string) => Promise<T>): Promise<T[]> {
  const out: T[] = new Array(items.length);
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      const idx = i++;
      await new Promise((r) => setTimeout(r, MIN_DELAY + Math.random() * 200));
      try {
        out[idx] = await fn(items[idx]);
      } catch (e) {
        out[idx] = { error: String(e) } as unknown as T;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
  return out;
}

// ── Main handler ────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const PASS = Deno.env.get("CATALOG_PASS");
  if (!PASS) return json({ error: "CATALOG_PASS not set" }, 500);

  const supabase = createClient(SB_URL, SVC);

  let body: { batchSize?: number; mode?: "auto" | "force"; oems?: string[] } = {};
  try { body = await req.json(); } catch { /* GET ok */ }
  const batchSize = Math.min(Math.max(body.batchSize ?? 200, 1), 500);
  const mode = body.mode ?? "auto";

  // Select OEMs to process
  let oems: string[] = body.oems ?? [];
  if (oems.length === 0) {
    let q = supabase
      .from("kitoem_parts")
      .select("oem_number")
      .order("oem_number", { ascending: true })
      .limit(batchSize * 6); // overshoot, dedupe in JS
    if (mode === "auto") q = q.is("price_checked_at", null);
    const { data, error } = await q;
    if (error) return json({ error: error.message }, 500);
    const seen = new Set<string>();
    for (const r of data || []) {
      if (r.oem_number && !seen.has(r.oem_number)) {
        seen.add(r.oem_number);
        oems.push(r.oem_number);
        if (oems.length >= batchSize) break;
      }
    }
  }

  if (oems.length === 0) {
    // Count remaining
    const { count } = await supabase
      .from("kitoem_parts")
      .select("oem_number", { count: "exact", head: true })
      .is("price_checked_at", null);
    return json({ success: true, done: true, processed: 0, remaining: count ?? 0 });
  }

  const cookie = await loginWithRetry(PASS);
  if (!cookie) return json({ error: "catalog login failed" }, 502);

  const t0 = Date.now();
  const results = await runPool(oems, (oem) => lookupPrice(oem, cookie));

  let found = 0, notFound = 0, errors = 0;
  const nowIso = new Date().toISOString();

  // Batch updates: group by status (Supabase doesn't support bulk UPDATE w/ varying values easily,
  // so we update one OEM at a time — still fast vs scraping cost).
  for (let i = 0; i < oems.length; i++) {
    const oem = oems[i];
    const r = results[i] as any;
    if (r?.error) { errors++; continue; }
    if (r.found) {
      found++;
      await supabase
        .from("kitoem_parts")
        .update({
          price_with_vat: r.withVat,
          price_without_vat: r.withoutVat,
          price_found: true,
          price_checked_at: nowIso,
          price_variant_used: r.variant,
        })
        .eq("oem_number", oem);
    } else {
      notFound++;
      await supabase
        .from("kitoem_parts")
        .update({
          price_with_vat: 0,
          price_without_vat: 0,
          price_found: false,
          price_checked_at: nowIso,
          price_variant_used: null,
        })
        .eq("oem_number", oem);
    }
  }

  // Get remaining count
  const { count: remaining } = await supabase
    .from("kitoem_parts")
    .select("oem_number", { count: "exact", head: true })
    .is("price_checked_at", null);

  // Distinct remaining (approx — true distinct done by next call's selector)
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  return json({
    success: true,
    processed: oems.length,
    found,
    notFound,
    errors,
    elapsedSec: parseFloat(elapsed),
    rowsRemainingUnchecked: remaining ?? 0,
  });
});
