import { createClient } from "npm:@supabase/supabase-js@2";

const STATUS_TYPE = "vehicle_sync_status";
const STATUS_TTL_SECONDS = 60 * 60;
const VEHICLE_SOURCE_URL = "https://www.chrysler.cz/#nabidka";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type VehicleRecord = {
  brand?: string;
  model?: string;
  year?: number;
  price?: number;
  mileage?: number;
  fuel?: string;
  transmission?: string;
  engine?: string;
  power?: string;
  color?: string;
  condition?: string;
  description?: string;
  images?: string[];
  listing_url?: string;
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
  user_id?: string;
};

class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await readJsonBody(req);
    const { user, adminClient } = await requireAdmin(req);

    if (typeof body.jobId === "string" && body.jobId.trim()) {
      const jobId = body.jobId.trim();
      const status = await getJobStatus(adminClient, jobId);

      if (!status) {
        return json({ success: false, error: "Status synchronizace nebyl nalezen." }, 404);
      }

      return json({ success: true, jobId, ...status });
    }

    const existingJob = await getRunningJob(adminClient, user.id);
    if (existingJob) {
      return json({
        success: true,
        queued: true,
        jobId: existingJob.jobId,
        ...existingJob.status,
        message: "Aktualizace už běží, navazuji na existující úlohu.",
      });
    }

    const firecrawlApiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!firecrawlApiKey) {
      return json({ success: false, error: "Firecrawl not configured" }, 500);
    }

    const jobId = crypto.randomUUID();
    const initialStatus: JobStatus = {
      status: "running",
      phase: "queued",
      progress: 5,
      message: "Synchronizace nabídky byla spuštěna.",
      started_at: new Date().toISOString(),
      user_id: user.id,
    };

    await upsertJobStatus(adminClient, jobId, initialStatus);

    const edgeRuntime = (globalThis as unknown as {
      EdgeRuntime?: { waitUntil: (promise: Promise<unknown>) => void };
    }).EdgeRuntime;

    const runPromise = runVehicleSync(jobId, adminClient, firecrawlApiKey, user.id);
    if (edgeRuntime?.waitUntil) {
      edgeRuntime.waitUntil(runPromise);
    } else {
      runPromise.catch((error) => console.error("Background sync failed:", error));
    }

    return json({
      success: true,
      queued: true,
      jobId,
      ...initialStatus,
    });
  } catch (error) {
    console.error("scrape-vehicles request error:", error);

    if (error instanceof HttpError) {
      return json({ success: false, error: error.message }, error.status);
    }

    return json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, 500);
  }
});

async function readJsonBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

async function requireAdmin(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new HttpError(401, "Unauthorized");
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    throw new HttpError(500, "Backend credentials missing");
  }

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    throw new HttpError(401, "Unauthorized");
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: roleData, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .maybeSingle();

  if (roleError) {
    throw new HttpError(500, roleError.message);
  }

  if (!roleData) {
    throw new HttpError(403, "Forbidden: admin required");
  }

  return { user, adminClient };
}

async function getRunningJob(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await supabase
    .from("api_cache")
    .select("cache_key, data, created_at")
    .eq("cache_type", STATUS_TYPE)
    .contains("data", { status: "running", user_id: userId })
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    console.error("getRunningJob error:", error);
    return null;
  }

  const row = data?.[0];
  if (!row?.cache_key || typeof row.data !== "object" || !row.data) {
    return null;
  }

  return {
    jobId: row.cache_key,
    status: row.data as JobStatus,
  };
}

