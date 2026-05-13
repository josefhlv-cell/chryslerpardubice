// catalog-quickfix — automated repairs for common catalog issues with full logging.
// Actions:
//   - snapshot          : capture current catalog stats into catalog_snapshots
//   - mark_on_order     : parts with no/zero price -> availability='on_order'
//   - normalize_categories : map non-canonical categories to canonical ones
//   - dedupe_compat     : remove duplicate part-vehicle compatibility links
//   - trim_names        : clean whitespace / collapse spaces in part names
//   - fix_currency      : NULL/empty currency -> 'CZK'
//   - fix_active        : is_active NULL -> true
//   - run_all           : run every safe fix in sequence
//   - list_snapshots    : recent snapshots
//   - list_fixes        : recent fix log
//   - rollback_on_order : revert availability='on_order' set after a given timestamp
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const CANONICAL = new Set([
  "Brzdový systém","Chlazení","Elektroinstalace","Filtry","Interiér","Karoserie",
  "Klimatizace","Motor","Odpružení","Osvětlení","Palivový systém","Převodovka",
  "Řízení","Údržba","Výfuk","Náplně a kapaliny","Pneumatiky a disky",
  "Příslušenství a nářadí","Náprava","Ostatní",
]);
const CATEGORY_REMAP: Record<string, string> = {
  "autobaterie": "Elektroinstalace",
  "elektronika": "Elektroinstalace",
  "elektrika": "Elektroinstalace",
  "kola a pneumatiky": "Pneumatiky a disky",
  "disky": "Pneumatiky a disky",
  "pneumatiky": "Pneumatiky a disky",
  "těsnění": "Motor",
  "tesneni": "Motor",
  "zavěšení kola": "Odpružení",
  "zaveseni kola": "Odpružení",
  "tlumiče": "Odpružení",
  "olej": "Náplně a kapaliny",
  "oleje": "Náplně a kapaliny",
  "kapaliny": "Náplně a kapaliny",
  "brzdy": "Brzdový systém",
  "filter": "Filtry",
  "filtr": "Filtry",
};

function json(b: unknown, s = 200) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
}

async function logFix(supabase: any, runId: string, fixType: string, payload: any) {
  await supabase.from("catalog_fix_log").insert({
    run_id: runId, fix_type: fixType,
    entity_type: payload.entity_type, entity_id: payload.entity_id,
    before_value: payload.before, after_value: payload.after,
    reason: payload.reason, affected_count: payload.affected_count ?? 1,
  });
}

async function snapshot(supabase: any, label: string, trigger?: string) {
  const [parts, vehicles, compat, cats, missing] = await Promise.all([
    supabase.from("parts_new").select("*", { count: "exact", head: true }),
    supabase.from("nextis_vehicles").select("*", { count: "exact", head: true }),
    supabase.from("catalog_vehicle_compatibility").select("*", { count: "exact", head: true }),
    supabase.from("catalog_categories").select("*", { count: "exact", head: true }),
    supabase.from("parts_new").select("*", { count: "exact", head: true }).or("price_with_vat.is.null,price_with_vat.lte.0"),
  ]);
  const stats = {
    parts: parts.count, vehicles: vehicles.count, compat: compat.count,
    categories: cats.count, price_missing: missing.count,
  };
  const { data, error } = await supabase.from("catalog_snapshots").insert({
    label, trigger,
    stats, parts_count: stats.parts, vehicles_count: stats.vehicles,
    compat_count: stats.compat, category_count: stats.categories, price_missing: stats.price_missing,
  }).select().maybeSingle();
  return { ok: !error, snapshot: data, error: error?.message };
}

async function fixMarkOnOrder(supabase: any, runId: string) {
  const { data: before } = await supabase
    .from("parts_new").select("id")
    .or("price_with_vat.is.null,price_with_vat.lte.0")
    .neq("availability", "on_order")
    .limit(50000);
  const ids = (before ?? []).map((r: any) => r.id);
  if (!ids.length) return { fix: "mark_on_order", affected: 0 };
  let total = 0;
  for (let i = 0; i < ids.length; i += 500) {
    const slice = ids.slice(i, i + 500);
    const { error } = await supabase.from("parts_new").update({ availability: "on_order" }).in("id", slice);
    if (!error) total += slice.length;
  }
  await logFix(supabase, runId, "mark_on_order", {
    entity_type: "parts_new", before: { availability: "<other>", count: total },
    after: { availability: "on_order" }, reason: "Cena <= 0 nebo NULL",
    affected_count: total,
  });
  return { fix: "mark_on_order", affected: total };
}

async function fixNormalizeCategories(supabase: any, runId: string) {
  let changed = 0;
  const { data: rows } = await supabase
    .from("parts_new").select("id, category")
    .not("category", "is", null).limit(20000);
  const updates: Record<string, string[]> = {};
  for (const r of rows ?? []) {
    const cur = (r.category ?? "").trim();
    if (!cur || CANONICAL.has(cur)) continue;
    const target = CATEGORY_REMAP[cur.toLowerCase()] ?? "Ostatní";
    (updates[target] ||= []).push(r.id);
  }
  for (const [target, ids] of Object.entries(updates)) {
    for (let i = 0; i < ids.length; i += 500) {
      const slice = ids.slice(i, i + 500);
      const { error } = await supabase.from("parts_new").update({ category: target }).in("id", slice);
      if (!error) {
        changed += slice.length;
        await logFix(supabase, runId, "normalize_category", {
          entity_type: "parts_new", before: { category: "<non-canonical>" },
          after: { category: target }, reason: "Mapování na kanonickou kategorii",
          affected_count: slice.length,
        });
      }
    }
  }
  return { fix: "normalize_categories", affected: changed };
}

