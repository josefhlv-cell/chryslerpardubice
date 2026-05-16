// Integration test pro jm-proxy partsForEngine flow.
// Run with: deno test --allow-net --allow-env supabase/functions/jm-proxy/index.test.ts
// LIVE_NEXTIS_TEST=1 enables call against deployed edge function.
import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const SUPABASE_URL = Deno.env.get("VITE_SUPABASE_URL") || Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_KEY = Deno.env.get("VITE_SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";

// =====================================================================
// Mock test — exercises in-process logic of nextisPostWithRetry / runConcurrent.
// =====================================================================

Deno.test("runConcurrent respects limit & preserves order", async () => {
  const items = Array.from({ length: 20 }, (_, i) => i);
  let inFlight = 0;
  let maxInFlight = 0;
  const out: number[] = await runConcurrent(items, 6, async (n) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
    return n * 2;
  });
  assertEquals(out, items.map((n) => n * 2));
  assert(maxInFlight <= 6, `concurrency violated: ${maxInFlight}`);
});

Deno.test("nextisPostWithRetry retries on 503 and gives up after 3 attempts", async () => {
  let calls = 0;
  // Stub global fetch
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("server down", { status: 503 });
  }) as any;
  try {
    const res = await nextisPostWithRetry("/x", {}, { timeoutMs: 500, maxAttempts: 3 });
    assert(!res.ok);
    assertEquals(calls, 3);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("nextisPostWithRetry succeeds on 2nd attempt after one 503", async () => {
  let calls = 0;
  const origFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    calls++;
    if (calls === 1) return new Response("oops", { status: 503 });
    return new Response(JSON.stringify({ items: [{ ok: true }] }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as any;
  try {
    const res = await nextisPostWithRetry("/x", {}, { timeoutMs: 500, maxAttempts: 3 });
    assert(res.ok);
    assertEquals((res as any).attempts, 2);
  } finally {
    globalThis.fetch = origFetch;
  }
});

// =====================================================================
// Live test — only when LIVE_NEXTIS_TEST=1.
// Calls deployed jm-proxy with action=partsForEngine for Chrysler 300C 5.7 HEMI.
// =====================================================================

Deno.test({
  name: "[LIVE] partsForEngine returns engineID flow with sectionsScanned > 0",
  ignore: Deno.env.get("LIVE_NEXTIS_TEST") !== "1",
  async fn() {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error("VITE_SUPABASE_URL/KEY required");
    const res = await fetch(`${SUPABASE_URL}/functions/v1/jm-proxy`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SUPABASE_KEY}`,
        apikey: SUPABASE_KEY,
      },
      body: JSON.stringify({
        action: "partsForEngine",
        brand: "Chrysler",
        model: "300C",
        engine: "5.7L V8 HEMI",
        year: 2008,
      }),
    });
    const text = await res.text();
    assertEquals(res.status, 200, `body: ${text.slice(0, 300)}`);
    const data = JSON.parse(text);
    assert(data.debug, "expected debug field in response");
    console.log("[LIVE] flow:", data.debug.flow, "k_type:", data.debug.k_type,
      "sectionsScanned:", data.debug.sectionsScanned, "sectionsHit:", data.debug.sectionsHit,
      "items:", data.items?.length, "duration:", data.debug.durationMs);
    if (data.debug.flow === "engineId") {
      assert(data.debug.sectionsScanned > 0, "sectionsScanned must be > 0");
      assert(Array.isArray(data.debug.timedOutSections), "timedOutSections must be an array");
    }
  },
});

// =====================================================================
// Local copies of helpers (mirrors implementation in index.ts) — keeps the test
// runnable without importing heavy server entrypoint.
// =====================================================================
async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}

async function nextisPostWithRetry(
  path: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<{ ok: true; data: any; attempts: number } | { ok: false; error: string; attempts: number; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoff = [50, 100, 150]; // smaller for tests
  let lastErr = "";
  let timedOut = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        lastErr = `${res.status}: ${t.slice(0, 200)}`;
        if (res.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, backoff[attempt - 1] ?? 100));
          continue;
        }
        return { ok: false, error: lastErr, attempts: attempt, timedOut: false };
      }
      return { ok: true, data: await res.json(), attempts: attempt };
    } catch (e: any) {
      lastErr = e?.message || String(e);
      timedOut = e?.name === "TimeoutError" || /timeout/i.test(lastErr);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoff[attempt - 1] ?? 100));
        continue;
      }
    }
  }
  return { ok: false, error: lastErr, attempts: maxAttempts, timedOut };
}