async function getJobStatus(supabase: ReturnType<typeof createClient>, jobId: string) {
  const { data, error } = await supabase
    .from("api_cache")
    .select("data")
    .eq("cache_type", STATUS_TYPE)
    .eq("cache_key", jobId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (error) {
    throw new Error(error.message);
  }

  const row = data?.[0];
  return row?.data && typeof row.data === "object" ? (row.data as JobStatus) : null;
}

async function upsertJobStatus(
  supabase: ReturnType<typeof createClient>,
  jobId: string,
  status: JobStatus,
) {
  const { data: existingRows, error: existingError } = await supabase
    .from("api_cache")
    .select("id")
    .eq("cache_type", STATUS_TYPE)
    .eq("cache_key", jobId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (existingError) {
    throw new Error(existingError.message);
  }

  const existingId = existingRows?.[0]?.id;
  const payload = {
    cache_type: STATUS_TYPE,
    cache_key: jobId,
    data: status,
    ttl_seconds: STATUS_TTL_SECONDS,
  };

  if (existingId) {
    const { error } = await supabase.from("api_cache").update(payload).eq("id", existingId);
    if (error) {
      throw new Error(error.message);
    }
    return;
  }

  const { error } = await supabase.from("api_cache").insert(payload);
  if (error) {
    throw new Error(error.message);
  }
}

async function runVehicleSync(
  jobId: string,
  supabase: ReturnType<typeof createClient>,
  firecrawlApiKey: string,
  userId: string,
) {
  try {
    console.log("Scraping chrysler.cz for vehicle listings in background...", { jobId });

    await upsertJobStatus(supabase, jobId, {
      status: "running",
      phase: "scraping",
      progress: 20,
      message: "Stahuji nabídku vozů…",
      started_at: new Date().toISOString(),
      user_id: userId,
    });

    const scrapeData = await firecrawlRequest(firecrawlApiKey, {
      url: VEHICLE_SOURCE_URL,
      formats: ["markdown"],
      onlyMainContent: true,
      timeout: 120000,
      waitFor: 8000,
    });

    const markdown = scrapeData?.data?.markdown || scrapeData?.markdown || "";
    console.log(`Got markdown (${markdown.length} chars)`);

    if (!markdown || markdown.length < 100) {
      throw new Error("Stránka nevrátila dostatek obsahu pro synchronizaci.");
    }

    await upsertJobStatus(supabase, jobId, {
      status: "running",
      phase: "extracting",
      progress: 55,
      message: "Porovnávám data a extrahuji vozy…",
      started_at: new Date().toISOString(),
      user_id: userId,
    });

    const extractData = await firecrawlRequest(firecrawlApiKey, {
      url: VEHICLE_SOURCE_URL,
      formats: ["extract"],
      extract: {
        prompt:
          "Extract all vehicles for sale. For each vehicle get: brand, model, year, price (number in CZK), mileage (km number), fuel, transmission, engine, power, color, condition, description, image URLs array, and listing_url.",
        schema: {
          type: "object",
          properties: {
            vehicles: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  brand: { type: "string" },
                  model: { type: "string" },
                  year: { type: "number" },
                  price: { type: "number" },
                  mileage: { type: "number" },
                  fuel: { type: "string" },
                  transmission: { type: "string" },
                  engine: { type: "string" },
                  power: { type: "string" },
                  color: { type: "string" },
                  condition: { type: "string" },
                  description: { type: "string" },
                  images: { type: "array", items: { type: "string" } },
                  listing_url: { type: "string" },
                },
              },
            },
          },
        },
      },
      timeout: 120000,
      waitFor: 8000,
    });

    const vehicles =
      extractData?.data?.extract?.vehicles ||
      extractData?.extract?.vehicles ||
      extractData?.data?.json?.vehicles ||
      [];

    console.log(`Found ${vehicles.length} vehicles`);

    await upsertJobStatus(supabase, jobId, {
      status: "running",
      phase: "saving",
      progress: 80,
      message: vehicles.length
        ? `Nalezeno ${vehicles.length} vozů, ukládám změny…`
        : "Nebyl nalezen žádný vůz k uložení.",
      vehicles: vehicles.length,
      started_at: new Date().toISOString(),
      user_id: userId,
    });

    if (!vehicles.length) {
      await upsertJobStatus(supabase, jobId, {
        status: "completed",
        phase: "done",
        progress: 100,
        message: "Synchronizace dokončena, ale nebyly nalezeny žádné vozy.",
        vehicles: 0,
        updated: 0,
        created: 0,
        added: 0,
        removed: 0,
        completed_at: new Date().toISOString(),
        user_id: userId,
      });
      return;
    }

    await supabase.from("vehicles").update({ is_active: false }).eq("is_active", true);

    let updated = 0;
    let created = 0;

    for (const vehicle of vehicles as VehicleRecord[]) {
      if (!vehicle.brand || !vehicle.model) continue;

      const { data: existing, error: existingError } = await supabase
        .from("vehicles")
        .select("id")
        .eq("brand", vehicle.brand)
        .eq("model", vehicle.model)
        .eq("year", vehicle.year || 0)
        .limit(1);

      if (existingError) {
        throw new Error(existingError.message);
      }

      const vehicleData = {
        brand: vehicle.brand,
        model: vehicle.model,
        year: vehicle.year || new Date().getFullYear(),
        price: vehicle.price || 0,
        mileage: vehicle.mileage || null,
        fuel: vehicle.fuel || null,
        transmission: vehicle.transmission || null,
        engine: vehicle.engine || null,
        power: vehicle.power || null,
        color: vehicle.color || null,
        condition: vehicle.condition || null,
        description: vehicle.description || null,
        images: vehicle.images || [],
        listing_url: vehicle.listing_url || VEHICLE_SOURCE_URL,
        is_active: true,
        updated_at: new Date().toISOString(),
      };

      if (existing && existing.length > 0) {
        const { error } = await supabase.from("vehicles").update(vehicleData).eq("id", existing[0].id);
        if (error) {
          throw new Error(error.message);
        }
        updated++;
      } else {
        const { error } = await supabase.from("vehicles").insert(vehicleData);
        if (error) {
          throw new Error(error.message);
        }
        created++;
      }
    }

    const message = `Aktualizováno: ${updated}, Nových: ${created}, Celkem: ${vehicles.length}`;
    console.log(message);

    await upsertJobStatus(supabase, jobId, {
      status: "completed",
      phase: "done",
      progress: 100,
      message,
      vehicles: vehicles.length,
      updated,
      created,
      added: created,
      removed: 0,
      completed_at: new Date().toISOString(),
      user_id: userId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("scrape-vehicles background error:", error);

    try {
      await upsertJobStatus(supabase, jobId, {
        status: "failed",
        phase: "error",
        progress: 100,
        message,
        error: message,
        completed_at: new Date().toISOString(),
        user_id: userId,
      });
    } catch (statusError) {
      console.error("Failed to persist scrape status:", statusError);
    }
  }
}

async function firecrawlRequest(apiKey: string, body: Record<string, unknown>) {
  const response = await fetch("https://api.firecrawl.dev/v1/scrape", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  let data: Record<string, unknown> = {};

  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { rawText };
  }

  if (!response.ok) {
    console.error("Firecrawl error:", data);
    const message =
      (typeof data.error === "string" && data.error) ||
      (typeof data.message === "string" && data.message) ||
      `Firecrawl request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