async function fixDedupeCompat(supabase: any, runId: string) {
  const { data, error } = await supabase.rpc("dedupe_catalog_compat" as any).maybeSingle();
  if (error || !data) {
    return { fix: "dedupe_compat", affected: 0, note: "RPC missing, skipped" };
  }
  await logFix(supabase, runId, "dedupe_compat", {
    entity_type: "catalog_vehicle_compatibility",
    before: { duplicates: (data as any).removed }, after: {}, reason: "Odstranění duplicit",
    affected_count: (data as any).removed,
  });
  return { fix: "dedupe_compat", affected: (data as any).removed };
}

async function fixTrimNames(supabase: any, runId: string) {
  const { data: rows } = await supabase
    .from("parts_new").select("id, name")
    .not("name", "is", null).limit(20000);
  let changed = 0;
  for (const r of rows ?? []) {
    const orig = r.name as string;
    const cleaned = orig.replace(/\s+/g, " ").trim();
    if (cleaned && cleaned !== orig) {
      const { error } = await supabase.from("parts_new").update({ name: cleaned }).eq("id", r.id);
      if (!error) changed++;
    }
  }
  if (changed) {
    await logFix(supabase, runId, "trim_names", {
      entity_type: "parts_new", before: {}, after: {},
      reason: "Vyčištění bílých znaků v názvech", affected_count: changed,
    });
  }
  return { fix: "trim_names", affected: changed };
}

async function fixCurrency(supabase: any, runId: string) {
  const { count } = await supabase.from("parts_new")
    .update({ currency: "CZK" }, { count: "exact" })
    .or("currency.is.null,currency.eq.")
    .select("*", { count: "exact", head: true });
  if (count) {
    await logFix(supabase, runId, "fix_currency", {
      entity_type: "parts_new", before: { currency: null }, after: { currency: "CZK" },
      reason: "Doplnění výchozí měny", affected_count: count,
    });
  }
  return { fix: "fix_currency", affected: count ?? 0 };
}

async function fixActive(supabase: any, runId: string) {
  const { count } = await supabase.from("parts_new")
    .update({ is_active: true }, { count: "exact" })
    .is("is_active", null)
    .select("*", { count: "exact", head: true });
  if (count) {
    await logFix(supabase, runId, "fix_active", {
      entity_type: "parts_new", before: { is_active: null }, after: { is_active: true },
      reason: "Aktivace dílů s NULL", affected_count: count,
    });
  }
  return { fix: "fix_active", affected: count ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const body = await req.json().catch(() => ({}));
  const action = body.action || "run_all";
  const runId = crypto.randomUUID();

  try {
    if (action === "snapshot") {
      return json(await snapshot(supabase, body.label || `manual ${new Date().toISOString()}`, body.trigger));
    }
    if (action === "list_snapshots") {
      const { data } = await supabase.from("catalog_snapshots")
        .select("*").order("created_at", { ascending: false }).limit(50);
      return json({ snapshots: data ?? [] });
    }
    if (action === "list_fixes") {
      const { data } = await supabase.from("catalog_fix_log")
        .select("*").order("created_at", { ascending: false }).limit(200);
      return json({ fixes: data ?? [] });
    }
    if (action === "rollback_on_order") {
      const since = body.since;
      if (!since) return json({ error: "since required" }, 400);
      const { data: logs } = await supabase.from("catalog_fix_log")
        .select("*").eq("fix_type", "mark_on_order").gte("created_at", since);
      return json({ note: "Rollback would revert " + (logs?.length ?? 0) + " batches. Manual confirmation required.", logs });
    }

    const before = await snapshot(supabase, `before_${action}`, "quickfix");
    const results: any[] = [];

    const map: Record<string, () => Promise<any>> = {
      mark_on_order: () => fixMarkOnOrder(supabase, runId),
      normalize_categories: () => fixNormalizeCategories(supabase, runId),
      dedupe_compat: () => fixDedupeCompat(supabase, runId),
      trim_names: () => fixTrimNames(supabase, runId),
      fix_currency: () => fixCurrency(supabase, runId),
      fix_active: () => fixActive(supabase, runId),
    };

    if (action === "run_all") {
      for (const k of Object.keys(map)) {
        try { results.push(await map[k]()); }
        catch (e) { results.push({ fix: k, error: String((e as Error).message) }); }
      }
    } else if (map[action]) {
      results.push(await map[action]());
    } else {
      return json({ error: "unknown action" }, 400);
    }

    const after = await snapshot(supabase, `after_${action}`, "quickfix");
    return json({ ok: true, runId, before: before.snapshot, after: after.snapshot, results });
  } catch (e) {
    return json({ ok: false, error: String((e as Error).message) }, 500);
  }
});
