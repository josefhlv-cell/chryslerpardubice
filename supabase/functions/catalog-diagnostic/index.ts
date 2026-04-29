// Catalog Diagnostic — admin background job + auto-fix workflow
// Actions:
//   start          - spustí novou diagnostiku (priority validation -> deep scan -> fix proposals)
//   status         - vrátí stav běhu + výsledky + návrhy oprav
//   cancel         - zruší běžící skener
//   latest         - poslední běh
//   listFixes      - návrhy oprav pro daný run
//   applyFix       - aplikuje konkrétní opravu (po souhlasu admina)
//   rejectFix      - označí návrh jako zamítnutý

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED_BRANDS = ["Chrysler", "Dodge", "RAM", "Cadillac", "Lancia"];

const CANONICAL_CATEGORIES = [
  "Brzdové zařízení",
  "Filtry",
  "Motor",
  "Převodovka",
  "Podvozek",
  "Tlumiče a pružiny",
  "Elektroinstalace",
  "Chlazení",
  "Palivový systém",
  "Výfukový systém",
  "Karoserie",
  "Interiér",
  "Osvětlení",
  "Klimatizace",
  "Rozvody",
  "Zapalování",
  "Spojka",
  "Řízení",
  "Náplně a maziva",
];

// Mapování běžných variant -> kanonická kategorie (pro normalizaci)
const CATEGORY_ALIASES: Record<string, string> = {
  "brzdy": "Brzdové zařízení",
  "brzdový systém": "Brzdové zařízení",
  "brzdový systém (brakes)": "Brzdové zařízení",
  "brakes": "Brzdové zařízení",
  "filtr": "Filtry",
  "filters": "Filtry",
  "engine": "Motor",
  "motorové díly": "Motor",
  "transmission": "Převodovka",
  "převodovky": "Převodovka",
  "suspension": "Podvozek",
  "podvozek a řízení": "Podvozek",
  "shock absorbers": "Tlumiče a pružiny",
  "tlumiče": "Tlumiče a pružiny",
  "electrics": "Elektroinstalace",
  "elektrika": "Elektroinstalace",
  "cooling": "Chlazení",
  "fuel system": "Palivový systém",
  "exhaust": "Výfukový systém",
  "výfuk": "Výfukový systém",
  "body": "Karoserie",
  "interior": "Interiér",
  "lights": "Osvětlení",
  "světla": "Osvětlení",
  "ac": "Klimatizace",
  "a/c": "Klimatizace",
  "timing": "Rozvody",
  "ignition": "Zapalování",
  "clutch": "Spojka",
  "steering": "Řízení",
  "fluids": "Náplně a maziva",
  "oils": "Náplně a maziva",
};

// ====== Heuristika kategorie podle klíčových slov v názvu ======
const CATEGORY_KEYWORDS: { keywords: string[]; category: string }[] = [
  { keywords: ["brzd", "brake", "bremse", "destič", "kotouč", "třmen", "destičky"], category: "Brzdové zařízení" },
  { keywords: ["filtr", "filter", "olejov", "vzduchov", "kabin", "palivov filtr"], category: "Filtry" },
  { keywords: ["motor", "engine", "písty", "ventil", "hlava válc", "kliková"], category: "Motor" },
  { keywords: ["převodov", "transmission", "ozub", "synchron"], category: "Převodovka" },
  { keywords: ["tlumič", "pružin", "shock", "absorber", "stossdaempfer"], category: "Tlumiče a pružiny" },
  { keywords: ["alternát", "startér", "kabel", "wire", "harness", "elektro", "lichtmaschine", "anlasser"], category: "Elektroinstalace" },
  { keywords: ["chladič", "cooling", "termosta", "vodní čerpadlo", "kuehler", "thermostat"], category: "Chlazení" },
  { keywords: ["paliv", "fuel", "vstřik", "injektor", "kraftstoff"], category: "Palivový systém" },
  { keywords: ["výfuk", "exhaust", "katalyz", "tlumič výfuk"], category: "Výfukový systém" },
  { keywords: ["nárazník", "kapota", "dveře", "blatník", "body", "karoseri"], category: "Karoserie" },
  { keywords: ["sedadl", "palubn", "interi", "obložen"], category: "Interiér" },
  { keywords: ["světl", "light", "lamp", "žárovk", "led "], category: "Osvětlení" },
  { keywords: ["klimatiz", "kondenzát", "evaporát", "a/c"], category: "Klimatizace" },
  { keywords: ["rozvod", "timing", "řemen", "napín"], category: "Rozvody" },
  { keywords: ["zapal", "svíčk", "ignition", "cívk", "zuendkerze"], category: "Zapalování" },
  { keywords: ["spojk", "clutch", "vypínací"], category: "Spojka" },
  { keywords: ["řízení", "steering", "tyč řízení", "kloub řízení"], category: "Řízení" },
  { keywords: ["olej", "kapalin", "mazivo", "fluid", "antifreez", "nemrznou"], category: "Náplně a maziva" },
  { keywords: ["ložisko", "uložení motoru", "rameno", "silentblok", "podvozek"], category: "Podvozek" },
];

