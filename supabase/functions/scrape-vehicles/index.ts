// scrape-vehicles - Chrysler Pardubice (chrysler.cz) — listing scraper v3
// New structure (2026-04): cards live at /vozidla, each card links to
// /vozidla/{uuid}. We scrape the listing markdown, parse VIN/price/title/mileage
// directly from the listing (it has everything we need), and upsert into
// `vehicles` keyed by VIN. We deactivate any existing vehicle whose VIN is no
// longer on the site instead of deleting — admin can review.
import { createClient } from "npm:@supabase/supabase-js@2";

const STATUS_TYPE = "vehicle_sync_status";
const STATUS_TTL_SECONDS = 60 * 60;
const LISTING_URL = "https://www.chrysler.cz/vozidla";
const VEHICLE_DETAIL_BASE = "https://www.chrysler.cz/vozidla/";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type VehicleRecord = {
  external_id: string; // uuid from chrysler.cz URL
  brand: string;
  model: string;
  year: number;
  price: number; // CZK with VAT (preferred), or just price when only one shown
  mileage: number | null;
  fuel: string | null;
  vin: string | null;
  title: string;
  ev_no: string | null;
  images: string[];
  listing_url: string;
};

type JobStatus = {
  status: "running" | "completed" | "failed";
  phase: "queued" | "scraping" | "extracting" | "saving" | "done" | "error";
  progress: number;
  message: string;
  error?: string;
  vehicles?: number;
  updated?: number;
  created?: number;
  added?: number;
  removed?: number;
  started_at?: string;
  completed_at?: string;
  user_id?: string | null;
  trigger?: "manual" | "cron";
};

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await readJsonBody(req);
    const cronSecret = req.headers.get("x-cron-secret");
    const isCron = body?.trigger === "cron" && cronSecret === Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    let userId: string | null = null;
    let adminClient: ReturnType<typeof createClient>;

    if (isCron) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
      const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
      adminClient = createClient(supabaseUrl, serviceRoleKey);
    } else {
      const ctx = await requireAdmin(req);
      userId = ctx.user.id;
      adminClient = ctx.adminClient;
    }

    // Status poll
    if (typeof body?.jobId === "string" && body.jobId.trim()) {
      const status = await getJobStatus(adminClient, body.jobId.trim());
      if (!status) return json({ success: false, error: "Status synchronizace nebyl nalezen." }, 404);
      return json({ success: true, jobId: body.jobId.trim(), ...status });
    }

    // Don't allow two manual runs in parallel for same user
    if (!isCron && userId) {
      const existing = await getRunningJob(adminClient, userId);
      if (existing) {
        return json({
          success: true,
          queued: true,
          jobId: existing.jobId,
          ...existing.status,
          message: "Aktualizace už běží, navazuji na existující úlohu.",
        });
      }
    }

    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlApiKey) return json({ success: false, error: "Firecrawl není nakonfigurován." }, 500);

    const jobId = crypto.randomUUID();
    const initialStatus: JobStatus = {
      status: "running",
      phase: "queued",
      progress: 5,
      message: isCron ? "Hodinová automatická synchronizace spuštěna." : "Synchronizace nabídky vozů spuštěna.",
      started_at: new Date().toISOString(),
      user_id: userId,
      trigger: isCron ? "cron" : "manual",
    };
    await upsertJobStatus(adminClient, jobId, initialStatus);

    const edgeRuntime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
    const runPromise = runVehicleSync(jobId, adminClient, firecrawlApiKey, userId, isCron);
    if (edgeRuntime?.waitUntil) edgeRuntime.waitUntil(runPromise);
    else runPromise.catch((err) => console.error("Background sync failed:", err));

    return json({ success: true, queued: true, jobId, ...initialStatus });
  } catch (error) {
    console.error("scrape-vehicles request error:", error);
    if (error instanceof HttpError) return json({ success: false, error: error.message }, error.status);
    return json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json(); } catch { return {}; }
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new HttpError(401, "Unauthorized");

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
  const { data: { user }, error: authError } = await authClient.auth.getUser();
  if (authError || !user) throw new HttpError(401, "Unauthorized");

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleData, error: roleError } = await adminClient
    .from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
  if (roleError) throw new HttpError(500, roleError.message);
  if (!roleData) throw new HttpError(403, "Forbidden: admin required");
  return { user, adminClient };
}