function guessCategoryFromName(name: string): string | null {
  const lower = (name || "").toLowerCase();
  for (const rule of CATEGORY_KEYWORDS) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.category;
  }
  return null;
}

// ====== Slovník překladů (pro fix translate_names) ======
const NAME_TRANSLATIONS: Record<string, string> = {
  "BREMSBELAG SATZ": "Sada brzdových destiček",
  "BREMSBELAG VORNE": "Brzdové destičky přední",
  "BREMSBELAG HINTEN": "Brzdové destičky zadní",
  "BREMSSCHEIBE": "Brzdový kotouč",
  "BREMSSCHEIBE VORNE": "Brzdový kotouč přední",
  "BREMSSCHEIBE HINTEN": "Brzdový kotouč zadní",
  "BREMSSATTEL": "Brzdový třmen",
  "OELFILTER": "Olejový filtr",
  "LUFTFILTER": "Vzduchový filtr",
  "KABINENFILTER": "Filtr kabiny",
  "KRAFTSTOFFFILTER": "Palivový filtr",
  "ZUENDKERZE": "Zapalovací svíčka",
  "WASSERPUMPE": "Vodní čerpadlo",
  "KUEHLER": "Chladič",
  "THERMOSTAT": "Termostat",
  "STOSSDAEMPFER": "Tlumič nárazů",
  "LICHTMASCHINE": "Alternátor",
  "ANLASSER": "Startér",
  "BATTERIE": "Baterie",
  "AKKUMULATOR": "Baterie",
  "HALTER": "Držák",
  "KABELSTRANG": "Kabelový svazek",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sb = () => createClient(SUPABASE_URL, SERVICE_KEY);

// ============= PRIORITY VALIDATION (rychlá, na začátku) =============
async function priorityValidation(runId: string) {
  const s = sb();
  await s.from("catalog_diagnostic_runs").update({
    current_step: "🔍 Prioritní validace katalogu…",
  }).eq("id", runId);

  const critical: any[] = [];
  const summary: Record<string, number> = {};

  // 1) Díly bez ceny / s 0 Kč (musí být na objednávku)
  const { count: zeroPriceCount } = await s
    .from("parts_new")
    .select("id", { count: "exact", head: true })
    .or("price_with_vat.is.null,price_with_vat.eq.0");
  summary.zero_price_total = zeroPriceCount || 0;
  if ((zeroPriceCount || 0) > 0) {
    critical.push({
      severity: "critical",
      code: "ZERO_PRICE_NOT_ON_ORDER",
      title: `${zeroPriceCount} dílů s nulovou cenou`,
      message: "Musí být označeny jako 'Na objednávku'.",
      fixable: true,
      fix_type: "mark_on_order",
    });
  }

  // 2) Nekanonické kategorie
  const { data: catRows } = await s
    .from("parts_new")
    .select("category")
    .not("category", "is", null);
  const catCounts = new Map<string, number>();
  for (const r of catRows || []) {
    const c = (r.category || "").trim();
    if (c) catCounts.set(c, (catCounts.get(c) || 0) + 1);
  }
  const nonCanonical: { from: string; to: string | null; count: number }[] = [];
  for (const [cat, count] of catCounts) {
    if (CANONICAL_CATEGORIES.includes(cat)) continue;
    const target = CATEGORY_ALIASES[cat.toLowerCase()] || null;
    nonCanonical.push({ from: cat, to: target, count });
  }
  summary.noncanonical_categories = nonCanonical.length;
  summary.noncanonical_parts = nonCanonical.reduce((a, b) => a + b.count, 0);
  if (nonCanonical.length > 0) {
    critical.push({
      severity: "high",
      code: "NONCANONICAL_CATEGORIES",
      title: `${nonCanonical.length} nekanonických kategorií (${summary.noncanonical_parts} dílů)`,
      message: "Mapování na 19 kanonických kategorií zajistí správný strom katalogu.",
      fixable: true,
      fix_type: "normalize_categories",
      details: nonCanonical.slice(0, 20),
    });
  }

  // 3) Díly bez kategorie
  const { count: noCatCount } = await s
    .from("parts_new")
    .select("id", { count: "exact", head: true })
    .or("category.is.null,category.eq.");
  summary.uncategorized_total = noCatCount || 0;
  if ((noCatCount || 0) > 0) {
    critical.push({
      severity: "high",
      code: "UNCATEGORIZED_PARTS",
      title: `${noCatCount} dílů bez kategorie`,
      message: "Tyto díly se nezobrazí v žádné kategorii katalogu.",
      fixable: false,
    });
  }

  // 4) Díly bez OEM kompatibility (nejsou napárované na žádné vozidlo)
  const { data: allPartIds } = await s.from("parts_new").select("id").limit(50000);
  const { data: mappedPartIds } = await s
    .from("catalog_vehicle_compatibility")
    .select("part_id");
  const mappedSet = new Set((mappedPartIds || []).map((r) => r.part_id));
  const unmappedCount = (allPartIds || []).filter((r) => !mappedSet.has(r.id)).length;
  summary.unmapped_parts = unmappedCount;
  if (unmappedCount > 0) {
    critical.push({
      severity: "high",
      code: "UNMAPPED_PARTS",
      title: `${unmappedCount} dílů bez kompatibility s vozidlem`,
      message: "Spustit auto-matcher pro automatické přiřazení k Nextis vozidlům.",
      fixable: true,
      fix_type: "rebuild_compatibility",
    });
  }

  // 5) Duplicitní OEM
  const { data: oemDupes } = await s.rpc("normalize_oem", { _oem: "x" }).then(async () => {
    // fallback bez RPC: vytáhnout všechny OEM a spočítat
    const { data } = await s.from("parts_new").select("oem_number").limit(50000);
    return { data };
  });
  const oemMap = new Map<string, number>();
  for (const r of (oemDupes as any[]) || []) {
    const norm = (r.oem_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (norm) oemMap.set(norm, (oemMap.get(norm) || 0) + 1);
  }
  const dupCount = [...oemMap.values()].filter((v) => v > 1).length;
  summary.duplicate_oems = dupCount;
  if (dupCount > 5) {
    critical.push({
      severity: "medium",
      code: "DUPLICATE_OEMS",
      title: `${dupCount} duplicitních OEM čísel`,
      message: "Stejný díl je v DB víckrát — sloučit přes part_supersessions.",
      fixable: true,
      fix_type: "dedupe_oem",
    });
  }

  // 6) Cizojazyčné názvy (DE/EN slovník)
  const { data: deNames } = await s
    .from("parts_new")
    .select("id")
    .or(NAME_TRANSLATIONS_TO_OR())
    .limit(2000);
  const translatableCount = (deNames || []).length;
  summary.translatable_names = translatableCount;
  if (translatableCount > 0) {
    critical.push({
      severity: "medium",
      code: "FOREIGN_NAMES",
      title: `${translatableCount} dílů s cizojazyčným názvem`,
      message: "Přeložit známé německé/anglické názvy do češtiny.",
      fixable: true,
      fix_type: "translate_names",
    });
  }

  // 7) Chybějící / krátké názvy (autofill z OEM + manufacturer)
  const { data: emptyNames, count: emptyNameCount } = await s
    .from("parts_new")
    .select("id, oem_number, manufacturer", { count: "exact" })
    .or("name.is.null,name.eq.")
    .limit(50);
  summary.empty_names = emptyNameCount || 0;
  if ((emptyNameCount || 0) > 0) {
    critical.push({
      severity: "medium",
      code: "MISSING_NAMES",
      title: `${emptyNameCount} dílů bez názvu`,
      message: 'Doplnit z OEM čísla a výrobce (např. Mopar 68XXXXXX).',
      fixable: true,
      fix_type: "fill_missing_names",
      details: emptyNames?.slice(0, 10) || [],
    });
  }

  // 8) Nekategorizované díly s rozpoznatelným názvem (heuristika)
  const { data: uncatSample } = await s
    .from("parts_new")
    .select("id, oem_number, name")
    .or("category.is.null,category.eq.")
    .not("name", "is", null)
    .limit(500);
  const guessable = (uncatSample || [])
    .map((p) => ({ id: p.id, oem: p.oem_number, name: p.name, guess: guessCategoryFromName(p.name || "") }))
    .filter((p) => p.guess);
  summary.guessable_categories = guessable.length;
  if (guessable.length > 0) {
    critical.push({
      severity: "high",
      code: "GUESSABLE_CATEGORIES",
      title: `${guessable.length} dílů lze automaticky zařadit do kategorie podle názvu`,
      message: "Heuristika dle klíčových slov v názvu (brzd, filtr, motor, …).",
      fixable: true,
      fix_type: "assign_categories_by_name",
      details: guessable.slice(0, 15),
    });
  }

  const sevRank = (s: string) =>
    s === "critical" ? 0 : s === "high" ? 1 : s === "medium" ? 2 : 3;
  critical.sort((a, b) => sevRank(a.severity) - sevRank(b.severity));

  await s.from("catalog_diagnostic_runs").update({
    critical_issues: critical,
    validation_summary: summary,
    current_step: `✅ Prioritní validace dokončena — ${critical.length} zjištění`,
  }).eq("id", runId);

  return { critical, summary };
}

function NAME_TRANSLATIONS_TO_OR() {
  // Postaví .or() filter pro Supabase: name.ilike.%KEY%,name.ilike.%KEY2%
  const keys = Object.keys(NAME_TRANSLATIONS).slice(0, 30); // limit aby nepřetekl URL
  return keys.map((k) => `name.ilike.%${k}%`).join(",");
}

// ============= GENEROVÁNÍ NÁVRHŮ OPRAV =============
async function generateFixProposals(runId: string, critical: any[], summary: Record<string, number>) {
  const s = sb();
  await s.from("catalog_diagnostic_runs").update({
    current_step: "📋 Generuji návrhy oprav…",
  }).eq("id", runId);

  for (const issue of critical) {
    if (!issue.fixable) continue;

    if (issue.fix_type === "mark_on_order") {
      const { data: sample } = await s
        .from("parts_new")
        .select("id, oem_number, name, availability")
        .or("price_with_vat.is.null,price_with_vat.eq.0")
        .limit(10);
      await s.from("catalog_diagnostic_fixes").insert({
        run_id: runId,
        fix_type: "mark_on_order",
        severity: "critical",
        title: `Označit ${summary.zero_price_total} dílů jako "Na objednávku"`,
        description: 'Nastaví availability = "on_order" u všech dílů s cenou 0 nebo NULL.',
        affected_count: summary.zero_price_total,
        preview: sample,
        payload: {},
      });
    }

    if (issue.fix_type === "normalize_categories") {
      const mappable = (issue.details || []).filter((d: any) => d.to);
      if (mappable.length > 0) {
        await s.from("catalog_diagnostic_fixes").insert({
          run_id: runId,
          fix_type: "normalize_categories",
          severity: "high",
          title: `Sjednotit ${mappable.length} variant kategorií na kanonické`,
          description: `Přesune díly z nekanonických kategorií (např. "Brzdy" → "Brzdové zařízení").`,
          affected_count: mappable.reduce((a: number, b: any) => a + b.count, 0),
          preview: mappable.slice(0, 15),
          payload: { mappings: mappable },
        });
      }
    }

    if (issue.fix_type === "rebuild_compatibility") {
      await s.from("catalog_diagnostic_fixes").insert({
        run_id: runId,
        fix_type: "rebuild_compatibility",
        severity: "high",
        title: `Spustit auto-matcher pro ${summary.unmapped_parts} nezařazených dílů`,
        description: "Zavolá compat-matcher s match-all pro fuzzy/exact párování OEM ↔ Nextis vozidla.",
        affected_count: summary.unmapped_parts,
        preview: [],
        payload: { limit: Math.min(summary.unmapped_parts, 1000) },
      });
    }

    if (issue.fix_type === "translate_names") {
      const previews: any[] = [];
      for (const [de, cs] of Object.entries(NAME_TRANSLATIONS).slice(0, 8)) {
        const { data } = await s.from("parts_new").select("oem_number, name").ilike("name", `%${de}%`).limit(2);
        for (const row of data || []) {
          previews.push({ oem: row.oem_number, before: row.name, after: cs });
        }
      }
      await s.from("catalog_diagnostic_fixes").insert({
        run_id: runId,
        fix_type: "translate_names",
        severity: "medium",
        title: `Přeložit ${summary.translatable_names} názvů z DE/EN do CZ`,
        description: "Použije slovník známých německých/anglických termínů.",
        affected_count: summary.translatable_names,
        preview: previews.slice(0, 15),
        payload: {},
      });
    }

    if (issue.fix_type === "dedupe_oem") {
      await s.from("catalog_diagnostic_fixes").insert({
        run_id: runId,
        fix_type: "dedupe_oem",
        severity: "medium",
        title: `Vytvořit supersessions pro ${summary.duplicate_oems} duplicit`,
        description: "Sloučí duplicitní OEM přes part_supersessions (zachová oba záznamy, vrátí jen kanonický).",
        affected_count: summary.duplicate_oems,
        preview: [],
        payload: {},
      });
    }

    if (issue.fix_type === "fill_missing_names") {
      const previews = (issue.details || []).map((p: any) => ({
        oem: p.oem_number,
        before: "(prázdné)",
        after: `${p.manufacturer || "Mopar"} ${p.oem_number || ""}`.trim(),
      }));
      await s.from("catalog_diagnostic_fixes").insert({
        run_id: runId,
        fix_type: "fill_missing_names",
        severity: "medium",
        title: `Doplnit ${summary.empty_names} chybějících názvů`,
        description: 'Vygeneruje název ve formátu "VÝROBCE OEM" pro díly bez názvu.',
        affected_count: summary.empty_names,
        preview: previews,
        payload: {},
      });
    }

    if (issue.fix_type === "assign_categories_by_name") {
      const previews = (issue.details || []).map((p: any) => ({
        oem: p.oem,
        name: p.name,
        category: p.guess,
      }));
      await s.from("catalog_diagnostic_fixes").insert({
        run_id: runId,
        fix_type: "assign_categories_by_name",
        severity: "high",
        title: `Auto-zařadit ${summary.guessable_categories} dílů do kategorie podle názvu`,
        description: "Heuristika klíčových slov v názvu (brzd → Brzdové zařízení, filtr → Filtry, …).",
        affected_count: summary.guessable_categories,
        preview: previews,
        payload: {},
      });
    }

// ============= APLIKACE OPRAV =============
async function applyFix(fixId: string, userId: string | null) {
  const s = sb();
  const { data: fix, error: fxErr } = await s
    .from("catalog_diagnostic_fixes")
    .select("*")
    .eq("id", fixId)
    .single();
  if (fxErr || !fix) throw new Error("Oprava nenalezena");
  if (fix.status !== "pending" && fix.status !== "approved") {
    throw new Error(`Oprava je ve stavu ${fix.status}, nelze aplikovat.`);
  }

  let appliedCount = 0;
  let errorMsg: string | null = null;

  try {
    if (fix.fix_type === "mark_on_order") {
      const { count } = await s
        .from("parts_new")
        .update({ availability: "on_order" })
        .or("price_with_vat.is.null,price_with_vat.eq.0")
        .select("*", { count: "exact", head: true });
      appliedCount = count || 0;
    }

    else if (fix.fix_type === "normalize_categories") {
      const mappings = (fix.payload?.mappings || []) as { from: string; to: string }[];
      for (const m of mappings) {
        if (!m.to) continue;
        const { count } = await s
          .from("parts_new")
          .update({ category: m.to })
          .eq("category", m.from)
          .select("*", { count: "exact", head: true });
        appliedCount += count || 0;
      }
    }

    else if (fix.fix_type === "translate_names") {
      for (const [de, cs] of Object.entries(NAME_TRANSLATIONS)) {
        // exact match (case insensitive) — bezpečnější než ilike replace
        const { data: matches } = await s.from("parts_new").select("id, name").ilike("name", de);
        for (const m of matches || []) {
          await s.from("parts_new").update({ name: cs }).eq("id", m.id);
          appliedCount++;
        }
      }
    }

    else if (fix.fix_type === "fill_missing_names") {
      // Najít všechny prázdné názvy a doplnit "VÝROBCE OEM"
      const { data: empties } = await s
        .from("parts_new")
        .select("id, oem_number, manufacturer")
        .or("name.is.null,name.eq.")
        .limit(5000);
      for (const p of empties || []) {
        const newName = `${p.manufacturer || "Mopar"} ${p.oem_number || ""}`.trim();
        if (newName.length < 3) continue;
        await s.from("parts_new").update({ name: newName }).eq("id", p.id);
        appliedCount++;
      }
    }

    else if (fix.fix_type === "assign_categories_by_name") {
      // Iterovat všechny díly bez kategorie a heuristicky přiřadit
      const { data: uncats } = await s
        .from("parts_new")
        .select("id, name")
        .or("category.is.null,category.eq.")
        .not("name", "is", null)
        .limit(10000);
      for (const p of uncats || []) {
        const guess = guessCategoryFromName(p.name || "");
        if (!guess) continue;
        await s.from("parts_new").update({ category: guess }).eq("id", p.id);
        appliedCount++;
      }
    }

    else if (fix.fix_type === "rebuild_compatibility") {
      // Zavoláme compat-matcher
      const url = `${SUPABASE_URL}/functions/v1/compat-matcher`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${SERVICE_KEY}`,
        },
        body: JSON.stringify({ action: "match-all", limit: fix.payload?.limit || 500 }),
      });
      const json = await resp.json();
      appliedCount = json?.matched || json?.processed || 0;
    }

    else if (fix.fix_type === "dedupe_oem") {
      // Najít duplicitní OEM a vytvořit supersession z dražší varianty na nejlevnější
      const { data: parts } = await s
        .from("parts_new")
        .select("id, oem_number, price_with_vat, catalog_source")
        .order("price_with_vat", { ascending: true })
        .limit(20000);
      const groups = new Map<string, any[]>();
      for (const p of parts || []) {
        const norm = (p.oem_number || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
        if (!norm) continue;
        if (!groups.has(norm)) groups.set(norm, []);
        groups.get(norm)!.push(p);
      }
      for (const [_norm, group] of groups) {
        if (group.length < 2) continue;
        const canonical = group[0]; // nejnižší cena = preferovaný
        for (const dup of group.slice(1)) {
          if (dup.oem_number === canonical.oem_number) continue;
          await s.from("part_supersessions").insert({
            old_oem_number: dup.oem_number,
            new_oem_number: canonical.oem_number,
            source: "diagnostic_dedupe",
          });
          appliedCount++;
        }
      }
    }

    await s.from("catalog_diagnostic_fixes").update({
      status: "applied",
      applied_count: appliedCount,
      applied_at: new Date().toISOString(),
      applied_by: userId,
    }).eq("id", fixId);

    return { success: true, applied: appliedCount };
  } catch (err) {
    errorMsg = String((err as Error)?.message || err);
    await s.from("catalog_diagnostic_fixes").update({
      status: "failed",
      error_message: errorMsg,
    }).eq("id", fixId);
    throw err;
  }
}

// ============= HLAVNÍ SKEN (zachován + integrace fixes) =============
async function runScan(runId: string) {
  const s = sb();
  try {
    // Krok 1: Prioritní validace
    const { critical, summary } = await priorityValidation(runId);
    console.log(`[catalog-diagnostic] priority validation: ${critical.length} critical issues`);

    // Krok 2: Hluboký sken per kombinace
    const { data: vehicles } = await s
      .from("nextis_vehicles")
      .select("brand, model, engine")
      .in("brand", ALLOWED_BRANDS);

    const combosSet = new Set<string>();
    const combos: { brand: string; model: string; engine: string | null }[] = [];
    for (const v of vehicles || []) {
      const key = `${v.brand}|${v.model}|${v.engine || ""}`;
      if (!combosSet.has(key)) {
        combosSet.add(key);
        combos.push({ brand: v.brand, model: v.model, engine: v.engine || null });
      }
    }

    const totalCombinations = combos.length * (CANONICAL_CATEGORIES.length + 1);
    await s.from("catalog_diagnostic_runs").update({
      total_combinations: totalCombinations,
      status: "running",
      current_step: `Načteno ${combos.length} kombinací vozidel`,
    }).eq("id", runId);

    let processed = 0, totalParts = 0, totalIssues = 0;

    for (const combo of combos) {
      const { data: runRow } = await s
        .from("catalog_diagnostic_runs").select("status").eq("id", runId).maybeSingle();
      if (runRow?.status === "cancelled") return;

      let q = s.from("parts_new")
        .select("oem_number, name, category, price_with_vat, price_without_vat, compatible_vehicles")
        .ilike("compatible_vehicles", `%${combo.brand}%`)
        .ilike("compatible_vehicles", `%${combo.model}%`);
      if (combo.engine) q = q.ilike("compatible_vehicles", `%${combo.engine}%`);
      const { data: parts, error: pErr } = await q.limit(2000);

      if (pErr) {
        processed += CANONICAL_CATEGORIES.length + 1;
        continue;
      }

      const allParts = parts || [];
      totalParts += allParts.length;
      const allResult = analyze(allParts, null);
      totalIssues += allResult.issues.length;
      await s.from("catalog_diagnostic_results").insert({
        run_id: runId,
        brand: combo.brand,
        model: combo.model,
        engine: combo.engine,
        category: null,
        ...allResult.metrics,
        issues: allResult.issues,
        sample_oems: allResult.samples,
      });
      processed++;

      for (const cat of CANONICAL_CATEGORIES) {
        const catParts = allParts.filter((p) => (p.category || "").trim() === cat);
        const r = analyze(catParts, cat);
        totalIssues += r.issues.length;
        await s.from("catalog_diagnostic_results").insert({
          run_id: runId,
          brand: combo.brand,
          model: combo.model,
          engine: combo.engine,
          category: cat,
          ...r.metrics,
          issues: r.issues,
          sample_oems: r.samples,
        });
        processed++;
      }

      await s.from("catalog_diagnostic_runs").update({
        processed_combinations: processed,
        total_parts_found: totalParts,
        issues_found: totalIssues,
        current_step: `${combo.brand} ${combo.model} ${combo.engine || ""} (${processed}/${totalCombinations})`,
      }).eq("id", runId);
    }

    // Krok 3: Vygenerovat návrhy oprav
    await generateFixProposals(runId, critical, summary);

    await s.from("catalog_diagnostic_runs").update({
      status: "completed",
      finished_at: new Date().toISOString(),
      current_step: "✅ Diagnostika dokončena. Zkontroluj návrhy oprav.",
      processed_combinations: processed,
      total_parts_found: totalParts,
      issues_found: totalIssues,
    }).eq("id", runId);
  } catch (err) {
    console.error("[catalog-diagnostic] fatal", err);
    await s.from("catalog_diagnostic_runs").update({
      status: "failed",
      last_error: String((err as Error)?.message || err),
      finished_at: new Date().toISOString(),
    }).eq("id", runId);
  }
}

function analyze(parts: any[], category: string | null) {
  const issues: any[] = [];
  const oemMap = new Map<string, number>();
  let missingNames = 0, missingPrices = 0, zeroPrice = 0, uncategorized = 0;
  for (const p of parts) {
    const oem = (p.oem_number || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (oem) oemMap.set(oem, (oemMap.get(oem) || 0) + 1);
    if (!p.name || p.name.trim().length < 3) missingNames++;
    const price = Number(p.price_with_vat || 0);
    if (price === 0 || p.price_with_vat == null) zeroPrice++;
    if (p.price_with_vat == null) missingPrices++;
    if (!p.category || !p.category.trim()) uncategorized++;
  }
  const duplicates = [...oemMap.values()].filter((v) => v > 1).length;
  const samples = parts.slice(0, 5).map((p) => ({
    oem: p.oem_number, name: p.name, category: p.category, price: p.price_with_vat,
  }));
  if (parts.length === 0 && category) {
    issues.push({ severity: "info", code: "EMPTY_CATEGORY", message: `Žádné díly v kategorii ${category}` });
  }
  if (missingNames > 0) issues.push({ severity: "warn", code: "MISSING_NAMES", count: missingNames });
  if (zeroPrice > 0) issues.push({ severity: "warn", code: "ZERO_PRICE", count: zeroPrice });
  if (duplicates > 0) issues.push({ severity: "warn", code: "DUPLICATES", count: duplicates });
  if (uncategorized > 0 && !category) issues.push({ severity: "info", code: "UNCATEGORIZED", count: uncategorized });
  return {
    metrics: {
      parts_count: parts.length,
      oem_unique_count: oemMap.size,
      duplicates_count: duplicates,
      missing_names_count: missingNames,
      missing_prices_count: missingPrices,
      zero_price_count: zeroPrice,
      uncategorized_count: uncategorized,
    },
    issues, samples,
  };
}

// ============= HTTP HANDLER =============
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json();
    const action = body?.action;
    const s = sb();

    if (action === "start") {
      const { data: active } = await s
        .from("catalog_diagnostic_runs")
        .select("id")
        .in("status", ["pending", "running"])
        .maybeSingle();
      if (active?.id) return json({ success: true, run_id: active.id, reused: true });

      const { data: run, error } = await s
        .from("catalog_diagnostic_runs")
        .insert({ status: "pending", started_by: body?.user_id || null, current_step: "Inicializace…" })
        .select("id").single();
      if (error) throw error;
      // @ts-ignore
      EdgeRuntime.waitUntil(runScan(run.id));
      return json({ success: true, run_id: run.id });
    }

    if (action === "status") {
      const runId = body?.run_id;
      if (!runId) return json({ success: false, error: "run_id required" }, 400);
      const { data: run } = await s.from("catalog_diagnostic_runs").select("*").eq("id", runId).maybeSingle();
      const { data: results } = await s
        .from("catalog_diagnostic_results").select("*").eq("run_id", runId)
        .order("checked_at", { ascending: false }).limit(500);
      const { data: fixes } = await s
        .from("catalog_diagnostic_fixes").select("*").eq("run_id", runId)
        .order("created_at", { ascending: true });
      return json({ success: true, run, results: results || [], fixes: fixes || [] });
    }

    if (action === "cancel") {
      const runId = body?.run_id;
      if (!runId) return json({ success: false, error: "run_id required" }, 400);
      await s.from("catalog_diagnostic_runs").update({
        status: "cancelled",
        finished_at: new Date().toISOString(),
        current_step: "Zrušeno administrátorem",
      }).eq("id", runId);
      return json({ success: true });
    }

    if (action === "latest") {
      const { data: run } = await s
        .from("catalog_diagnostic_runs").select("*")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      return json({ success: true, run });
    }

    if (action === "applyFix") {
      const fixId = body?.fix_id;
      if (!fixId) return json({ success: false, error: "fix_id required" }, 400);
      const result = await applyFix(fixId, body?.user_id || null);
      return json({ success: true, ...result });
    }

    if (action === "rejectFix") {
      const fixId = body?.fix_id;
      if (!fixId) return json({ success: false, error: "fix_id required" }, 400);
      await s.from("catalog_diagnostic_fixes").update({ status: "rejected" }).eq("id", fixId);
      return json({ success: true });
    }

    return json({ success: false, error: "Unknown action", action }, 400);
  } catch (err) {
    return json({ success: false, error: String((err as Error)?.message || err) }, 500);
  }
});