async function getRunningJob(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data } = await supabase
    .from("api_cache").select("cache_key, data, created_at")
    .eq("cache_type", STATUS_TYPE).contains("data", { status: "running", user_id: userId })
    .order("created_at", { ascending: false }).limit(1);
  const row = data?.[0];
  if (!row?.cache_key || typeof row.data !== "object" || !row.data) return null;
  return { jobId: row.cache_key, status: row.data as JobStatus };
}

async function getJobStatus(supabase: ReturnType<typeof createClient>, jobId: string) {
  const { data, error } = await supabase
    .from("api_cache").select("data").eq("cache_type", STATUS_TYPE).eq("cache_key", jobId)
    .order("created_at", { ascending: false }).limit(1);
  if (error) throw new Error(error.message);
  return data?.[0]?.data && typeof data[0].data === "object" ? (data[0].data as JobStatus) : null;
}

async function upsertJobStatus(supabase: ReturnType<typeof createClient>, jobId: string, status: JobStatus) {
  const { data: existing } = await supabase
    .from("api_cache").select("id").eq("cache_type", STATUS_TYPE).eq("cache_key", jobId)
    .order("created_at", { ascending: false }).limit(1);
  const payload = { cache_type: STATUS_TYPE, cache_key: jobId, data: status, ttl_seconds: STATUS_TTL_SECONDS };
  if (existing?.[0]?.id) {
    const { error } = await supabase.from("api_cache").update(payload).eq("id", existing[0].id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("api_cache").insert(payload);
    if (error) throw new Error(error.message);
  }
}

// ---------- core sync ----------
async function runVehicleSync(
  jobId: string,
  supabase: ReturnType<typeof createClient>,
  firecrawlApiKey: string,
  userId: string | null,
  isCron: boolean,
) {
  const startedAt = new Date().toISOString();
  try {
    await upsertJobStatus(supabase, jobId, {
      status: "running", phase: "scraping", progress: 20,
      message: "Stahuji nabídku vozů z chrysler.cz/vozidla…",
      started_at: startedAt, user_id: userId, trigger: isCron ? "cron" : "manual",
    });

    const scrape = await firecrawlRequest(firecrawlApiKey, {
      url: LISTING_URL, formats: ["markdown"], onlyMainContent: true,
      timeout: 90000, waitFor: 5000,
    });
    const markdown: string = scrape?.data?.markdown || scrape?.markdown || "";
    if (!markdown || markdown.length < 200) {
      throw new Error("Stránka /vozidla nevrátila dostatek obsahu.");
    }

    await upsertJobStatus(supabase, jobId, {
      status: "running", phase: "extracting", progress: 55,
      message: "Parsuji nabídku a porovnávám s databází…",
      started_at: startedAt, user_id: userId, trigger: isCron ? "cron" : "manual",
    });

    const vehicles = parseListingMarkdown(markdown);
    console.log(`Parsed ${vehicles.length} vehicles from listing`);

    await upsertJobStatus(supabase, jobId, {
      status: "running", phase: "saving", progress: 80,
      message: vehicles.length ? `Nalezeno ${vehicles.length} vozů, ukládám…` : "Žádné vozy k uložení.",
      vehicles: vehicles.length, started_at: startedAt, user_id: userId, trigger: isCron ? "cron" : "manual",
    });

    if (!vehicles.length) {
      await upsertJobStatus(supabase, jobId, {
        status: "completed", phase: "done", progress: 100,
        message: "Synchronizace dokončena – stránka neobsahuje žádné vozy.",
        vehicles: 0, updated: 0, created: 0, added: 0, removed: 0,
        completed_at: new Date().toISOString(), user_id: userId, trigger: isCron ? "cron" : "manual",
      });
      return;
    }

    // Upsert by VIN (preferred) or by external_id+brand+model fallback
    let updated = 0;
    let created = 0;
    const seenVins = new Set<string>();
    const seenExternalIds = new Set<string>();

    for (const v of vehicles) {
      seenExternalIds.add(v.external_id);
      if (v.vin) seenVins.add(v.vin);

      const payload: Record<string, unknown> = {
        brand: v.brand, model: v.model, year: v.year, price: v.price,
        mileage: v.mileage, fuel: v.fuel, vin: v.vin,
        description: v.title, // use title as short description; full text not on listing
        images: v.images, listing_url: v.listing_url,
        is_active: true, updated_at: new Date().toISOString(),
      };

      // 1) try by VIN
      if (v.vin) {
        const { data: byVin } = await supabase.from("vehicles").select("id").eq("vin", v.vin).limit(1);
        if (byVin && byVin.length > 0) {
          const { error } = await supabase.from("vehicles").update(payload).eq("id", byVin[0].id);
          if (error) throw new Error(error.message);
          updated++;
          continue;
        }
      }
      // 2) try by listing_url (uuid is in URL)
      const { data: byUrl } = await supabase.from("vehicles").select("id").eq("listing_url", v.listing_url).limit(1);
      if (byUrl && byUrl.length > 0) {
        const { error } = await supabase.from("vehicles").update(payload).eq("id", byUrl[0].id);
        if (error) throw new Error(error.message);
        updated++;
        continue;
      }
      // 3) insert
      const { error } = await supabase.from("vehicles").insert(payload);
      if (error) throw new Error(error.message);
      created++;
    }

    // Deactivate vehicles that disappeared from the listing
    const vinsArr = Array.from(seenVins);
    const urlsArr = Array.from(seenExternalIds).map((id) => VEHICLE_DETAIL_BASE + id);

    let removed = 0;
    if (vinsArr.length > 0 || urlsArr.length > 0) {
      // Build OR filter: rows whose VIN is NOT in seen AND whose listing_url is NOT in seen
      const { data: stale, error: staleErr } = await supabase
        .from("vehicles").select("id, vin, listing_url").eq("is_active", true);
      if (!staleErr && stale) {
        const toDeactivate = stale.filter((r: any) => {
          const vinSeen = r.vin && vinsArr.includes(r.vin);
          const urlSeen = r.listing_url && urlsArr.includes(r.listing_url);
          return !vinSeen && !urlSeen;
        }).map((r: any) => r.id);
        if (toDeactivate.length > 0) {
          const { error } = await supabase.from("vehicles").update({ is_active: false })
            .in("id", toDeactivate);
          if (!error) removed = toDeactivate.length;
        }
      }
    }

    const message = `Aktualizováno: ${updated}, Nových: ${created}, Deaktivováno: ${removed}, Aktivních celkem: ${vehicles.length}`;
    console.log(message);

    await upsertJobStatus(supabase, jobId, {
      status: "completed", phase: "done", progress: 100, message,
      vehicles: vehicles.length, updated, created, added: created, removed,
      completed_at: new Date().toISOString(), user_id: userId, trigger: isCron ? "cron" : "manual",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("scrape-vehicles background error:", error);
    try {
      await upsertJobStatus(supabase, jobId, {
        status: "failed", phase: "error", progress: 100, message, error: message,
        completed_at: new Date().toISOString(), user_id: userId, trigger: isCron ? "cron" : "manual",
      });
    } catch (e) { console.error("Failed to persist scrape status:", e); }
  }
}

// ---------- markdown listing parser ----------
// Each card looks roughly like:
//   [![Chrysler Pacifica 3,6 4x4 AWD DVD RADAR Stype 2021](https://.../vehicles/{uuid}/0.jpg)\
//   ![](.../logo-pardubice...)\
//   Skladem\
//   **Chrysler Pacifica 3,6 4x4 AWD DVD RADAR Stype 2021**\
//   154 099 km Ba 95VIN: 2C4RC3FG8MR525677\
//   Ev.č.25\
//   730 000 Kč](https://www.chrysler.cz/vozidla/{uuid})
// or with both prices (Bez DPH / S DPH).
function parseListingMarkdown(md: string): VehicleRecord[] {
  const out: VehicleRecord[] = [];
  // Split by detail-link occurrences. We use the closing `](https://www.chrysler.cz/vozidla/{uuid})` as separator.
  const cardRe = /\[!\[([^\]]+)\]\(([^)]+)\)([\s\S]*?)\]\((https:\/\/www\.chrysler\.cz\/vozidla\/([0-9a-f-]{36}))\)/g;

  let m: RegExpExecArray | null;
  while ((m = cardRe.exec(md)) !== null) {
    try {
      const altTitle = (m[1] || "").trim();
      const firstImg = (m[2] || "").trim();
      const innerRaw = m[3] || "";
      const detailUrl = m[4];
      const uuid = m[5];

      // Inner block contains: optional logo image, "Skladem" badge, **title**, km/fuel/VIN, ev.č., price(s)
      const inner = innerRaw.replace(/\\\n/g, "\n").replace(/\\(.)/g, "$1");

      // Title
      const titleMatch = inner.match(/\*\*([^*]+)\*\*/);
      const title = (titleMatch?.[1] || altTitle).trim();

      // Year (last 4-digit number 19xx-20xx in title)
      const yearMatch = title.match(/(19|20)\d{2}/g);
      const year = yearMatch ? Number(yearMatch[yearMatch.length - 1]) : new Date().getFullYear();

      // Brand & model — first word is brand, rest up to first 4-digit/engine token is model
      const { brand, model } = parseBrandModel(title);

      // Mileage
      const mileageMatch = inner.match(/([\d\s\u00a0]+)\s*km/i);
      const mileage = mileageMatch ? Number(mileageMatch[1].replace(/[\s\u00a0]/g, "")) : null;

      // Fuel
      const fuelMatch = inner.match(/km\s+([^V\n]+?)(?=VIN|$)/i);
      const fuel = fuelMatch ? fuelMatch[1].trim().replace(/\s+/g, " ") : null;

      // VIN
      const vinMatch = inner.match(/VIN:\s*([A-HJ-NPR-Z0-9]{11,17})/i);
      const vin = vinMatch ? vinMatch[1].toUpperCase() : null;

      // Ev.č.
      const evMatch = inner.match(/Ev\.č\.\s*([A-Za-z0-9]+)/i);
      const evNo = evMatch ? evMatch[1] : null;

      // Prices — prefer "S DPH" if present, else single price.
      // Examples: "730 000 Kč", "599 000 KčBez DPH\nS DPH: 724 790 Kč"
      const sDphMatch = inner.match(/S\s*DPH:?\s*([\d\s\u00a0]+)\s*Kč/i);
      const plainMatch = inner.match(/([\d\s\u00a0]{4,})\s*Kč/);
      let price = 0;
      if (sDphMatch) price = Number(sDphMatch[1].replace(/[\s\u00a0]/g, ""));
      else if (plainMatch) price = Number(plainMatch[1].replace(/[\s\u00a0]/g, ""));
      if (!price || isNaN(price)) price = 0;

      // Images: first img from card alt; we add 0..6 by convention since Chrysler stores by index.
      const imgs: string[] = [];
      if (firstImg) imgs.push(firstImg);
      // try to derive base from firstImg, e.g. .../vehicles/{uuid}/0.jpg
      const baseMatch = firstImg.match(/^(https?:\/\/[^?]+\/vehicles\/[0-9a-f-]{36}\/)\d+\.(jpg|jpeg|png|webp)/i);
      if (baseMatch) {
        const base = baseMatch[1];
        const ext = baseMatch[2];
        for (let i = 1; i <= 6; i++) imgs.push(`${base}${i}.${ext}`);
      }

      out.push({
        external_id: uuid,
        brand, model, year, price, mileage, fuel, vin,
        title, ev_no: evNo,
        images: Array.from(new Set(imgs)),
        listing_url: detailUrl,
      });
    } catch (e) {
      console.warn("Failed to parse card:", e);
    }
  }
  return out;
}

const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Jeep", "Cadillac", "Lancia"];
function parseBrandModel(title: string): { brand: string; model: string } {
  const trimmed = title.trim();
  for (const b of ALLOWED_BRANDS) {
    if (trimmed.toLowerCase().startsWith(b.toLowerCase())) {
      // model = everything after brand up to first engine token (e.g. "3,6", "3.6", "2,8") or year
      const rest = trimmed.slice(b.length).trim();
      const stop = rest.match(/^(.*?)(?:\s+(?:\d+[.,]\d+|\d{4}|[A-Z]{2,}\b)|$)/);
      // Use a simpler heuristic: take the next 1-3 word tokens that don't look like engine cc/year
      const tokens = rest.split(/\s+/);
      const modelTokens: string[] = [];
      for (const t of tokens) {
        if (/^(?:\d+[.,]\d+|\d{4})$/.test(t)) break;
        if (modelTokens.length >= 3) break;
        modelTokens.push(t);
      }
      const model = modelTokens.join(" ").replace(/[,;]+$/, "").trim() || (stop?.[1] || rest).trim();
      return { brand: b, model: model || rest };
    }
  }
  // Fallback: first word brand, second word model
  const parts = trimmed.split(/\s+/);
  return { brand: parts[0] || "Unknown", model: parts.slice(1, 3).join(" ") || "—" };
}

// ---------- Firecrawl helper ----------
async function firecrawlRequest(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const rawText = await response.text();
  let data: Record<string, unknown> = {};
  try { data = rawText ? JSON.parse(rawText) : {}; } catch { data = { rawText }; }
  if (!response.ok) {
    const message = (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      `Firecrawl request failed with status ${response.status}`;
    throw new Error(message);
  }
  return data;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
