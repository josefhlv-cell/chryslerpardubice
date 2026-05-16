// J+M Autodíly / Nextis API Proxy
// Verified against the official Nextis swagger:
//   https://api.jmautodily.nextis.cz/swagger/v1/swagger.json
//
// Real endpoints (POST, kebab-case, token goes in BODY, not header):
//   /common/authentication            -> { login, password } -> { token, tokenValidTo, ... }
//   /catalogs/items-finding-by-code   -> { token, code, ... }
//   /catalogs/items-finding-by-vehicle-> { token, engineID, ... }
//   /catalogs/items-checking          -> { token, items: [{prefix?, code, brand?}] } -> price + stock
//
// Nextis does NOT expose any vehicle-tree endpoint, so syncCategories seeds
// the local catalog_categories tree from a curated whitelist instead.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BASE_URL = 'https://api.jmautodily.nextis.cz';

// Blacklist-first approach: any brand passes UNLESS it's explicitly banned.
// Rationale: if a part matches the OEM code, it's relevant to the customer.
const BLACKLISTED_BRANDS = [
  'starline', // explicit business rule (low quality)
];

// Kept for reference / potential UI badges, but no longer used to filter out.
const PREFERRED_BRANDS = [
  // OEM / US
  'chrysler', 'dodge', 'jeep', 'ram', 'cadillac', 'chevrolet', 'chevy',
  'gmc', 'buick', 'ford', 'lincoln', 'mercury', 'pontiac', 'hummer',
  'tesla', 'oldsmobile', 'plymouth', 'saturn', 'mopar',
  // Universal premium
  'bosch', 'mann', 'mahle', 'denso', 'ngk', 'gates', 'febi', 'valeo',
  'sachs', 'lemforder', 'trw', 'brembo', 'monroe', 'bilstein',
  // Major aftermarket
  'as-pl', 'as pl', 'aspl', 'blue print', 'blueprint', 'swag', 'meyle',
  'hella', 'delphi', 'magneti marelli', 'marelli', 'filtron', 'champion',
  // US specialists
  'febest', 'moog', 'raybestos', 'cardone', 'standard motor products',
  'standard', 'walker',
];

function isBlacklisted(producer: string | null | undefined): boolean {
  if (!producer) return false;
  const p = producer.toLowerCase().trim();
  return BLACKLISTED_BRANDS.some((b) => p.includes(b));
}

// Phase 1 policy: keep ALL brands except (a) blacklisted, (b) no-name (empty/null brand).
// No-name parts are typically low-quality unbranded items — drop them.
function isAllowedBrand(producer: string | null | undefined): boolean {
  if (!producer) return false; // no-name filter
  const p = String(producer).trim();
  if (p.length === 0) return false; // no-name filter
  if (/^(no[\s-]?name|noname|n\/a|unknown|generic)$/i.test(p)) return false;
  return !isBlacklisted(p);
}

// Backwards-compat alias still used in a couple of call sites.
function isUsBrand(producer: string | null | undefined): boolean {
  return isAllowedBrand(producer);
}

// Whitelist of vehicle brands we expose via the curated catalog tree.
const ALLOWED_BRANDS: readonly string[] = ["chrysler", "dodge", "ram", "lancia"];

// ---------- token cache ----------
let cachedToken: { token: string; expiresAt: number } | null = null;

// ---------- searchByCode in-memory cache (5 min TTL) ----------
// Survives between warm Edge invocations on the same isolate.
const _searchByCodeCache = new Map<string, { result: any; ts: number }>();
const SEARCH_CODE_TTL = 5 * 60 * 1000;

// ---------- structured event logger (writes to catalog_event_log) ----------
// Fire-and-forget: failures must never break the request flow.
async function logCatalogEvent(
  adminClient: any,
  params: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    event: string;
    message?: string;
    oem_number?: string | null;
    vehicle_id?: string | null;
    category?: string | null;
    duration_ms?: number;
    details?: Record<string, unknown>;
  },
) {
  try {
    await adminClient.from('catalog_event_log').insert({
      source: 'jm-proxy',
      level: params.level ?? 'info',
      event: params.event,
      message: params.message ?? null,
      oem_number: params.oem_number ?? null,
      vehicle_id: params.vehicle_id ?? null,
      category: params.category ?? null,
      duration_ms: params.duration_ms ?? null,
      details: params.details ?? {},
    });
  } catch (e) {
    console.warn('[logCatalogEvent] insert failed:', (e as Error).message);
  }
}

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.token;

  const login = Deno.env.get('JM_LOGIN');
  const password = Deno.env.get('JM_PASS');
  if (!login || !password) throw new Error('Missing JM_LOGIN / JM_PASS');

  const res = await fetch(`${BASE_URL}/common/authentication`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Nextis auth ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.token || data.Token;
  if (!token) throw new Error(`Nextis auth: no token (status=${data.status ?? '?'} ${data.statusText ?? ''})`);

  const validTo = data.tokenValidTo
    ? new Date(data.tokenValidTo).getTime()
    : Date.now() + 110 * 60 * 1000;
  cachedToken = { token, expiresAt: validTo };
  return token;
}

// ---------- Nextis low-level call ----------
async function nextisPost(path: string, body: Record<string, unknown>): Promise<any> {
  const token = await getToken();
  const payload = { token, language: 'cs', ...body };

  // 15s timeout — long enough for crossref ladder traversal, short enough to fail fast.
  const doFetch = (tok: string) =>
    fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, token: tok }),
      signal: AbortSignal.timeout(15000),
    });

  let res = await doFetch(token);

  if (res.status === 401) {
    cachedToken = null;
    const fresh = await getToken();
    res = await doFetch(fresh);
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    const err = new Error(`Nextis ${path} ${res.status}: ${t.slice(0, 300)}`);
    (err as any).status = res.status;
    throw err;
  }
  return await res.json();
}

// ---------- nextisPost with retry/backoff (used for batch TECDOC scan) ----------
async function nextisPostWithRetry(
  path: string,
  body: Record<string, unknown>,
  opts: { timeoutMs?: number; maxAttempts?: number } = {},
): Promise<{ ok: true; data: any; attempts: number } | { ok: false; error: string; attempts: number; timedOut: boolean }> {
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxAttempts = opts.maxAttempts ?? 3;
  const backoff = [250, 750, 2000];
  let lastErr = '';
  let timedOut = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const token = await getToken();
      const res = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ token, language: 'cs', ...body }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.status === 401) {
        cachedToken = null;
        // retry with fresh token next iteration
        lastErr = '401 unauthorized';
        await new Promise((r) => setTimeout(r, backoff[attempt - 1] ?? 1000));
        continue;
      }
      if (!res.ok) {
        const t = await res.text().catch(() => '');
        lastErr = `${res.status}: ${t.slice(0, 200)}`;
        // only retry 5xx
        if (res.status >= 500 && attempt < maxAttempts) {
          await new Promise((r) => setTimeout(r, backoff[attempt - 1] ?? 1000));
          continue;
        }
        return { ok: false, error: lastErr, attempts: attempt, timedOut: false };
      }
      const data = await res.json();
      return { ok: true, data, attempts: attempt };
    } catch (e: any) {
      lastErr = e?.message || String(e);
      timedOut = e?.name === 'TimeoutError' || /timeout/i.test(lastErr);
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, backoff[attempt - 1] ?? 1000));
        continue;
      }
    }
  }
  return { ok: false, error: lastErr, attempts: maxAttempts, timedOut };
}

// ---------- generic concurrency-limited mapper ----------
async function runConcurrent<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, idx: number) => Promise<R>,
  onEach?: (idx: number, total: number) => void,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  let completed = 0;
  const total = items.length;
  const runners = Array.from({ length: Math.min(limit, total) }, async () => {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      results[idx] = await worker(items[idx], idx);
      completed++;
      try { onEach?.(completed, total); } catch (_) { /* noop */ }
    }
  });
  await Promise.all(runners);
  return results;
}

// ---------- progress writer (write-through to api_cache) ----------
async function writeScanProgress(adminClient: any, key: string, payload: Record<string, unknown>) {
  try {
    await adminClient.from('api_cache').upsert({
      cache_type: 'jm_scan_progress',
      cache_key: key,
      data: { ...payload, updated_at: new Date().toISOString() },
      ttl_seconds: 300,
      created_at: new Date().toISOString(),
    }, { onConflict: 'cache_type,cache_key' });
  } catch (_) { /* non-blocking */ }
}

// ---------- K-type resolver (vehicle_engine_mappings → nextis_vehicles → public J+M selector) ----------
type KTypeSource = 'mapping_vin' | 'mapping_config' | 'nextis_external_id' | 'jm_eshop' | 'none';

const JM_PUBLIC_MANUFACTURER_IDS: Record<string, number> = {
  chrysler: 20,
  dodge: 29,
  ram: 3689,
  lancia: 64,
};

function normRoute(s: string): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normLoose(s: string): string {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9.]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function htmlDecode(s: string): string {
  return String(s || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

async function jmPublicPostApi(path: string, params: Record<string, string | number | boolean>): Promise<string> {
  const qs = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)])).toString();
  const res = await fetch(`https://eshop.jmautodily.cz/ajax-api/${path}?${qs}`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0',
      'Content-Type': 'application/json; charset=utf-8',
      'X-Requested-With': 'XMLHttpRequest',
      Accept: 'application/json, text/javascript, */*; q=0.01',
      Referer: 'https://eshop.jmautodily.cz/cs',
    },
    body: '',
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`J+M public selector ${res.status}`);
  const text = await res.text();
  const parsed = JSON.parse(text);
  return typeof parsed === 'string' ? parsed : String(parsed || '');
}

function parseSelectOptions(html: string, selectId: string): Array<{ id: number; label: string; route: string; meta: string }> {
  const reSelect = new RegExp(`<select[^>]+id=["']${selectId}["'][\\s\\S]*?<\\/select>`, 'i');
  const block = html.match(reSelect)?.[0] || '';
  const out: Array<{ id: number; label: string; route: string; meta: string }> = [];
  const re = /<option\s+([^>]*?)>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block))) {
    const attrs = m[1] || '';
    const id = Number(attrs.match(/value=["']([^"']+)/i)?.[1] || 0);
    if (!id || id < 0) continue;
    out.push({
      id,
      route: htmlDecode(attrs.match(/data-flex-route-name=["']([^"']*)/i)?.[1] || ''),
      meta: htmlDecode(attrs.match(/data-flex-additional-text=["']([^"']*)/i)?.[1] || ''),
      label: htmlDecode((m[2] || '').replace(/<[^>]+>/g, '').trim()),
    });
  }
  return out;
}

async function resolveKTypeFromJmPublicSelector(adminClient: any, hint: { brand: string; model: string; engine: string; year?: number }): Promise<{ k_type: number; source: KTypeSource } | null> {
  const brandKey = normLoose(hint.brand).replace(/\s+/g, '');
  const manufacturerID = JM_PUBLIC_MANUFACTURER_IDS[brandKey];
  if (!manufacturerID || !hint.model || !hint.engine) return null;
  const cacheKey = `jm_public_ktype:${hint.brand}|${hint.model}|${hint.engine}|${hint.year || ''}`.toLowerCase();
  try {
    const { data: cached } = await adminClient.from('api_cache').select('data, created_at, ttl_seconds')
      .eq('cache_type', 'jm_public_ktype').eq('cache_key', cacheKey).maybeSingle();
    if (cached && Date.now() - new Date(cached.created_at).getTime() < (cached.ttl_seconds ?? 2592000) * 1000) {
      const k = Number((cached.data as any)?.k_type || 0);
      if (k > 0) return { k_type: k, source: 'jm_eshop' };
    }
  } catch (_) { /* noop */ }

  const htmlModels = await jmPublicPostApi('tecdoc/get-select-vehicle-wizard-steps', { manufacturerID, modelID: -1, engineID: -1 });
  const modelNeedle = normLoose(hint.model).replace(/\b(grand|town|country|and)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const models = parseSelectOptions(htmlModels, 'ModelSelector')
    .map((m) => {
      const label = normLoose(m.label);
      const route = normRoute(m.route);
      let score = 0;
      for (const token of modelNeedle.split(' ').filter((t) => t.length > 1)) if (label.includes(token) || route.includes(token)) score += 20;
      if (normLoose(hint.model).includes('town') && label.includes('voyager')) score += 25;
      if (hint.year && m.meta) {
        const years = [...m.meta.matchAll(/(\d{4})/g)].map((x) => Number(x[1]));
        if (years.length && hint.year >= (years[0] || 0) && (!years[1] || hint.year <= years[1])) score += 15;
      }
      return { ...m, score };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);
  const model = models[0];
  if (!model) return null;

  const htmlEngines = await jmPublicPostApi('tecdoc/get-select-vehicle-wizard-steps', { manufacturerID, modelID: model.id, engineID: -1 });
  const engineNeedle = normLoose(hint.engine).replace(/\b(v6|v8|hemi|srt|crd|td|tdi|hybrid)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const displacement = hint.engine.match(/\d+[.,]\d+/)?.[0]?.replace(',', '.');
  const engines = parseSelectOptions(htmlEngines, 'EngineSelector')
    .map((e) => {
      const hay = normLoose(`${e.label} ${e.route} ${e.meta}`);
      let score = 0;
      if (displacement && hay.includes(displacement)) score += 60;
      for (const token of engineNeedle.split(' ').filter((t) => t.length > 1)) if (hay.includes(token)) score += 12;
      if (/hemi/i.test(hint.engine) && /hemi/i.test(`${e.label} ${e.meta}`)) score += 25;
      if (/crd|diesel/i.test(hint.engine) && /crd|diesel/i.test(`${e.label} ${e.meta}`)) score += 25;
      return { ...e, score };
    })
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score);
  const engine = engines[0];
  if (!engine) return null;
  try {
    await adminClient.from('api_cache').upsert({
      cache_type: 'jm_public_ktype', cache_key: cacheKey,
      data: { k_type: engine.id, model_id: model.id, model: model.label, engine: engine.label, route_model: model.route, route_engine: engine.route },
      ttl_seconds: 60 * 60 * 24 * 30, created_at: new Date().toISOString(),
    }, { onConflict: 'cache_type,cache_key' });
  } catch (_) { /* noop */ }
  return { k_type: engine.id, source: 'jm_eshop' };
}

async function resolveKType(
  adminClient: any,
  hint: { brand?: string; model?: string; engine?: string; year?: number; vin?: string; nextisVehicleId?: string },
): Promise<{ k_type: number; source: KTypeSource; mappingId?: string }> {
  const brand = (hint.brand || '').trim();
  const model = (hint.model || '').trim();
  const engine = (hint.engine || '').trim();
  const vin = (hint.vin || '').trim().toUpperCase();
  const year = Number(hint.year || 0);
  const emergency300cMap: Record<string, number> = {
    '3.0 crd': 19059,
    '3.5 v6': 17957,
    '5.7 hemi': 17958,
    '6.1 srt8': 21586,
  };
  if (brand.toLowerCase() === 'chrysler' && model.toLowerCase() === '300c') {
    const normalizedEngine = engine.toLowerCase().replace(/\s+/g, ' ').trim();
    const k = emergency300cMap[normalizedEngine];
    if (k) return { k_type: k, source: 'mapping_config' };
  }

  if (brand && model) {
    try {
      const { data: mappings } = await adminClient
        .from('vehicle_engine_mappings')
        .select('id, k_type, vin_pattern, year_from, year_to, engine')
        .ilike('brand', brand)
        .ilike('model', model);
      if (Array.isArray(mappings) && mappings.length) {
        // 1. VIN pattern match (most specific)
        if (vin) {
          for (const m of mappings) {
            if (!m.vin_pattern) continue;
            try {
              if (new RegExp(m.vin_pattern, 'i').test(vin)) {
                return { k_type: Number(m.k_type), source: 'mapping_vin', mappingId: m.id };
              }
            } catch (_) { /* invalid regex, skip */ }
          }
        }
        // 2. Engine + year window match
        const engineLower = engine.toLowerCase();
        const candidates = mappings.filter((m: any) => {
          const me = String(m.engine || '').toLowerCase();
          if (engineLower && me && !(me.includes(engineLower) || engineLower.includes(me))) return false;
          if (year && m.year_from && year < m.year_from) return false;
          if (year && m.year_to && year > m.year_to) return false;
          return true;
        });
        if (candidates.length) return { k_type: Number(candidates[0].k_type), source: 'mapping_config', mappingId: candidates[0].id };
        // 3. Fallback first mapping for brand+model
        return { k_type: Number(mappings[0].k_type), source: 'mapping_config', mappingId: mappings[0].id };
      }
    } catch (e) {
      console.warn('[resolveKType] mapping lookup failed:', (e as Error).message);
    }
  }

  // 4. Legacy fallback: nextis_vehicles.external_id
  if (hint.nextisVehicleId) {
    try {
      const { data: v } = await adminClient
        .from('nextis_vehicles')
        .select('external_id')
        .eq('id', hint.nextisVehicleId)
        .maybeSingle();
      const ext = String(v?.external_id || '').trim();
      if (/^\d+$/.test(ext)) return { k_type: Number(ext), source: 'nextis_external_id' };
    } catch (_) { /* noop */ }
  }
  if (brand && model) {
    try {
      let q = adminClient
        .from('nextis_vehicles')
        .select('external_id, engine, year_from, year_to')
        .ilike('brand', brand)
        .ilike('model', model)
        .not('external_id', 'is', null);
      const { data: vehicles } = await q;
      const engineLower = engine.toLowerCase();
      const match = (vehicles || []).find((v: any) => {
        const ext = String(v.external_id || '').trim();
        const ve = String(v.engine || '').toLowerCase();
        if (!/^\d+$/.test(ext)) return false;
        if (engineLower && ve && !(ve.includes(engineLower) || engineLower.includes(ve))) return false;
        if (year && v.year_from && year < v.year_from) return false;
        if (year && v.year_to && year > v.year_to) return false;
        return true;
      }) || (vehicles || []).find((v: any) => /^\d+$/.test(String(v.external_id || '').trim()));
      const ext = String(match?.external_id || '').trim();
      if (/^\d+$/.test(ext)) return { k_type: Number(ext), source: 'nextis_external_id' };
    } catch (_) { /* noop */ }
  }
  if (brand && model && engine) {
    try {
      const jm = await resolveKTypeFromJmPublicSelector(adminClient, { brand, model, engine, year });
      if (jm?.k_type) return jm;
    } catch (e) {
      console.warn('[resolveKType] J+M public selector failed:', (e as Error).message);
    }
  }
  return { k_type: 0, source: 'none' };
}

// ---------- normalisation ----------
// Tiered J+M margin (per business decision):
//  - purchase price ≤ 4000 Kč (bez DPH) → +70 %
//  - purchase price >  4000 Kč (bez DPH) → +40 %
// OEM (Mopar): 0 % margin (price_locked). Universal: handled via UNIVERSAL_MARGIN.
const JM_MARGIN_LOW = 1.70;   // do 4000 Kč
const JM_MARGIN_HIGH = 1.40;  // od 4000 Kč
const JM_MARGIN_THRESHOLD = 4000;
function jmMarginFor(purchaseNoVat: number): number {
  return purchaseNoVat <= JM_MARGIN_THRESHOLD ? JM_MARGIN_LOW : JM_MARGIN_HIGH;
}
const UNIVERSAL_MARGIN = 1.20;

interface UnifiedPart {
  supplier: 'jm';
  oem_number: string;
  brand: string;
  name: string;
  description?: string;
  technical_parameters?: Record<string, string>;
  oe_numbers?: string[];
  price_without_vat: number;
  price_with_vat: number;
  stock: number;
  availability: string;
  image: string;
  image_urls?: string[];
  category: string;
  compatible_vehicles: string[];
  related_oem_number?: string;
  searched_code?: string;
}

type CategoryNode = {
  id: string;
  label: string;
  level: number;
  sectionId: number | null;
  path: string[];
  keywords: string[];
  count: number;
  children?: CategoryNode[];
};

const PRODUCT_CATEGORY_TREE: CategoryNode[] = [
  { id: 'safety', label: 'Bezpečnostní systém', level: 0, sectionId: null, path: ['Bezpečnostní systém'], keywords: ['bezpeč', 'bezpec', 'airbag', 'pás', 'pas', 'abs', 'srs'], count: 0 },
  {
    id: 'brakes', label: 'Brzdové zařízení', level: 0, sectionId: null, path: ['Brzdové zařízení'],
    keywords: ['brzd', 'brake', 'abs', 'třmen', 'trmen', 'kotouč', 'kotouc', 'destičk', 'destick'], count: 0,
    children: [
      {
        id: 'disc-brakes', label: 'Kotoučové brzdy', level: 1, sectionId: null, path: ['Brzdové zařízení', 'Kotoučové brzdy'],
        keywords: ['brzd', 'brake', 'kotouč', 'kotouc', 'destičk', 'destick', 'třmen', 'trmen'], count: 0,
        children: [
          { id: 'brake-pads', label: 'Brzdové destičky', level: 2, sectionId: null, path: ['Brzdové zařízení', 'Kotoučové brzdy', 'Brzdové destičky'], keywords: ['destičk', 'destick', 'brake pad', 'pads'], count: 0 },
          { id: 'brake-discs', label: 'Brzdové kotouče', level: 2, sectionId: null, path: ['Brzdové zařízení', 'Kotoučové brzdy', 'Brzdové kotouče'], keywords: ['kotouč', 'kotouc', 'disc', 'rotor'], count: 0 },
          { id: 'brake-calipers', label: 'Brzdové třmeny', level: 2, sectionId: null, path: ['Brzdové zařízení', 'Kotoučové brzdy', 'Brzdové třmeny'], keywords: ['třmen', 'trmen', 'caliper'], count: 0 },
        ],
      },
      { id: 'brake-fluid', label: 'Brzdová kapalina', level: 1, sectionId: null, path: ['Brzdové zařízení', 'Brzdová kapalina'], keywords: ['brzdová kapalina', 'brzdova kapalina', 'brake fluid', 'dot 3', 'dot 4'], count: 0 },
      { id: 'abs', label: 'ABS a snímače', level: 1, sectionId: null, path: ['Brzdové zařízení', 'ABS a snímače'], keywords: ['abs', 'snímač', 'snimac', 'sensor'], count: 0 },
    ],
  },
  { id: 'engine', label: 'Motor', level: 0, sectionId: null, path: ['Motor'], keywords: ['motor', 'engine', 'rozvod', 'svíčk', 'svick', 'těsnění', 'tesneni'], count: 0 },
  { id: 'filters', label: 'Filtry', level: 0, sectionId: null, path: ['Filtry'], keywords: ['filtr', 'filter'], count: 0 },
  { id: 'cooling', label: 'Chlazení', level: 0, sectionId: null, path: ['Chlazení'], keywords: ['chlad', 'cool', 'radiator', 'termostat'], count: 0 },
  { id: 'suspension', label: 'Odpružení a nápravy', level: 0, sectionId: null, path: ['Odpružení a nápravy'], keywords: ['odpruž', 'odpruz', 'tlumič', 'tlumic', 'náprav', 'naprav', 'rameno', 'suspension'], count: 0 },
  { id: 'steering', label: 'Řízení', level: 0, sectionId: null, path: ['Řízení'], keywords: ['řízení', 'rizeni', 'steer'], count: 0 },
  { id: 'transmission', label: 'Převodovka', level: 0, sectionId: null, path: ['Převodovka'], keywords: ['převod', 'prevod', 'transmission', 'gearbox'], count: 0 },
  { id: 'electrical', label: 'Elektroinstalace', level: 0, sectionId: null, path: ['Elektroinstalace'], keywords: ['elektr', 'alternátor', 'alternator', 'starter', 'senzor'], count: 0 },
  { id: 'body', label: 'Karoserie', level: 0, sectionId: null, path: ['Karoserie'], keywords: ['karoser', 'body', 'dveře', 'dvere', 'nárazník', 'naraznik'], count: 0 },
  { id: 'hvac', label: 'Klimatizace a topení', level: 0, sectionId: null, path: ['Klimatizace a topení'], keywords: ['klimat', 'topen', 'a/c', 'hvac'], count: 0 },
  { id: 'fuel', label: 'Palivový systém', level: 0, sectionId: null, path: ['Palivový systém'], keywords: ['paliv', 'fuel', 'vstřik', 'vstrik'], count: 0 },
  { id: 'exhaust', label: 'Výfuk', level: 0, sectionId: null, path: ['Výfuk'], keywords: ['výfuk', 'vyfuk', 'exhaust', 'katalyz', 'lambda', 'dpf'], count: 0 },
  { id: 'lighting', label: 'Osvětlení', level: 0, sectionId: null, path: ['Osvětlení'], keywords: ['světl', 'svetl', 'osvět', 'osvet', 'žárov', 'zarov', 'lamp'], count: 0 },
  { id: 'maintenance', label: 'Údržba', level: 0, sectionId: null, path: ['Údržba'], keywords: ['údrž', 'udrz', 'servis', 'stěrač', 'sterac'], count: 0 },
  { id: 'fluids', label: 'Kapaliny a oleje', level: 0, sectionId: null, path: ['Kapaliny a oleje'], keywords: ['olej', 'kapalin', 'fluid'], count: 0 },
  { id: 'other', label: 'Ostatní', level: 0, sectionId: null, path: ['Ostatní'], keywords: ['ostat', 'univerz', 'spojovac'], count: 0 },
];

function collectImageUrls(it: any): string[] {
  const candidates = [
    it.image,
    it.Image,
    it.imageUrl,
    it.ImageUrl,
    it.pictureUrl,
    it.PictureUrl,
    it.photoUrl,
    it.PhotoUrl,
    it.thumbnailUrl,
    it.ThumbnailUrl,
    it.documentUrl,
    it.DocumentUrl,
    it?.images,
    it?.Images,
    it?.pictures,
    it?.Pictures,
    it?.documents,
    it?.Documents,
  ];
  const urls = new Set<string>();
  const visit = (value: any) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) urls.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (typeof value === 'object') {
      [
        value.url, value.Url, value.URL,
        value.imageUrl, value.ImageUrl,
        value.pictureUrl, value.PictureUrl,
        value.thumbnailUrl, value.ThumbnailUrl,
        value.documentUrl, value.DocumentUrl,
      ].forEach(visit);
    }
  };
  candidates.forEach(visit);
  return [...urls];
}

function extractDescription(it: any): string {
  // Nextis exposes description under several names; pick the longest non-empty one
  const candidates = [
    it.productDescription, it.ProductDescription,
    it.description, it.Description,
    it.productDetail, it.ProductDetail,
    it.longDescription, it.LongDescription,
    it.note, it.Note,
  ].filter((v) => typeof v === 'string' && v.trim().length > 0);
  if (candidates.length === 0) return '';
  return String(candidates.sort((a, b) => b.length - a.length)[0]).trim();
}

function extractTechParams(it: any): Record<string, string> {
  const out: Record<string, string> = {};
  const sources = [
    it.technicalParameters, it.TechnicalParameters,
    it.parameters, it.Parameters,
    it.attributes, it.Attributes,
    it.features, it.Features,
  ];
  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      for (const row of src) {
        if (!row) continue;
        const key = String(row.name || row.Name || row.key || row.Key || row.label || row.Label || '').trim();
        const val = String(row.value || row.Value || row.text || row.Text || '').trim();
        if (key && val) out[key] = val;
      }
    } else if (typeof src === 'object') {
      for (const [k, v] of Object.entries(src)) {
        if (v != null && String(v).trim()) out[k] = String(v).trim();
      }
    }
  }
  return out;
}

function extractOeNumbers(it: any): string[] {
  const out = new Set<string>();
  const sources = [
    it.originalNumbers, it.OriginalNumbers,
    it.oeNumbers, it.OeNumbers, it.OENumbers,
    it.references, it.References,
    it.crossReferences, it.CrossReferences,
  ];
  for (const src of sources) {
    if (!src) continue;
    if (Array.isArray(src)) {
      for (const row of src) {
        if (typeof row === 'string') out.add(row.trim());
        else if (row && typeof row === 'object') {
          const v = row.number || row.Number || row.code || row.Code || row.oe || row.OE;
          if (v) out.add(String(v).trim());
        }
      }
    } else if (typeof src === 'string') {
      src.split(/[,;\s]+/).filter(Boolean).forEach((s) => out.add(s.trim()));
    }
  }
  return [...out].filter(Boolean);
}

function normalizeCatalogItem(it: any): UnifiedPart {
  // Real Nextis CatalogItem shape
  const code = it.productCode || it.ProductCode || '';
  const prefix = it.productPrefix || it.ProductPrefix || '';
  const brand = it.productBrand || it.ProductBrand || '';
  const name = it.productName || it.ProductName || it.productDescription || '';
  const description = extractDescription(it);
  const technical_parameters = extractTechParams(it);
  const oe_numbers = extractOeNumbers(it);
  const price = it.price || it.Price || {};
  const purchaseNoVat = Number(price.unitPrice ?? price.UnitPrice ?? 0);
  const purchaseVat = Number(price.unitPriceIncVAT ?? price.UnitPriceIncVAT ?? purchaseNoVat * 1.21);
  // Apply tiered J+M markup based on purchase price
  const margin = jmMarginFor(purchaseNoVat);
  const priceNoVat = purchaseNoVat * margin;
  const priceVat = purchaseVat * margin;
  const stock = Number(it.qtyAvailableMain ?? it.QtyAvailableMain ?? 0)
              + Number(it.qtyAvailableSupplier ?? it.QtyAvailableSupplier ?? 0);
  const imageUrls = collectImageUrls(it);
  // Capture TecDoc generic article (section) info if Nextis returns it
  const genArtId = Number(
    it.productGenericArticleID ?? it.ProductGenericArticleID ??
    it.genericArticleID ?? it.GenericArticleID ??
    it.genArtID ?? it.GenArtID ?? 0,
  ) || 0;
  const genArtName = String(
    it.productGenericArticleName ?? it.ProductGenericArticleName ??
    it.genericArticleName ?? it.GenericArticleName ?? '',
  ).trim();

  return {
    supplier: 'jm',
    oem_number: String(prefix ? `${prefix}${code}` : code).trim(),
    brand: String(brand).trim(),
    name: String(name).trim(),
    description,
    technical_parameters,
    oe_numbers,
    price_without_vat: Math.round(priceNoVat * 100) / 100,
    price_with_vat: Math.round(priceVat * 100) / 100,
    stock,
    availability: stock > 0 ? 'in_stock' : 'on_order',
    image: imageUrls[0] || '',
    image_urls: imageUrls,
    category: '',
    compatible_vehicles: [],
    // @ts-ignore — extra fields for client-side dynamic grouping
    gen_art_id: genArtId,
    gen_art_name: genArtName,
  };
}

function extractItems(raw: any): any[] {
  const list = raw?.items || raw?.Items || [];
  // ResponseItem wraps actual CatalogItem under .responseItem
  return list
    .map((row: any) => row.responseItem || row.ResponseItem || row)
    .filter(Boolean);
}

function normalizeItems(raw: any): UnifiedPart[] {
  return extractItems(raw)
    .map(normalizeCatalogItem)
    .filter((p) => p.oem_number && isUsBrand(p.brand));
}

function normalizeOemCode(value: string | null | undefined): string {
  return String(value || '').toUpperCase().replace(/[\s\-._/]/g, '').trim();
}

function baseEightDigits(value: string | null | undefined): string {
  return normalizeOemCode(value).replace(/^K/, '').match(/^\d{8}/)?.[0] || '';
}

function dedupeUnifiedParts(parts: UnifiedPart[]): UnifiedPart[] {
  const seen = new Set<string>();
  const out: UnifiedPart[] = [];
  for (const part of parts) {
    const key = `${normalizeOemCode(part.brand)}::${normalizeOemCode(part.oem_number)}`;
    if (!part.oem_number || seen.has(key)) continue;
    seen.add(key);
    out.push(part);
  }
  return out;
}

/**
 * Pro každý J+M díl z výsledků hledej jeho OE čísla (oe_numbers) v tabulce parts_new.
 * Pokud najdeme shodu s Mopar OEM, nastavíme related_oem_number → frontend díl
 * správně zařadí jako NÁHRADA pod správný ORIGINÁL.
 */
async function enrichItemsWithRelatedOem(
  adminClient: any,
  items: UnifiedPart[],
): Promise<UnifiedPart[]> {
  const allOeNumbers: string[] = [];
  for (const item of items) {
    if (item.oe_numbers?.length) {
      for (const oe of item.oe_numbers) {
        const norm = normalizeOemCode(oe);
        if (!norm) continue;
        allOeNumbers.push(norm);
        const stripped = norm.replace(/^K/, '');
        if (stripped !== norm) allOeNumbers.push(stripped);
      }
    }
  }
  if (allOeNumbers.length === 0) return items;

  try {
    const { data: oemRows } = await adminClient
      .from('parts_new')
      .select('oem_number')
      .in('oem_number', [...new Set(allOeNumbers)])
      .in('catalog_source', ['mopar', 'mopar_oem', '7zap', 'csv', 'epc-link'])
      .limit(500);

    if (!oemRows?.length) return items;

    const oeToMopar = new Map<string, string>();
    for (const row of oemRows) {
      const norm = normalizeOemCode(row.oem_number);
      if (!norm) continue;
      oeToMopar.set(norm, row.oem_number);
      oeToMopar.set(`K${norm}`, row.oem_number);
      oeToMopar.set(norm.replace(/^K/, ''), row.oem_number);
    }

    return items.map((item) => {
      if (item.related_oem_number) return item;
      for (const oe of item.oe_numbers || []) {
        const norm = normalizeOemCode(oe);
        const moparOem =
          oeToMopar.get(norm) || oeToMopar.get(norm.replace(/^K/, '')) || oeToMopar.get(`K${norm}`);
        if (moparOem) {
          return { ...item, related_oem_number: moparOem };
        }
      }
      return item;
    });
  } catch (e) {
    console.warn('[enrichItemsWithRelatedOem] failed:', (e as Error).message);
    return items;
  }
}

async function lookupCrossRefsForOem(adminClient: any, rawCode: string, limit = 50): Promise<Array<{ part_number: string; manufacturer: string }>> {
  const normalized = normalizeOemCode(rawCode);
  const stripped = normalized.replace(/^K/, '');
  const baseNoSuffix = stripped.replace(/[A-Z]{1,3}$/i, '');
  const base8 = baseEightDigits(stripped);
  const directCodes = [...new Set([rawCode, normalized, stripped, `K${stripped}`, baseNoSuffix, baseNoSuffix ? `K${baseNoSuffix}` : ''].filter(Boolean))];

  const collected = new Map<string, { part_number: string; manufacturer: string }>();
  const addRows = (rows: any[] | null | undefined) => {
    for (const x of rows || []) {
      const pn = String(x.part_number || '').trim();
      if (!pn) continue;
      const key = normalizeOemCode(pn);
      if (!collected.has(key)) collected.set(key, { part_number: pn, manufacturer: String(x.manufacturer || '').trim() });
    }
  };

  const escapedDirect = directCodes.map((code) => `oem_number.eq.${code}`).join(',');
  if (escapedDirect) {
    const { data, error } = await adminClient
      .from('part_crossref')
      .select('part_number, manufacturer, oem_number')
      .or(escapedDirect)
      .limit(limit);
    if (error) console.warn('[crossref] direct lookup failed:', error.message);
    addRows(data);
  }

  if (base8) {
    const { data, error } = await adminClient
      .from('part_crossref')
      .select('part_number, manufacturer, oem_number')
      .or(`oem_number.ilike.${base8}%,oem_number.ilike.K${base8}%`)
      .limit(limit);
    if (error) console.warn('[crossref] base lookup failed:', error.message);
    addRows(data);
  }

  return [...collected.values()].slice(0, limit);
}

async function fetchJmForSpecificCode(code: string, searchTarget: 'CodeOE' | 'CodeProduct' = 'CodeProduct'): Promise<{ rawCount: number; items: UnifiedPart[] }> {
  const targets: Array<string | undefined> = ['P', undefined, 'O'];

  // Run all three target attempts in PARALLEL — Nextis returns fast for misses,
  // so the cost of doing them concurrently is small and we save 2 round-trips.
  const calls = targets.map(async (target) => {
    const reqBody: Record<string, unknown> = {
      code,
      target,
      searchTarget,
      trySearchWithoutManufacturer: true,
      getOECodes: true,
      getDeposits: false,
      getServices: false,
      getCashBack: false,
      getEANCodes: false,
    };
    if (!target) delete reqBody.target;
    const raw = await nextisPost('/catalogs/items-finding-by-code', reqBody).catch((e) => ({ _error: String(e) }));
    const rawList = raw?.items || raw?.Items || [];
    return { rawCount: rawList.length, items: normalizeItems(raw) };
  });

  const results = await Promise.all(calls);
  let rawCount = 0;
  const collected: UnifiedPart[] = [];
  for (const r of results) {
    rawCount += r.rawCount;
    if (r.items.length > 0) collected.push(...r.items);
  }
  return { rawCount, items: dedupeUnifiedParts(collected) };
}

async function fetchJmViaCrossRefs(adminClient: any, oeCode: string, category = ''): Promise<{ items: UnifiedPart[]; xrefsTried: string[]; rawHits: number }> {
  const xrefs = await lookupCrossRefsForOem(adminClient, oeCode, 80);
  const xrefsTried: string[] = [];

  // Run all crossref lookups in PARALLEL. Each one was previously sequential and
  // could take 1-2s — for 3 refs that meant 3-6s extra latency.
  const tasks = xrefs.map(async (x) => {
    const partNumber = String(x.part_number || '').trim();
    if (!partNumber) return { rawCount: 0, items: [] as UnifiedPart[] };
    xrefsTried.push(partNumber);
    let result = await fetchJmForSpecificCode(partNumber, 'CodeProduct');
    if (result.items.length === 0) {
      const oeResult = await fetchJmForSpecificCode(partNumber, 'CodeOE');
      result = { rawCount: result.rawCount + oeResult.rawCount, items: oeResult.items };
    }
    return {
      rawCount: result.rawCount,
      items: result.items.map((part) => ({
        ...part,
        category: category || part.category,
        related_oem_number: oeCode,
        searched_code: partNumber,
      })),
    };
  });

  const settled = await Promise.allSettled(tasks);
  const items: UnifiedPart[] = [];
  let rawHits = 0;
  for (const r of settled) {
    if (r.status === 'fulfilled') {
      rawHits += r.value.rawCount;
      items.push(...r.value.items);
    }
  }

  return { items: dedupeUnifiedParts(items), xrefsTried, rawHits };
}

function localRowToUnifiedPart(row: any, category = ''): UnifiedPart {
  const priceWithVat = Number(row.price_with_vat) || 0;
  const priceWithoutVat = Number(row.price_without_vat) || (priceWithVat ? Math.round((priceWithVat / 1.21) * 100) / 100 : 0);
  return {
    supplier: 'jm',
    oem_number: String(row.oem_number || '').trim(),
    brand: String(row.manufacturer || row.catalog_source || 'OEM').trim(),
    name: String(row.name || row.oem_number || '').trim(),
    price_without_vat: priceWithoutVat,
    price_with_vat: priceWithVat,
    stock: priceWithVat > 0 ? 1 : 0,
    availability: String(row.availability || (priceWithVat > 0 ? 'available' : 'on_order')),
    image: Array.isArray(row.image_urls) ? String(row.image_urls[0] || '') : '',
    category: category || String(row.category || ''),
    compatible_vehicles: row.compatible_vehicles ? [String(row.compatible_vehicles)] : [],
  };
}

function normalizeText(value: string | null | undefined): string {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function rowMatchesKeywords(row: any, keywords: string[] = []): boolean {
  if (!keywords.length) return true;
  const haystack = normalizeText(`${row.name || ''} ${row.category || ''} ${row.description || ''} ${row.oem_number || ''}`);
  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
}

function itemMatchesKeywords(item: UnifiedPart, keywords: string[] = []): boolean {
  if (!keywords.length) return true;
  const haystack = normalizeText(`${item.name} ${item.category} ${item.oem_number}`);
  return keywords.some((keyword) => haystack.includes(normalizeText(keyword)));
}

const SECTION_ID_BY_CATEGORY_ID: Record<string, number> = {
  'brake-pads': 402,
  'brake-discs': 82,
  'brake-hoses': 95,
  'brake-calipers': 472,
  'oil-filter': 22,
  'air-filter': 26,
  'cabin-filter': 350,
  'fuel-filter': 23,
  'spark-plugs': 18,
  'timing-belt': 213,
  'water-pump': 50,
  'shock-absorbers': 51,
  'control-arms': 423,
  'bushings': 459,
  'tie-rods': 433,
  'ball-joints': 432,
  'alternator': 71,
  'starter': 72,
  'radiator': 31,
  'thermostat': 195,
  'exhaust': 64,
  'transmission': 252,
  'ac': 244,
};

// ---- TecDoc-style sections used to group J+M parts client-side ----
// Each section has an id (TecDoc genArtID), Czech label and keyword regex
// matched against productName + description (lowercase, no diacritics).
type TecdocSection = { id: number; label: string; keywords: string[] };
const TECDOC_SECTIONS: TecdocSection[] = [
  { id: 402, label: 'Brzdové destičky', keywords: ['destick', 'destic', 'brake pad', 'bremsbelag', 'klotz', 'oblozen brzd'] },
  { id: 82,  label: 'Brzdové kotouče',  keywords: ['kotouc brzd', 'brake disc', 'brake rotor', 'bremsscheibe'] },
  { id: 472, label: 'Brzdové třmeny',   keywords: ['trmen', 'caliper', 'bremssattel'] },
  { id: 95,  label: 'Brzdové hadice',   keywords: ['hadic brzd', 'brake hose', 'brake line'] },
  { id: 1789,label: 'Brzdová kapalina', keywords: ['brzdov kapalin', 'brake fluid', 'dot 3', 'dot 4', 'dot 5'] },
  { id: 1226,label: 'ABS senzory',      keywords: ['abs', 'snimac otacek kola'] },
  { id: 1769,label: 'Brzdový válec',    keywords: ['brzdovy valec', 'wheel cylinder', 'radzylinder'] },
  { id: 22,  label: 'Olejový filtr',    keywords: ['olejov filtr', 'oil filter', 'oelfilter'] },
  { id: 26,  label: 'Vzduchový filtr',  keywords: ['vzduchov filtr', 'air filter', 'luftfilter'] },
  { id: 350, label: 'Filtr kabiny',     keywords: ['filtr kabin', 'cabin filter', 'pollen', 'innenraumfilter'] },
  { id: 23,  label: 'Palivový filtr',   keywords: ['palivov filtr', 'fuel filter', 'kraftstofffilter'] },
  { id: 18,  label: 'Zapalovací svíčky',keywords: ['svicka', 'spark plug', 'zundkerze'] },
  { id: 174, label: 'Zapalovací cívka', keywords: ['cevka zapal', 'ignition coil', 'zundspule'] },
  { id: 19,  label: 'Žhavící svíčky',   keywords: ['zhavic svic', 'glow plug', 'gluhkerze'] },
  { id: 213, label: 'Rozvodový řemen',  keywords: ['rozvodov remen', 'timing belt', 'zahnriemen'] },
  { id: 8929,label: 'Rozvodový řetěz',  keywords: ['rozvodov retez', 'timing chain', 'steuerkette'] },
  { id: 50,  label: 'Vodní čerpadlo',   keywords: ['vodni cerpad', 'water pump', 'wasserpumpe'] },
  { id: 195, label: 'Termostat',        keywords: ['termostat', 'thermostat'] },
  { id: 31,  label: 'Chladič',          keywords: ['chladic mot', 'radiator', 'kuhler'] },
  { id: 1707,label: 'Chladící kapalina',keywords: ['chladic kapalin', 'coolant', 'antifreeze'] },
  { id: 300, label: 'AC kompresor',     keywords: ['kompresor klim', 'ac compressor', 'klimakompressor'] },
  { id: 233, label: 'AC kondenzátor',   keywords: ['kondenz klim', 'ac condenser', 'klimakondensator'] },
  { id: 71,  label: 'Alternátor',       keywords: ['alternat', 'lichtmaschine', 'generator'] },
  { id: 72,  label: 'Startér',          keywords: ['starter', 'anlasser'] },
  { id: 590, label: 'Baterie',          keywords: ['baterie', 'battery', 'batterie'] },
  { id: 51,  label: 'Tlumiče',          keywords: ['tlumic narazu', 'shock absorber', 'stossdampf'] },
  { id: 419, label: 'Pružiny',          keywords: ['pruzin', 'spring', 'fahrwerksfeder'] },
  { id: 423, label: 'Ramena',           keywords: ['rameno zav', 'control arm', 'lenker', 'querlenker'] },
  { id: 432, label: 'Kulové čepy',      keywords: ['kulov cep', 'ball joint', 'traggelenk'] },
  { id: 433, label: 'Tyče řízení',      keywords: ['tyc rizen', 'tie rod', 'spurstange'] },
  { id: 459, label: 'Silentbloky',      keywords: ['silentblok', 'bushing', 'lagerung', 'gummilager'] },
  { id: 110, label: 'Ložiska kol',      keywords: ['lozisko kola', 'wheel bearing', 'radlager'] },
  { id: 204, label: 'Poloosy',          keywords: ['poloos', 'cv joint', 'antriebswelle', 'gelenkwelle'] },
  { id: 64,  label: 'Výfuk',            keywords: ['vyfuk', 'tlumic vyf', 'muffler', 'auspuff', 'schalldampfer'] },
  { id: 180, label: 'Lambda sonda',     keywords: ['lambda', 'oxygen sensor', 'lambdasonde'] },
  { id: 2840,label: 'DPF filtr',        keywords: ['dpf', 'particulate filter', 'partikelfilter'] },
  { id: 104, label: 'Katalyzátor',      keywords: ['katalyz', 'catalyst', 'katalysator'] },
  { id: 20,  label: 'Palivové čerpadlo',keywords: ['palivov cerpad', 'fuel pump', 'kraftstoffpumpe'] },
  { id: 29,  label: 'Vstřikovače',      keywords: ['vstrikov', 'injector', 'einspritz'] },
  { id: 1749,label: 'Motorový olej',    keywords: ['motorov olej', 'motor oil', 'motoroel'] },
  { id: 2769,label: 'Převodový olej',   keywords: ['prevodov olej', 'gear oil', 'getriebeoel'] },
  { id: 42,  label: 'Stěrače',          keywords: ['sterac', 'wiper', 'wischblatt'] },
  { id: 84,  label: 'Světlomety',       keywords: ['svetlomet', 'headlight', 'scheinwerfer'] },
  { id: 85,  label: 'Zadní světla',     keywords: ['zadni svetlo', 'tail light', 'heckleuchte'] },
  { id: 305, label: 'Zrcátka',          keywords: ['zrcatk', 'mirror', 'spiegel'] },
  { id: 252, label: 'Převodovka',       keywords: ['prevodov', 'transmission', 'getriebe'] },
  { id: 8,   label: 'Spojka',           keywords: ['spojk', 'clutch', 'kupplung'] },
  // Belt drive
  { id: 532, label: 'Napínací/vodící kladky', keywords: ['napinaci kladk', 'vodici kladk', 'vratna', 'vodici kladka', 'tensioner pulley', 'idler pulley', 'umlenkrolle', 'spannrolle'] },
  { id: 41,  label: 'Klínové/drážkové řemeny', keywords: ['klinov remen', 'drazkov remen', 'sada remen', 'zebrovany klin', 'v-belt', 'serpentine', 'keilrippen', 'poly-v'] },
  // Engine misc
  { id: 60,  label: 'Těsnění motoru',   keywords: ['tesnen', 'gasket', 'dichtung'] },
  { id: 100, label: 'Sada motorové opravy', keywords: ['sada moto', 'engine kit', 'motorsatz'] },
  { id: 102, label: 'Olejová vana',     keywords: ['olejova van', 'oil pan', 'olwanne'] },
  // Chassis misc
  { id: 539, label: 'Stabilizátor',     keywords: ['stabilizat', 'stabilizer', 'stabilisator', 'sway bar'] },
  { id: 541, label: 'Hlavový čep',      keywords: ['hlavovy cep', 'strut mount', 'domlager'] },
  // Body / interior
  { id: 314, label: 'Zámky a kliky',    keywords: ['zamek dver', 'klika dver', 'door lock', 'turschloss'] },
  { id: 318, label: 'Kapota / blatník', keywords: ['kapota', 'blatnik', 'fender', 'hood', 'kotflugel'] },
  { id: 320, label: 'Nárazník',         keywords: ['naraznik', 'bumper', 'stossfanger'] },
  // Sensors / electronics
  { id: 1099,label: 'Snímač otáček / klikové hřídele', keywords: ['snimac otacek', 'crankshaft sensor', 'kurbelwellensensor'] },
  { id: 1109,label: 'Snímač MAP/MAF',   keywords: ['map sensor', 'maf sensor', 'mhd-snimac', 'luftmassen'] },
  // Cooling extras
  { id: 230, label: 'Hadice chlazení',  keywords: ['hadic chlad', 'hadice chlad', 'coolant hose', 'kuhlerschlauch'] },
  { id: 234, label: 'Expanzní nádobka', keywords: ['expanz nadobk', 'expansion tank', 'ausgleichsbehalt'] },

  // ===== Expanded coverage (added 2026-05) - rozšířený seznam TecDoc generic articles =====
  // Brakes
  { id: 401, label: 'Brzdové destičky (zadní)', keywords: ['destick zadn'] },
  { id: 80,  label: 'Brzdové kotouče (zadní)',  keywords: ['kotouc zadn'] },
  { id: 1091,label: 'Brzdové bubny',            keywords: ['brzd buben', 'brake drum', 'bremstrommel'] },
  { id: 1092,label: 'Brzdové čelisti',          keywords: ['brzd celist', 'brake shoe', 'bremsbacken'] },
  { id: 469, label: 'Hlavní brzdový válec',     keywords: ['hlavni brzd valec', 'master cylinder', 'hauptbremszylinder'] },
  { id: 470, label: 'Posilovač brzd',           keywords: ['posilovac brzd', 'brake booster', 'bremskraftverstark'] },
  // Engine internals
  { id: 7,   label: 'Hlava motoru',             keywords: ['hlava motor', 'cylinder head', 'zylinderkopf'] },
  { id: 13,  label: 'Sada hlavy motoru',        keywords: ['sada hlavy', 'head gasket set', 'zylinderkopfdichtung'] },
  { id: 16,  label: 'Sací potrubí',             keywords: ['saci potrub', 'intake manifold', 'ansaugkrumm'] },
  { id: 17,  label: 'Výfukové potrubí',         keywords: ['vyfukov potrub', 'exhaust manifold', 'auspuffkrumm'] },
  { id: 25,  label: 'Olejová pumpa',            keywords: ['olejova pumpa', 'oil pump', 'olpumpe'] },
  { id: 28,  label: 'Setrvačník',               keywords: ['setrvacnik', 'flywheel', 'schwungrad'] },
  { id: 30,  label: 'Pístní kroužky',           keywords: ['pistni krouzk', 'piston ring', 'kolbenring'] },
  { id: 32,  label: 'Vodní hadice',             keywords: ['vodni hadic', 'water hose'] },
  { id: 38,  label: 'Píst',                     keywords: ['pist motor', 'piston', 'kolben'] },
  { id: 39,  label: 'Ojnice',                   keywords: ['ojnice', 'connecting rod', 'pleuel'] },
  { id: 40,  label: 'Klikový hřídel',           keywords: ['klikovy hridel', 'crankshaft', 'kurbelwelle'] },
  { id: 43,  label: 'Vačkový hřídel',           keywords: ['vackovy hridel', 'camshaft', 'nockenwelle'] },
  { id: 44,  label: 'Ventily',                  keywords: ['ventil motor', 'engine valve'] },
  { id: 45,  label: 'Pružina ventilu',          keywords: ['pruzina ventil', 'valve spring'] },
  { id: 46,  label: 'Vodítko ventilu',          keywords: ['voditko ventil', 'valve guide'] },
  { id: 47,  label: 'Zdvihátko ventilu',        keywords: ['zdvihatko', 'valve lifter', 'tassenstossel'] },
  { id: 48,  label: 'Hydraulické zdvihátko',    keywords: ['hydraulick zdvih', 'hydraulic lifter'] },
  { id: 49,  label: 'Vahadlo ventilu',          keywords: ['vahadlo ventil', 'rocker arm', 'kipphebel'] },
  { id: 53,  label: 'Ventilátor chlazení',      keywords: ['ventilator chlad', 'cooling fan', 'kuhlergeblase'] },
  { id: 54,  label: 'Spojka ventilátoru',       keywords: ['spojka ventilat', 'fan clutch', 'visco kupplung'] },
  { id: 55,  label: 'Termoswitch',              keywords: ['termospinac', 'temp switch', 'thermoschalter'] },
  { id: 56,  label: 'Snímač teploty chladiva',  keywords: ['snimac teplot', 'coolant temp', 'kuhlmittel'] },
  { id: 57,  label: 'EGR ventil',               keywords: ['egr', 'agr ventil'] },
  { id: 58,  label: 'Turbodmychadlo',           keywords: ['turbo', 'turbocharger', 'lader'] },
  { id: 59,  label: 'Mezichladič / intercooler',keywords: ['mezichladic', 'intercooler', 'ladeluftkuhler'] },
  { id: 61,  label: 'Tlumič výfuku',            keywords: ['tlumic vyf', 'silencer', 'auspufftopf'] },
  { id: 62,  label: 'Výfukový sběrač',          keywords: ['vyfuk sber'] },
  { id: 63,  label: 'Sada výfuku',              keywords: ['sada vyfuk'] },
  { id: 67,  label: 'Spalovací komora',         keywords: ['kovove tesneni'] },
  { id: 73,  label: 'Regulátor alternátoru',    keywords: ['regulator alternat', 'alternator regulator'] },
  { id: 74,  label: 'Spínač zapalování',        keywords: ['spinac zapal', 'ignition switch', 'zundschloss'] },
  { id: 75,  label: 'Magnetický spínač starteru', keywords: ['magneticky spinac', 'starter solenoid'] },
  { id: 76,  label: 'Uhlíky alternátoru',       keywords: ['uhlik alternat', 'carbon brush'] },
  { id: 77,  label: 'Pastorek startéru',        keywords: ['pastorek start', 'starter drive'] },
  // Suspension extras
  { id: 78,  label: 'Náboj kola',               keywords: ['nabok kola', 'wheel hub', 'radnabe'] },
  { id: 81,  label: 'Šroub kola',               keywords: ['sroub kola', 'wheel bolt', 'radschraube'] },
  { id: 83,  label: 'Matice kola',              keywords: ['matice kola', 'wheel nut', 'radmutter'] },
  { id: 86,  label: 'Hnací hřídel',             keywords: ['hnaci hridel', 'drive shaft', 'antriebswelle'] },
  { id: 87,  label: 'Manžeta poloosy',          keywords: ['manzeta polos', 'cv boot', 'achsmanschette'] },
  { id: 88,  label: 'Křížový kloub',            keywords: ['krizovy kloub', 'universal joint'] },
  { id: 89,  label: 'Středový ložisko hřídele', keywords: ['stredove lozisko', 'center bearing'] },
  { id: 90,  label: 'Pružinové uložení',        keywords: ['pruzin ulozen', 'spring mount'] },
  { id: 91,  label: 'Doraz / odbojník',         keywords: ['doraz', 'odbojnik', 'bump stop'] },
  { id: 92,  label: 'Pomocný rám',              keywords: ['pomocny ram', 'subframe', 'achstrager'] },
  { id: 93,  label: 'Tlumič řízení',            keywords: ['tlumic rizen', 'steering damper'] },
  { id: 94,  label: 'Manžeta řízení',           keywords: ['manzeta rizen', 'rack boot'] },
  { id: 96,  label: 'Hřebenové řízení',         keywords: ['hreben rizen', 'steering rack', 'lenkgetriebe'] },
  { id: 97,  label: 'Čerpadlo posilovače',      keywords: ['cerpadlo posilov', 'power steering pump', 'servopumpe'] },
  { id: 98,  label: 'Olej posilovače',          keywords: ['olej posilov', 'power steering fluid'] },
  // Cooling extras
  { id: 235, label: 'Víčko nádobky chladiva',   keywords: ['vicko nadob', 'expansion tank cap'] },
  { id: 236, label: 'Olejový chladič',          keywords: ['olejovy chladic', 'oil cooler', 'olkuhler'] },
  { id: 237, label: 'EGR chladič',              keywords: ['egr chladic', 'egr cooler'] },
  // Fuel system
  { id: 21,  label: 'Vstřikovací tryska',       keywords: ['tryska', 'nozzle', 'einspritz'] },
  { id: 24,  label: 'Snímač hladiny paliva',    keywords: ['snimac hladiny paliva', 'fuel level sensor'] },
  { id: 27,  label: 'Plovák paliva',            keywords: ['plovak paliv'] },
  { id: 33,  label: 'Sací jednotka palivové nádrže', keywords: ['saci jednotka palivov'] },
  { id: 34,  label: 'Palivová lišta',           keywords: ['palivova lista', 'fuel rail'] },
  { id: 36,  label: 'Vysokotlaké čerpadlo',     keywords: ['vysokotlake cerpadlo', 'high pressure fuel pump'] },
  // Electrics extras
  { id: 78,  label: 'Pojistka',                 keywords: ['pojistka', 'fuse', 'sicherung'] },
  { id: 99,  label: 'Relé',                     keywords: ['rele', 'relay'] },
  { id: 101, label: 'Žárovka',                  keywords: ['zarovka', 'bulb', 'gluhlampe'] },
  { id: 103, label: 'Spínač',                   keywords: ['spinac', 'switch', 'schalter'] },
  { id: 105, label: 'Konektor',                 keywords: ['konektor', 'connector'] },
  { id: 106, label: 'Snímač tlaku oleje',       keywords: ['snimac tlaku oleje', 'oil pressure sensor'] },
  { id: 107, label: 'Snímač hladiny oleje',     keywords: ['snimac hladiny oleje', 'oil level sensor'] },
  { id: 108, label: 'Snímač polohy škrt. klapky', keywords: ['snimac polohy', 'throttle position', 'tps'] },
  { id: 109, label: 'Snímač klepání',           keywords: ['snimac klepani', 'knock sensor', 'klopfsensor'] },
  // Lighting extras
  { id: 111, label: 'Mlhovka',                  keywords: ['mlhovk', 'fog light', 'nebelschein'] },
  { id: 112, label: 'Směrovka',                 keywords: ['smerov', 'turn signal', 'blinker'] },
  { id: 113, label: 'Brzdové světlo',           keywords: ['brzd svetl', 'brake light'] },
  { id: 114, label: 'SPZ osvětlení',            keywords: ['spz osvet', 'license plate light'] },
  { id: 115, label: 'Vnitřní osvětlení',        keywords: ['vnitrni osvet', 'interior light'] },
  // Wipers extras
  { id: 116, label: 'Stěrač zadního skla',      keywords: ['sterac zadni', 'rear wiper'] },
  { id: 117, label: 'Motor stěračů',            keywords: ['motor sterac', 'wiper motor', 'wischermotor'] },
  { id: 118, label: 'Mechanika stěračů',        keywords: ['mechanika sterac', 'wiper linkage'] },
  { id: 119, label: 'Čerpadlo ostřikovače',     keywords: ['cerpadlo ostrikov', 'washer pump'] },
  { id: 120, label: 'Tryska ostřikovače',       keywords: ['tryska ostrikov', 'washer nozzle'] },
  // Glass / mirrors
  { id: 121, label: 'Sklo zrcátka',             keywords: ['sklo zrcat', 'mirror glass'] },
  { id: 122, label: 'Čelní sklo',               keywords: ['celni sklo', 'windshield', 'windscreen'] },
  // HVAC extras
  { id: 245, label: 'Topení interiéru',         keywords: ['topen inter', 'heater core'] },
  { id: 246, label: 'Ventilátor interiéru',     keywords: ['ventilator inter', 'blower motor'] },
  { id: 247, label: 'Sušič klimatizace',        keywords: ['susic klim', 'ac dryer', 'klimatrockner'] },
  { id: 248, label: 'Expanzní ventil klima',    keywords: ['expanz ventil klim', 'ac expansion valve'] },
  { id: 249, label: 'Snímač tlaku klima',       keywords: ['snimac tlaku klim', 'ac pressure sensor'] },
  // Body / interior extras
  { id: 315, label: 'Plynový vzpěra kapoty',    keywords: ['vzper kapot', 'hood strut', 'gasdruckfeder'] },
  { id: 316, label: 'Vzpěra zad. dveří',        keywords: ['vzper zad dveri', 'tailgate strut'] },
  { id: 317, label: 'Závěs dveří',              keywords: ['zaves dveri', 'door hinge'] },
  { id: 319, label: 'Stěrač gumička',           keywords: ['sterac gumicka', 'wiper rubber'] },
  { id: 321, label: 'Mřížka chladiče',          keywords: ['mrizka chladic', 'grille'] },
  { id: 322, label: 'Klapka palivové nádrže',   keywords: ['klapka paliv', 'fuel filler flap'] },
  { id: 323, label: 'Lemy blatníků',            keywords: ['lemy blatnik', 'fender flare'] },
  // Transmission extras
  { id: 250, label: 'Synchron',                 keywords: ['synchron', 'synchronizer ring'] },
  { id: 251, label: 'Tažné lano',               keywords: ['tahne lano', 'tow rope'] },
  { id: 253, label: 'Spojkový kotouč',          keywords: ['spojkovy kotouc', 'clutch disc', 'kupplungsscheibe'] },
  { id: 254, label: 'Přítlačný talíř',          keywords: ['pritlacny talir', 'pressure plate', 'kupplungsdruckplatte'] },
  { id: 255, label: 'Vysoušecí ložisko',        keywords: ['vysousec lozisko', 'release bearing', 'ausrucklager'] },
  { id: 256, label: 'Hlavní spojkový válec',    keywords: ['hlavni spojkovy valec', 'clutch master cylinder'] },
  { id: 257, label: 'Pomocný spojkový válec',   keywords: ['pomocny spojkovy valec', 'clutch slave cylinder'] },
  { id: 258, label: 'Diferenciál',              keywords: ['diferencial', 'differential'] },
  { id: 259, label: 'Olej převodovky / diff',   keywords: ['atf', 'gear oil', 'getriebeoel'] },
  // Heated/Glow & Sensors
  { id: 1100,label: 'Snímač vačkového hřídele', keywords: ['snimac vackov', 'camshaft sensor'] },
  { id: 1101,label: 'Snímač ABS (zadní)',       keywords: ['snimac abs zadn'] },
  { id: 1102,label: 'Snímač rychlosti vozidla', keywords: ['snimac rychlosti', 'speed sensor', 'tachosensor'] },
  { id: 1103,label: 'Snímač parkovací (PDC)',   keywords: ['parkovaci snimac', 'parking sensor', 'pdc'] },
  { id: 1104,label: 'Volant / airbag',          keywords: ['volant', 'steering wheel', 'lenkrad'] },
  { id: 1105,label: 'Bezpečnostní pás',         keywords: ['bezpec pas', 'seat belt', 'sicherheitsgurt'] },
  // Misc fluids
  { id: 1750,label: 'Aditivum DEF/AdBlue',      keywords: ['adblue', 'def fluid'] },
  { id: 1751,label: 'Hydraulická kapalina',     keywords: ['hydraulicka kapalin', 'hydraulic fluid'] },
];

function classifyTecdoc(item: { name: string; description?: string }): TecdocSection {
  const hay = (item.name + ' ' + (item.description || ''))
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  for (const sec of TECDOC_SECTIONS) {
    if (sec.keywords.some((k) => hay.includes(k))) return sec;
  }
  return { id: 0, label: 'Ostatní', keywords: [] };
}

function liveSectionLabelFromItems(items: UnifiedPart[], fallback: string): string {
  const counts = new Map<string, { label: string; count: number }>();
  for (const it of items) {
    const label = String(it.name || '').trim();
    if (!label) continue;
    const key = label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const prev = counts.get(key);
    counts.set(key, { label, count: (prev?.count || 0) + 1 });
  }
  const top = [...counts.values()].sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'cs'))[0];
  return top?.label || fallback || 'Ostatní';
}

function countCategoryTree(nodes: CategoryNode[], rows: any[]): CategoryNode[] {
  return nodes
    .map((node) => {
      const children = node.children ? countCategoryTree(node.children, rows) : undefined;
      const ownCount = rows.filter((row) => rowMatchesKeywords(row, node.keywords)).length;
      const childCount = (children || []).reduce((sum, child) => sum + child.count, 0);
      return { ...node, count: Math.max(ownCount, childCount), children };
    })
    .filter((node) => node.count > 0 || node.children?.length || node.id === 'brakes');
}

// ---------- Vehicle tree seed (no API endpoint exists) ----------
const VEHICLE_TREE_SEED: Record<string, Array<{ model: string; engines: string[]; year_from?: number; year_to?: number }>> = {
  Chrysler: [
    { model: 'Voyager',         engines: ['2.5 CRD', '2.8 CRD', '3.3 V6', '3.8 V6'], year_from: 1996, year_to: 2007 },
    { model: 'Grand Voyager',   engines: ['2.8 CRD', '3.3 V6', '3.8 V6', '3.6 V6'],  year_from: 2008, year_to: 2020 },
    { model: 'Town & Country',  engines: ['3.3 V6', '3.8 V6', '4.0 V6', '3.6 V6'],   year_from: 2008, year_to: 2016 },
    { model: 'Pacifica',        engines: ['3.6 V6', '3.6 V6 Hybrid'],                year_from: 2017 },
    { model: '300C',            engines: ['3.0 CRD', '3.5 V6', '5.7 HEMI', '6.1 SRT8'], year_from: 2005 },
    { model: '300M',            engines: ['3.5 V6'], year_from: 1999, year_to: 2004 },
    { model: 'PT Cruiser',      engines: ['1.6', '2.0', '2.4', '2.2 CRD'], year_from: 2000, year_to: 2010 },
    { model: 'Crossfire',       engines: ['3.2 V6', '3.2 SRT-6'], year_from: 2003, year_to: 2008 },
    { model: 'Sebring',         engines: ['2.0', '2.4', '2.7 V6', '3.5 V6'], year_from: 2007, year_to: 2010 },
  ],
  Dodge: [
    { model: 'Caravan',         engines: ['2.5 CRD', '3.3 V6', '3.8 V6'], year_from: 1996, year_to: 2007 },
    { model: 'Grand Caravan',   engines: ['3.3 V6', '3.8 V6', '4.0 V6', '3.6 V6'], year_from: 2008, year_to: 2020 },
    { model: 'Journey',         engines: ['2.0 CRD', '2.4', '2.7 V6', '3.5 V6', '3.6 V6'], year_from: 2008 },
    { model: 'Nitro',           engines: ['2.8 CRD', '3.7 V6', '4.0 V6'], year_from: 2007, year_to: 2012 },
    { model: 'Charger',         engines: ['2.7 V6', '3.5 V6', '3.6 V6', '5.7 HEMI', '6.1 SRT8', '6.4 SRT'], year_from: 2006 },
    { model: 'Challenger',      engines: ['3.6 V6', '5.7 HEMI', '6.1 SRT8', '6.4 SRT'], year_from: 2008 },
    { model: 'Magnum',          engines: ['2.7 V6', '3.5 V6', '5.7 HEMI'], year_from: 2004, year_to: 2008 },
    { model: 'Ram 1500',        engines: ['3.6 V6', '5.7 HEMI', '3.0 EcoDiesel'], year_from: 2009 },
    { model: 'Durango',         engines: ['3.6 V6', '5.7 HEMI', '6.4 SRT'], year_from: 2011 },
    { model: 'Avenger',         engines: ['2.0', '2.4', '2.7 V6'], year_from: 2008, year_to: 2014 },
  ],
  Ram: [
    { model: '1500',            engines: ['3.6 V6', '5.7 HEMI', '3.0 EcoDiesel'], year_from: 2011 },
    { model: '2500',            engines: ['5.7 HEMI', '6.4 HEMI', '6.7 Cummins'], year_from: 2011 },
    { model: '3500',            engines: ['6.4 HEMI', '6.7 Cummins'], year_from: 2011 },
    { model: 'ProMaster',       engines: ['3.0 CRD', '3.6 V6'], year_from: 2014 },
  ],
  Cadillac: [
    { model: 'Escalade',        engines: ['5.3 V8', '6.0 V8', '6.2 V8'], year_from: 2002 },
    { model: 'CTS',             engines: ['2.8 V6', '3.6 V6', '6.2 V8'], year_from: 2003 },
    { model: 'SRX',             engines: ['3.6 V6', '4.6 V8'], year_from: 2004, year_to: 2016 },
    { model: 'XT5',             engines: ['3.6 V6', '2.0T'], year_from: 2017 },
  ],
  Lancia: [
    { model: 'Voyager',         engines: ['2.8 CRD', '3.6 V6'], year_from: 2011, year_to: 2015 },
    { model: 'Thema',           engines: ['3.0 V6 CRD', '3.6 V6', '5.7 HEMI'], year_from: 2011, year_to: 2014 },
  ],
};

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

async function seedVehicleTree(adminClient: any) {
  let insertedVehicles = 0;
  let insertedNodes = 0;

  // Lookup or create brand roots
  const { data: existingBrandRoots } = await adminClient
    .from('catalog_categories')
    .select('id, vehicle_brand')
    .eq('node_type', 'brand');
  const brandRootByName: Record<string, string> = {};
  for (const r of existingBrandRoots || []) {
    if (r.vehicle_brand) brandRootByName[r.vehicle_brand.toLowerCase()] = r.id;
  }

  for (const [brand, models] of Object.entries(VEHICLE_TREE_SEED)) {
    if (!ALLOWED_BRANDS.includes(brand.toLowerCase())) continue;

    // Ensure brand root exists
    let brandId = brandRootByName[brand.toLowerCase()];
    if (!brandId) {
      const { data: br } = await adminClient
        .from('catalog_categories')
        .upsert({
          slug: slugify(brand),
          name_cs: brand,
          name_en: brand,
          node_type: 'brand',
          vehicle_brand: brand,
          source: 'jm',
        }, { onConflict: 'parent_id,slug' })
        .select('id')
        .single();
      brandId = br?.id;
      if (brandId) brandRootByName[brand.toLowerCase()] = brandId;
    }
    if (!brandId) continue;

    for (const m of models) {
      const modelSlug = slugify(m.model);
      const { data: modelRow, error: modelErr } = await adminClient
        .from('catalog_categories')
        .upsert({
          parent_id: brandId,
          slug: modelSlug,
          name_cs: m.model,
          name_en: m.model,
          node_type: 'model',
          vehicle_brand: brand,
          vehicle_model: m.model,
          year_from: m.year_from ?? null,
          year_to: m.year_to ?? null,
          source: 'jm',
        }, { onConflict: 'parent_id,slug' })
        .select('id')
        .single();
      if (modelErr || !modelRow) continue;
      insertedNodes++;

      for (const eng of m.engines) {
        const engSlug = slugify(eng);
        await adminClient
          .from('catalog_categories')
          .upsert({
            parent_id: modelRow.id,
            slug: engSlug,
            name_cs: eng,
            name_en: eng,
            node_type: 'engine',
            vehicle_brand: brand,
            vehicle_model: m.model,
            vehicle_engine: eng,
            year_from: m.year_from ?? null,
            year_to: m.year_to ?? null,
            source: 'jm',
          }, { onConflict: 'parent_id,slug' });
        insertedNodes++;

        // Mirror into nextis_vehicles for compatibility lookups
        await adminClient.rpc('find_or_create_nextis_vehicle', {
          _brand: brand,
          _model: m.model,
          _engine: eng,
          _year_from: m.year_from ?? null,
          _year_to: m.year_to ?? null,
          _external_id: null,
        });
        insertedVehicles++;
      }
    }
  }

  return { insertedNodes, insertedVehicles };
}

// ---------- price enrichment helper ----------
// Returns J+M items WITH +30 % markup (via normalizeCatalogItem) for the client.
// Updates parts_new ONLY for non-OEM rows (J+M-sourced). Mopar/EPC/CSV rows are
// pre-loaded OEM with strict 0% margin policy and must NOT be overwritten by J+M.
async function enrichPricesIntoDb(adminClient: any, codes: string[]) {
  if (!codes.length) return { enriched: 0, attempted: 0, items: [] as UnifiedPart[] };
  const requestedCodes = codes.slice(0, 50).map((c) => String(c).trim()).filter(Boolean);
  const raw = await nextisPost('/catalogs/items-checking', {
    items: requestedCodes.map((code) => ({ code })),
    trySearchWithoutManufacturer: true,
    searchTarget: 'CodeOE',
    getOECodes: true,
    getDeposits: false,
    getServices: false,
    getCashBack: false,
    getEANCodes: false,
  });
  const list = (raw?.items || raw?.Items || []) as any[];
  let enriched = 0;
  const items: UnifiedPart[] = [];

  // Pre-load which requested OEMs are local OEM-source rows (do not overwrite their price)
  const { data: localOemRows } = await adminClient
    .from('parts_new')
    .select('oem_number, catalog_source')
    .in('oem_number', requestedCodes);
  const oemLocked = new Set<string>();
  for (const r of (localOemRows || [])) {
    const src = String(r.catalog_source || '').toLowerCase();
    if (['mopar','mopar_oem','csv','epc-ai','7zap','epc-link','ai-epc'].includes(src)) {
      oemLocked.add(String(r.oem_number).toUpperCase());
    }
  }

  for (const row of list) {
    const ri = row.responseItem || row.ResponseItem;
    const req = row.requestItem || row.RequestItem || {};
    const requestedOem = String(req.code || req.Code || '').trim();
    if (!ri || ri.valid === false || !requestedOem) continue;

    // normalizeCatalogItem already applies +30 % markup
    const jmItem = normalizeCatalogItem(ri);
    if (jmItem.price_with_vat <= 0) continue;

    const partForOem: UnifiedPart = {
      ...jmItem,
      oem_number: requestedOem,
      name: jmItem.name || requestedOem,
      category: jmItem.category || 'J+M dostupnost',
    };
    items.push(partForOem);

    // Only update DB when this OEM is NOT a locked local OEM record.
    if (oemLocked.has(requestedOem.toUpperCase())) continue;

    const { error: updErr } = await adminClient
      .from('parts_new')
      .update({
        price_without_vat: partForOem.price_without_vat,
        price_with_vat: partForOem.price_with_vat,
        availability: partForOem.availability,
        last_price_update: new Date().toISOString(),
      })
      .eq('oem_number', requestedOem)
      .eq('price_locked', false);
    if (!updErr) enriched++;
  }
  return { enriched, attempted: requestedCodes.length, items };
}

// ---------- HTTP entry ----------
const PUBLIC_READ_ACTIONS = new Set([
  'ping', 'searchByCode', 'searchByVehicle', 'vehicleCategories', 'priceAndStock', 'partsForEngine'
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const hasAuth = authHeader.startsWith('Bearer ');
    const bearer = hasAuth ? authHeader.replace('Bearer ', '').trim() : '';
    const apiKeyHeader = req.headers.get('apikey') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isProjectKey = (!!anonKey && bearer === anonKey) || (!!publishableKey && bearer === publishableKey) || (!!apiKeyHeader && bearer === apiKeyHeader);
    const isServerKey = isProjectKey || bearer === serviceKey;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const body = await req.json();
    const { action, payload = {} } = body;

    // Auth: server keys (cron) and PUBLIC_READ_ACTIONS skip JWT validation.
    // Other actions (syncCategories, enrichPrices, admin tasks) require user JWT + admin role.
    let userId: string | null = null;
    const isPublicRead = PUBLIC_READ_ACTIONS.has(action);
    if (!isServerKey && !isPublicRead) {
      if (!hasAuth) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const authClient = createClient(
        Deno.env.get('SUPABASE_URL')!,
        anonKey,
        { global: { headers: { Authorization: authHeader } } },
      );
      const { data: claims, error: claimsErr } = await authClient.auth.getClaims(bearer);
      if (claimsErr || !claims?.claims?.sub) {
        return new Response(JSON.stringify({ error: 'Unauthorized' }), {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      userId = claims.claims.sub as string;
    }

    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    let result: unknown;
    switch (action) {
      case 'ping': {
        const t = await getToken();
        result = { ok: true, hasToken: !!t };
        break;
      }

      case 'resolveKType': {
        const { brand, model, engine, year, vin, nextisVehicleId } = (payload || {}) as Record<string, any>;
        try {
          const r = await resolveKType(adminClient, { brand, model, engine, year, vin, nextisVehicleId });
          result = { ok: true, ...r };
        } catch (e) {
          result = { ok: false, error: (e as Error).message };
        }
        break;
      }

      case 'diagnose': {
        // EMERGENCY DEBUG — prove the API can return ANY part.
        const credCheck = {
          hasLogin: !!Deno.env.get('JM_LOGIN'),
          hasPass: !!Deno.env.get('JM_PASS'),
          hasCustNo: !!Deno.env.get('JM_CUST_NO'),
          loginLen: (Deno.env.get('JM_LOGIN') || '').length,
          passLen: (Deno.env.get('JM_PASS') || '').length,
        };

        let token: string | null = null;
        let authError: string | null = null;
        try { token = await getToken(); } catch (e) { authError = (e as Error).message; }

        const term = String(payload.term || 'BOSCH').trim();
        const searchTarget = String(payload.searchTarget || 'CodeOE');
        const target = payload.target as string | undefined; // 'P' or 'O' or undefined

        // 1) Raw search by code (term) — log full body + raw response
        const reqBodyByCode: Record<string, unknown> = {
          code: term,
          searchTarget,
          trySearchWithoutManufacturer: true,
          getOECodes: true,
          getDeposits: false,
          getServices: false,
          getCashBack: false,
          getEANCodes: false,
        };
        if (target) reqBodyByCode.target = target;

        // 2) Try ItemsFindingByText (brand search) — different endpoint
        const reqBodyByText: Record<string, unknown> = {
          searchItemType: 'Brand',
          searchItem: term,
          searchTarget,
          getOECodes: true,
        };
        if (target) reqBodyByText.target = target;

        const log = (label: string, body: any) => {
          console.log(`[DIAGNOSE ${label}] REQUEST:`, JSON.stringify({ ...body, token: token ? `${token.slice(0, 8)}…` : null }));
        };

        let byCodeRaw: any = null, byCodeErr: string | null = null;
        try {
          log('byCode', reqBodyByCode);
          byCodeRaw = await nextisPost('/catalogs/items-finding-by-code', reqBodyByCode);
          console.log('[DIAGNOSE byCode] RESPONSE:', JSON.stringify(byCodeRaw).slice(0, 1500));
        } catch (e) { byCodeErr = (e as Error).message; }

        let byTextRaw: any = null, byTextErr: string | null = null;
        try {
          log('byText', reqBodyByText);
          byTextRaw = await nextisPost('/catalogs/items-finding-by-text', reqBodyByText);
          console.log('[DIAGNOSE byText] RESPONSE:', JSON.stringify(byTextRaw).slice(0, 1500));
        } catch (e) { byTextErr = (e as Error).message; }

        // Try with target='P' explicitly if not already
        let byCodePRaw: any = null, byCodePErr: string | null = null;
        if (target !== 'P') {
          try {
            const bodyP = { ...reqBodyByCode, target: 'P' };
            log('byCode+P', bodyP);
            byCodePRaw = await nextisPost('/catalogs/items-finding-by-code', bodyP);
            console.log('[DIAGNOSE byCode+P] RESPONSE:', JSON.stringify(byCodePRaw).slice(0, 1500));
          } catch (e) { byCodePErr = (e as Error).message; }
        }

        const summarize = (raw: any) => {
          if (!raw) return null;
          const list = raw.items || raw.Items || [];
          return {
            status: raw.status,
            statusText: raw.statusText,
            itemCount: list.length,
            firstItemSample: list[0] ? JSON.stringify(list[0]).slice(0, 600) : null,
          };
        };

        result = {
          credCheck,
          authError,
          tokenObtained: !!token,
          term,
          searchTarget,
          target: target ?? null,
          requestBodies: {
            byCode: reqBodyByCode,
            byText: reqBodyByText,
            byCodeP: target !== 'P' ? { ...reqBodyByCode, target: 'P' } : null,
          },
          results: {
            byCode: { error: byCodeErr, ...summarize(byCodeRaw) },
            byText: { error: byTextErr, ...summarize(byTextRaw) },
            byCodeP: target !== 'P' ? { error: byCodePErr, ...summarize(byCodePRaw) } : null,
          },
        };
        break;
      }

      case 'syncCategories': {
        // Restricted: cron (server key) OR authenticated admin
        if (!isServerKey) {
          const { data: isAdmin } = await adminClient.rpc('has_role', { _user_id: userId, _role: 'admin' });
          if (!isAdmin) {
            return new Response(JSON.stringify({ success: false, error: 'Admin role required' }), {
              status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        }
        const seed = await seedVehicleTree(adminClient);
        result = {
          synced: seed.insertedNodes,
          vehicles: seed.insertedVehicles,
          source: 'curated-seed',
          note: 'Nextis API does not expose a vehicle tree; using curated whitelist.',
          allowedBrands: ALLOWED_BRANDS,
        };
        break;
      }

      case 'searchByCode': {
        const rawCode = String(payload.code || '').trim();
        if (!rawCode) { result = { items: [] }; break; }
        const skipBrandFilter = payload.skipBrandFilter === true || payload.debug === true;
        const enableCrossref = payload.enableCrossref !== false; // default ON

        // Edge in-memory cache (5 min). Survives between warm invocations.
        const cacheKey = `${rawCode}|${skipBrandFilter ? 1 : 0}|${enableCrossref ? 1 : 0}`;
        const cached = _searchByCodeCache.get(cacheKey);
        if (cached && Date.now() - cached.ts < SEARCH_CODE_TTL) {
          result = { ...cached.result, fromCache: true };
          break;
        }

        // Negative cache (24h): if Nextis returned nothing recently, skip the round-trip.
        // Stops 300+ daily futile lookups for OEMs Nextis doesn't carry.
        const negKey = `jm_neg:${normalizeOemCode(rawCode)}`;
        try {
          const { data: neg } = await adminClient
            .from('api_cache')
            .select('created_at, ttl_seconds')
            .eq('cache_type', 'jm_negative')
            .eq('cache_key', negKey)
            .maybeSingle();
          if (neg) {
            const ageMs = Date.now() - new Date(neg.created_at as string).getTime();
            if (ageMs < (neg.ttl_seconds ?? 86400) * 1000) {
              result = { items: [], variantsTried: [], attempts: [], skipBrandFilter, totalRawHits: 0, fromNegativeCache: true };
              break;
            }
          }
        } catch (_) { /* non-blocking */ }

        const normalized = normalizeOemCode(rawCode);
        const stripped = normalized.replace(/^K/, '');
        const baseNoSuffix = stripped.replace(/[A-Z]{1,3}$/i, '');
        const base8 = baseEightDigits(stripped);
        const variants = Array.from(new Set([
          rawCode,
          normalized,
          stripped,
          `K${stripped}`,
          baseNoSuffix,
          baseNoSuffix ? `K${baseNoSuffix}` : '',
          base8,
          base8 ? `K${base8}` : '',
        ].filter(Boolean)));

        const attempts: Array<{ code: string; target?: string; raw: number; count: number; mode: string }> = [];
        let merged: UnifiedPart[] = [];
        let totalRawHits = 0;

        // PARALLEL variant + crossref ladder. Previously sequential = up to 10s for one OEM.
        const variantTask = Promise.all(
          variants.map(async (variant) => {
            const direct = await fetchJmForSpecificCode(variant, 'CodeOE');
            return { variant, direct };
          })
        );
        const crossrefTask = enableCrossref
          ? fetchJmViaCrossRefs(adminClient, rawCode)
          : Promise.resolve({ items: [] as UnifiedPart[], xrefsTried: [] as string[], rawHits: 0 });

        const [variantResults, cross] = await Promise.all([variantTask, crossrefTask]);
        for (const { variant, direct } of variantResults) {
          totalRawHits += direct.rawCount;
          attempts.push({ code: variant, raw: direct.rawCount, count: direct.items.length, mode: 'direct-oe' });
          if (direct.items.length) {
            // Tag every J+M alternative with the OEM code that produced it.
            // Frontend uses this to guarantee category integrity (a J+M item is
            // only kept if its `related_oem_number` belongs to the OEM list of
            // the currently-selected category).
            for (const it of direct.items) (it as any).related_oem_number = (it as any).related_oem_number || rawCode;
            merged.push(...direct.items);
          }
        }
        totalRawHits += cross.rawHits;
        attempts.push(...cross.xrefsTried.map((code) => ({ code, raw: 0, count: 0, mode: 'crossref-product' })));
        for (const it of cross.items) (it as any).related_oem_number = (it as any).related_oem_number || rawCode;
        merged.push(...cross.items);
        if (enableCrossref) {
          console.log(`[searchByCode] crossref recursive lookup ${cross.xrefsTried.length} refs for ${rawCode}, items=${cross.items.length}`);
        }

        // Obohať related_oem_number i přes oe_numbers z API odpovědi (ne jen přes hledaný kód)
        merged = await enrichItemsWithRelatedOem(adminClient, merged);
        for (const it of merged) (it as any).related_oem_number = (it as any).related_oem_number || rawCode;

        const seen = new Set<string>();
        merged = dedupeUnifiedParts(merged).filter((p) => {
          if (!p.oem_number) return false;
          const key = `${normalizeOemCode(p.brand)}::${normalizeOemCode(p.oem_number)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return skipBrandFilter ? true : isUsBrand(p.brand);
        });

        // Fire-and-forget price enrichment — never blocks response.
        try {
          const codes = merged.map((i) => i.oem_number).filter(Boolean);
          if (codes.length) {
            // @ts-ignore Deno EdgeRuntime API
            (globalThis as any).EdgeRuntime?.waitUntil?.(enrichPricesIntoDb(adminClient, codes).catch(() => {}));
          }
        } catch (_) { /* non-blocking */ }

        result = {
          items: merged,
          variantsTried: variants,
          attempts,
          skipBrandFilter,
          totalRawHits,
        };

        _searchByCodeCache.set(cacheKey, { result, ts: Date.now() });
        // Bound cache size — drop oldest if exceeded.
        if (_searchByCodeCache.size > 500) {
          const firstKey = _searchByCodeCache.keys().next().value;
          if (firstKey) _searchByCodeCache.delete(firstKey);
        }

        if (merged.length === 0) {
          // Persist negative cache (24h) so next call short-circuits.
          try {
            await adminClient.from('api_cache').upsert({
              cache_type: 'jm_negative',
              cache_key: negKey,
              data: { totalRawHits, variantsTried: variants },
              ttl_seconds: 86400,
              created_at: new Date().toISOString(),
            }, { onConflict: 'cache_type,cache_key' });
          } catch (_) { /* non-blocking */ }

          await logCatalogEvent(adminClient, {
            level: 'warn',
            event: 'searchByCode_empty',
            oem_number: rawCode,
            message: `Žádné J+M položky pro OEM ${rawCode}`,
            details: {
              variantsTried: variants,
              totalRawHits,
              skipBrandFilter,
              enableCrossref,
              attemptCount: attempts.length,
              firstAttempts: attempts.slice(0, 5),
              reason: totalRawHits === 0
                ? 'no_raw_hits_from_nextis'
                : 'all_filtered_out_by_brand_blacklist',
            },
          });
        }
        break;
      }

      case 'vehicleCategories': {
        const nextisVehicleId = String(payload.nextisVehicleId || '').trim();
        const brand = String(payload.brand || '').trim();
        const model = String(payload.model || '').trim();
        const engine = String(payload.engine || '').trim();

        let vehicle = null;
        if (nextisVehicleId) {
          const { data } = await adminClient
            .from('nextis_vehicles')
            .select('id, brand, model, engine, external_id')
            .eq('id', nextisVehicleId)
            .maybeSingle();
          vehicle = data;
        }

        const vBrand = vehicle?.brand || brand;
        const vModel = vehicle?.model || model;
        const vEngine = vehicle?.engine || engine;
        if (!vBrand || !vModel) {
          result = { categories: [], warning: 'nextis_vehicle_id or brand+model required' };
          break;
        }

        // Build engine variants ("3.6 V6" vs "3.6L V6")
        const engineVariants = (() => {
          if (!vEngine) return [] as string[];
          const out = new Set<string>([vEngine]);
          out.add(vEngine.replace(/^(\d+\.\d+)(\s)/, '$1L$2'));
          out.add(vEngine.replace(/^(\d+\.\d+)L(\s)/, '$1$2'));
          const m = vEngine.match(/^(\d+\.\d+)/);
          if (m) out.add(m[1]);
          return [...out].filter(Boolean);
        })();

        let rows: any[] | null = null;
        if (vehicle?.id) {
          const { data: compatRows, error: compatError } = await adminClient
            .from('catalog_vehicle_compatibility')
            .select('parts_new!inner(oem_number, name, category, description, compatible_vehicles)')
            .eq('nextis_vehicle_id', vehicle.id)
            .limit(5000);
          if (compatError) throw compatError;
          rows = (compatRows || []).map((r: any) => r.parts_new).filter(Boolean);
        }
        if (!rows || rows.length === 0) {
          const fallback = await adminClient
            .from('parts_new')
            .select('oem_number, name, category, description, compatible_vehicles')
            .ilike('compatible_vehicles', `%${vBrand}%`)
            .ilike('compatible_vehicles', `%${vModel}%`)
            .limit(5000);
          if (fallback.error) throw fallback.error;
          rows = fallback.data;
        }
        console.log(`[vehicleCategories] ${vBrand} ${vModel} ${vEngine} -> ${rows?.length || 0} rows`);

        result = {
          nextisVehicleId,
          vehicle: { brand: vBrand, model: vModel, engine: vEngine, external_id: vehicle?.external_id || null },
          categories: countCategoryTree(PRODUCT_CATEGORY_TREE, rows || []),
          localRows: rows?.length || 0,
          source: 'jm-compatible-tree-oem-fallback',
        };
        break;
      }

      case 'searchByVehicle': {
        // Strategy:
        // 1) If engineID is provided -> direct Nextis vehicle search.
        // 2) Else fallback: pull OEM codes from parts_new (brand+model fuzzy
        //    engine match), then run items-finding-by-code per code with
        //    searchTarget=CodeOE so Nextis searches OE catalog (not P-codes).
        // 3) Cascading fallbacks: full keyword filter -> drop engine ->
        //    drop subcategory keywords (use parent category) -> drop category.
        const engineID = Number(payload.engineID || 0);
        const nextisVehicleId = String(payload.nextisVehicleId || '').trim();
        let brand = String(payload.brand || '').trim();
        let model = String(payload.model || '').trim();
        let engine = String(payload.engine || '').trim();
        const category = String(payload.category || '').trim();
        const categoryId = String(payload.categoryId || '').trim();
        const sectionId = Number(payload.sectionId || SECTION_ID_BY_CATEGORY_ID[categoryId] || 0);
        const categoryKeywords: string[] = Array.isArray(payload.categoryKeywords)
          ? payload.categoryKeywords.map((k: unknown) => String(k).trim()).filter(Boolean)
          : [];
        // Optional broader keywords (parent category) used as secondary fallback.
        const parentKeywords: string[] = Array.isArray(payload.parentKeywords)
          ? payload.parentKeywords.map((k: unknown) => String(k).trim()).filter(Boolean)
          : [];

        let resolvedExternalId: string | null = null;
        if (nextisVehicleId) {
          const { data: v } = await adminClient
            .from('nextis_vehicles')
            .select('brand, model, engine, external_id')
            .eq('id', nextisVehicleId)
            .maybeSingle();
          if (v) {
            brand = String(v.brand || brand).trim();
            model = String(v.model || model).trim();
            engine = String(v.engine || engine).trim();
            resolvedExternalId = v.external_id ? String(v.external_id).trim() : null;
          }
        }

        // Build engine variants to handle "3.6 V6" vs "3.6L V6" mismatch.
        const engineVariants = (() => {
          if (!engine) return [] as string[];
          const out = new Set<string>([engine]);
          // Add "3.6L V6" form (insert L after the displacement number)
          out.add(engine.replace(/^(\d+\.\d+)(\s)/, '$1L$2'));
          // Strip the L: "3.6L V6" -> "3.6 V6"
          out.add(engine.replace(/^(\d+\.\d+)L(\s)/, '$1$2'));
          // Just the displacement number ("3.6") as last resort
          const m = engine.match(/^(\d+\.\d+)/);
          if (m) out.add(m[1]);
          return [...out].filter(Boolean);
        })();

        // Numeric Nextis engineID — prefer payload, fall back to external_id from DB.
        const effectiveEngineID = engineID > 0
          ? engineID
          : (resolvedExternalId && /^\d+$/.test(resolvedExternalId) ? Number(resolvedExternalId) : 0);

        console.log('[searchByVehicle] params:', JSON.stringify({
          nextisVehicleId, sectionId, brand, model, engine, engineVariants,
          payloadEngineID: engineID, resolvedExternalId, effectiveEngineID,
          category, categoryKeywords, parentKeywords,
        }));

        if (effectiveEngineID > 0) {
          const reqBody = {
            engineID: effectiveEngineID,
            genArtID: sectionId > 0 ? sectionId : 0,
            getOECodes: true,
            target: 'P',
          };
          console.log('[searchByVehicle] Nextis byVehicle request:', JSON.stringify(reqBody));
          const raw = await nextisPost('/catalogs/items-finding-by-vehicle', reqBody);
          const rawCount = (raw?.items || raw?.Items || []).length;
          console.log('[searchByVehicle] Nextis byVehicle response: status=', raw?.status, 'items=', rawCount);
          let items = normalizeItems(raw)
            .filter((p) => isAllowedBrand(p.brand));
          if (categoryKeywords.length && sectionId <= 0) {
            const kept = items.filter((p) => itemMatchesKeywords(p, categoryKeywords));
            if (kept.length > 0) {
              items = kept;
            } else {
              console.warn('[searchByVehicle] strict category filter removed all engineID hits; keeping vehicle-wide J+M hits for UI fallback');
            }
          }
          // Propoj J+M položky s naším Mopar OEM přes oe_numbers (zajistí správné NÁHRADA→ORIGINÁL párování)
          items = await enrichItemsWithRelatedOem(adminClient, items);
          try {
            const codes = items.map((i) => i.oem_number).filter(Boolean);
            if (codes.length) await enrichPricesIntoDb(adminClient, codes);
          } catch (_) { /* non-blocking */ }
          result = {
            items, mode: 'engineID', engineID: effectiveEngineID,
            sectionId: sectionId || 0, category, totalRawHits: rawCount,
          };
          break;
        }

        if (!brand || !model) {
          result = { items: [], warning: 'brand+model required when engineID missing', category };
          break;
        }

        // OEM-fallback helper: query local catalog for matching OEM codes.
        // Tries multiple engine variants ("3.6 V6" / "3.6L V6" / "3.6").
        // CATEGORY INTEGRITY 2026-05: only OEM (Mopar / 7zap / csv-Mopar) sources
        // are eligible as seeds — never aftermarket source rows that may have
        // been imported under a foreign OEM-looking code (KAMOKA F322201 etc.).
        const queryLocalOemCodes = async (
          useEngine: boolean,
          keywordsForFilter: string[],
        ): Promise<{ codes: string[]; matchedRows: number }> => {
          const variantsToTry = useEngine && engineVariants.length
            ? engineVariants
            : [null];
          const allRows: any[] = [];
          for (const variant of variantsToTry) {
            let q = adminClient
              .from('parts_new')
              .select('oem_number, name, category, description, compatible_vehicles, catalog_source, manufacturer')
              .ilike('compatible_vehicles', `%${brand}%`)
              .ilike('compatible_vehicles', `%${model}%`)
              .in('catalog_source', ['mopar', 'mopar_oem', '7zap', 'csv', 'epc-link'])
              .limit(500);
            if (variant) q = q.ilike('compatible_vehicles', `%${variant}%`);
            const { data: rows, error } = await q;
            if (error) {
              console.warn('[searchByVehicle] oem lookup error:', error.message);
              continue;
            }
            if (rows?.length) {
              // Belt-and-suspenders: csv source must also have manufacturer=Mopar.
              const cleanRows = rows.filter((r: any) => {
                const src = String(r.catalog_source || '').toLowerCase();
                if (src === 'csv') return String(r.manufacturer || '').trim().toLowerCase() === 'mopar';
                return true;
              });
              allRows.push(...cleanRows);
              break; // first variant that returns data wins
            }
          }
          const filtered = keywordsForFilter.length
            ? allRows.filter((r: any) => rowMatchesKeywords(r, keywordsForFilter))
            : allRows;
          const codes = [...new Set(
            filtered.map((r: any) => String(r.oem_number || '').trim()).filter(Boolean),
          )];
          console.log('[searchByVehicle] local OEM strict scope:', JSON.stringify({
            selected_vehicle: nextisVehicleId,
            selected_engine: engine,
            selected_category: category,
            useEngine,
            keywordsForFilter,
            rowsBeforeCategory: allRows.length,
            rowsAfterCategory: filtered.length,
          }));
          return { codes, matchedRows: filtered.length };
        };

        // RELAXATION LADDER (Phase 3 — Category Integrity 2026-05):
        // We MUST NEVER pass OEM codes from another category to J+M — that's how
        // "Palivový filtr" ended up listed under "Brzdové obložení". So:
        //  - All ladder steps require AT LEAST ONE category keyword (subcat OR parent).
        //  - The "brand-only / no keywords" step is gone forever.
        //  - If we have neither subcat nor parent keywords, we return empty rather
        //    than pollute the result.
        const seedKeywords = categoryKeywords.length > 0 ? categoryKeywords : parentKeywords;
        const sameAsSeed = (kws: string[]) => JSON.stringify(kws) === JSON.stringify(seedKeywords);
        const ladder: Array<{ label: string; useEngine: boolean; keywords: string[] }> = [
          { label: 'engine+subcat', useEngine: true,  keywords: seedKeywords },
          { label: 'engine+parent', useEngine: true,  keywords: parentKeywords },
          { label: 'brand+subcat',  useEngine: false, keywords: seedKeywords },
          { label: 'brand+parent',  useEngine: false, keywords: parentKeywords },
          // NOTE: "brand-only" rung removed — it was the root cause of cross-category
          // pollution (e.g. fuel filters appearing under brake pads).
        ].filter((step) => step.keywords.length > 0);

        if (ladder.length === 0) {
          result = {
            items: [],
            mode: 'oem-fallback',
            warning: 'No category keywords supplied — refusing brand-only search to prevent cross-category pollution.',
            triedBrand: brand, triedModel: model, triedEngine: engine, category,
          };
          break;
        }

        let oemCodes: string[] = [];
        let usedStep = 'none';
        for (const step of ladder) {
          // Skip rungs that are identical to a previously-tried one
          if ((step.label === 'engine+parent' || step.label === 'brand+parent') &&
              (parentKeywords.length === 0 || sameAsSeed(parentKeywords))) continue;
          const { codes, matchedRows } = await queryLocalOemCodes(step.useEngine, step.keywords);
          console.log(`[searchByVehicle] ladder=${step.label} matchedRows=${matchedRows} codes=${codes.length}`);
          if (codes.length > 0) {
            oemCodes = codes;
            usedStep = step.label;
            break;
          }
        }

        oemCodes = oemCodes.slice(0, 40);
        console.log(`[searchByVehicle] derived ${oemCodes.length} OEM codes for ${brand} ${model}${engine ? ' ' + engine : ''} (step=${usedStep})`);

        if (oemCodes.length === 0) {
          result = {
            items: [],
            mode: 'oem-fallback',
            warning: `Žádné lokální OEM kódy pro ${brand} ${model}. Pro tento vůz není v parts_new žádný díl.`,
            triedBrand: brand, triedModel: model, triedEngine: engine, category, usedStep,
          };
          break;
        }

        // Run items-finding-by-code per OEM first. If J+M returns nothing for the
        // Mopar OE number, recursively bridge through local part_crossref numbers
        // (Bosch/TRW/Brembo/etc.) and query J+M again by aftermarket product code.
        const seen = new Set<string>();
        const collected: UnifiedPart[] = [];
        const codeAttempts: Array<{ code: string; raw: number; kept: number; crossrefs?: number; crossrefRaw?: number }> = [];
        const batches: Promise<void>[] = oemCodes.map(async (code) => {
          try {
            const reqBody = {
              code,
              genArtID: sectionId > 0 ? sectionId : 0,
              target: 'P',
              searchTarget: 'CodeOE',
              trySearchWithoutManufacturer: true,
              getOECodes: true,
              getDeposits: false,
              getServices: false,
              getCashBack: false,
              getEANCodes: false,
            };
            const raw = await nextisPost('/catalogs/items-finding-by-code', reqBody);
            const rawList = raw?.items || raw?.Items || [];
            const directItems = normalizeItems(raw);
            let kept = 0;
            for (const it of directItems) {
              if (!it.oem_number) continue;
              if (categoryKeywords.length && sectionId <= 0 && !itemMatchesKeywords(it, categoryKeywords)) continue;
              const key = `${normalizeOemCode(it.brand)}::${normalizeOemCode(it.oem_number)}`;
              if (seen.has(key)) continue;
              if (!isAllowedBrand(it.brand)) continue;
              seen.add(key);
              collected.push({ ...it, category: category || it.category, related_oem_number: code });
              kept++;
            }

            const cross = await fetchJmViaCrossRefs(adminClient, code, category);
            let crossKept = 0;
            for (const it of cross.items) {
              if (!it.oem_number) continue;
              if (categoryKeywords.length && sectionId <= 0 && !itemMatchesKeywords(it, categoryKeywords)) continue;
              const key = `${normalizeOemCode(it.brand)}::${normalizeOemCode(it.oem_number)}`;
              if (seen.has(key)) continue;
              if (!isAllowedBrand(it.brand)) continue;
              seen.add(key);
              collected.push(it);
              crossKept++;
            }

            codeAttempts.push({ code, raw: rawList.length, kept: kept + crossKept, crossrefs: cross.xrefsTried.length, crossrefRaw: cross.rawHits });
          } catch (e) {
            console.warn('[searchByVehicle] code search failed for', code, (e as Error).message);
            codeAttempts.push({ code, raw: -1, kept: 0 });
          }
        });
        await Promise.all(batches);

        // Log a summary of attempts (first 10 for brevity)
        console.log('[searchByVehicle] code attempts (first 10):', JSON.stringify(codeAttempts.slice(0, 10)));
        const totalRaw = codeAttempts.reduce((s, a) => s + Math.max(0, a.raw), 0);
        console.log(`[searchByVehicle] result: codesQueried=${oemCodes.length} totalRaw=${totalRaw} kept=${collected.length}`);

        try {
          const codes = collected.map((i) => i.oem_number).filter(Boolean);
          if (codes.length) await enrichPricesIntoDb(adminClient, codes);
        } catch (_) { /* non-blocking */ }

        result = {
          items: collected,
          mode: 'oem-fallback',
          codesQueried: oemCodes.length,
          totalRawHits: collected.length,
          totalNextisHits: totalRaw,
          usedStep,
          triedBrand: brand, triedModel: model, triedEngine: engine, category,
        };

        if (collected.length === 0) {
          await logCatalogEvent(adminClient, {
            level: 'warn',
            event: 'searchByVehicle_empty',
            category: category || null,
            message: `Žádné J+M díly pro ${brand} ${model} ${engine || ''} / ${category || 'všechny kategorie'}`,
            details: {
              brand, model, engine, category,
              codesQueried: oemCodes.length,
              totalNextisHits: totalRaw,
              usedStep,
              codeAttempts: codeAttempts.slice(0, 10),
              reason: oemCodes.length === 0
                ? 'no_local_oem_codes_for_vehicle'
                : (totalRaw === 0 ? 'no_jm_hits_for_oem_codes' : 'all_filtered_out'),
            },
          });
        }
        break;
      }

      case 'priceAndStock': {
        const codes: string[] = Array.isArray(payload.codes) ? payload.codes.slice(0, 50) : [];
        if (!codes.length) { result = { items: [] }; break; }
        const enrich = await enrichPricesIntoDb(adminClient, codes).catch(() => ({ enriched: 0, items: [] }));
        result = { items: enrich.items || [], enrichedInDb: enrich.enriched || 0 };
        break;
      }

      case 'partsForEngine': {
        // ALL J+M parts for a given vehicle, classified by TecDoc section.
        // Two strategies:
        //  A) Nextis engineID (TecDoc K-type) is set on nextis_vehicles.external_id
        //     → loop TECDOC_SECTIONS, call items-finding-by-vehicle per genArtID
        //     → clean classification, full section tree (15-20 categories).
        //  B) No engineID → fall back to OEM-seed flow (parts_new Mopar codes).
        const nextisVehicleId = String(payload.nextisVehicleId || '').trim();
        const vinHint = String(payload.vin || '').trim();
        const yearHint = Number(payload.year || 0);
        let brand = String(payload.brand || '').trim();
        let model = String(payload.model || '').trim();
        let engine = String(payload.engine || '').trim();
        if (nextisVehicleId) {
          const { data: v } = await adminClient
            .from('nextis_vehicles')
            .select('brand, model, engine')
            .eq('id', nextisVehicleId)
            .maybeSingle();
          if (v) {
            brand = String(v.brand || brand).trim();
            model = String(v.model || model).trim();
            engine = String(v.engine || engine).trim();
          }
        }

        // K-type resolver: vehicle_engine_mappings (VIN → config) → nextis_vehicles fallback → payload.
        let resolvedEngineID = 0;
        let kTypeSource: string = 'none';
        let kTypeMappingId: string | undefined;
        if (Number(payload.engineID || 0) > 0) {
          resolvedEngineID = Number(payload.engineID);
          kTypeSource = 'payload';
        } else {
          const r = await resolveKType(adminClient, { brand, model, engine, year: yearHint, vin: vinHint, nextisVehicleId });
          resolvedEngineID = r.k_type;
          kTypeSource = r.source;
          kTypeMappingId = r.mappingId;
        }
        const forceOemFallback = payload.forceOemFallback === true || String(payload.forceOemFallback || '').toLowerCase() === 'true';
        if (forceOemFallback) {
          resolvedEngineID = 0;
          kTypeSource = 'forced_oem_fallback';
          kTypeMappingId = undefined;
        }

        if (!brand || !model) {
          result = { items: [], warning: 'brand+model required' };
          break;
        }

        // Unified cache key per vehicle (brand|model|engine) — shared across A0/A/oemFallback flows.
        const cacheKey = `${brand}|${model}|${engine}`.toLowerCase();
        // Hold last known cache (even expired) so we can return stale data when API quota blocks fresh fetch.
        let lastKnownCache: { data: any; created_at: string } | null = null;
        try {
          const { data: cached } = await adminClient
            .from('api_cache')
            .select('data, created_at, ttl_seconds')
            .eq('cache_type', 'jm_parts_for_engine')
            .eq('cache_key', cacheKey)
            .maybeSingle();
          if (cached) {
            const cachedData = (cached.data as any) || {};
            const cachedItems = Array.isArray(cachedData.items) ? cachedData.items : [];
            const cachedFlow = String(cachedData.debug?.flow || '');
            const poisonedEmptyFallback = resolvedEngineID > 0 && cachedFlow === 'oemFallback' && cachedItems.length === 0;
            // Only remember non-empty cached data as "last known good"
            if (cachedItems.length > 0) {
              lastKnownCache = { data: cachedData, created_at: cached.created_at as string };
            }
            const ageMs = Date.now() - new Date(cached.created_at as string).getTime();
            if (!poisonedEmptyFallback && ageMs < (cached.ttl_seconds ?? 604800) * 1000) {
              result = { ...cachedData, fromCache: true };
              break;
            }
            if (!poisonedEmptyFallback && (payload.cacheOnly === true || String(payload.cacheOnly || '').toLowerCase() === 'true')) {
              result = { ...cachedData, fromCache: true, staleCache: true };
              break;
            }
          }
        } catch (_) { /* non-blocking */ }

        if (payload.cacheOnly === true || String(payload.cacheOnly || '').toLowerCase() === 'true') {
          result = {
            items: [],
            warning: 'cache miss',
            debug: { flow: forceOemFallback ? 'oemFallbackCacheOnly' : 'cacheOnly', k_type: resolvedEngineID, k_type_source: kTypeSource },
          };
          break;
        }

        // ===== STRATEGY A0: single byVehicle call without genArtID (returns ALL sections) =====
        // Pokud Nextis API podporuje volání bez filtru sekce, dostaneme všechny díly v jednom requestu
        // a sekce poskládáme dynamicky podle productGenericArticleID/Name vrácených v každém dílu.
        if (resolvedEngineID > 0) {
          try {
            const startedAt0 = Date.now();
            const reqBody0 = { engineID: resolvedEngineID, getOECodes: true, target: 'P' };
            const res0 = await nextisPostWithRetry('/catalogs/items-finding-by-vehicle', reqBody0, {
              timeoutMs: 25_000,
              maxAttempts: 2,
            });
            if (res0.ok) {
              const all = normalizeItems(res0.data);
              const filtered = all.filter((it) => it.oem_number && isAllowedBrand(it.brand));
              // Group by gen_art_id (TecDoc section) - dynamic, no hard-coded list
              const seenA: Set<string> = new Set();
              const grouped: Record<string, { id: number; label: string; items: UnifiedPart[] }> = {};
              for (const it of filtered) {
                const key = `${normalizeOemCode(it.brand)}::${normalizeOemCode(it.oem_number)}`;
                if (seenA.has(key)) continue;
                seenA.add(key);
                // @ts-ignore - extras
                const gid = Number(it.gen_art_id || 0);
                // @ts-ignore - extras
                const gname = String(it.gen_art_name || '').trim() || 'Ostatní';
                const k = String(gid || gname);
                if (!grouped[k]) grouped[k] = { id: gid, label: gname, items: [] };
                grouped[k].items.push({ ...it, category: gname,
                  // @ts-ignore
                  tecdoc_section: { id: gid, label: gname } });
              }
              const sectionsList = Object.values(grouped);
              const collectedAll = sectionsList.flatMap((s) => s.items);
              if (collectedAll.length > 0) {
                const enriched = await enrichItemsWithRelatedOem(adminClient, collectedAll);
                const out = {
                  items: enriched,
                  engineID: resolvedEngineID,
                  sectionsScanned: 1,
                  sectionsHit: sectionsList.length,
                  totalRawHits: filtered.length,
                  source: 'engineID-single-call',
                  sections: sectionsList.map((s) => ({ id: s.id, label: s.label, count: s.items.length })),
                  debug: {
                    flow: 'engineId-fullscan',
                    k_type: resolvedEngineID,
                    k_type_source: kTypeSource,
                    k_type_mapping_id: kTypeMappingId,
                    durationMs: Date.now() - startedAt0,
                    sectionsHit: sectionsList.length,
                    totalRawHits: filtered.length,
                  },
                };
                try {
                  await adminClient.from('api_cache').upsert({
                    cache_type: 'jm_parts_for_engine',
                    cache_key: cacheKey,
                    data: out,
                    ttl_seconds: 604800,
                    created_at: new Date().toISOString(),
                  }, { onConflict: 'cache_type,cache_key' });
                } catch (_) { /* non-blocking */ }
                result = out;
                break;
              }
              // 0 items returned bez genArtID → krátkodobě zacacheuj prázdný výsledek (zabraňuje opakovanému 175-volání loopu)
              try {
                await adminClient.from('api_cache').upsert({
                  cache_type: 'jm_parts_for_engine',
                  cache_key: cacheKey,
                  data: {
                    items: [],
                    engineID: resolvedEngineID,
                    sectionsScanned: 1,
                    sectionsHit: 0,
                    totalRawHits: 0,
                    source: 'engineID-single-call-empty',
                    sections: [],
                    debug: { flow: 'engineId-fullscan-empty', k_type: resolvedEngineID, k_type_source: kTypeSource, durationMs: Date.now() - startedAt0 },
                  },
                  ttl_seconds: 600,
                  created_at: new Date().toISOString(),
                }, { onConflict: 'cache_type,cache_key' });
              } catch (_) { /* non-blocking */ }
              console.warn('[partsForEngine] full-scan returned 0 items for engineID', resolvedEngineID, '- cached empty (10min) and falling back to multi-section loop');
            } else {
              console.warn('[partsForEngine] full-scan call failed for engineID', resolvedEngineID, ':', res0.error, '- falling back to multi-section loop');
            }
          } catch (e) {
            console.warn('[partsForEngine] full-scan threw, falling back:', (e as Error).message);
          }
        }

        // ===== STRATEGY A: engineID + multi-genArtID byVehicle loop (concurrent + retry) =====
        if (resolvedEngineID > 0) {
          const startedAt = Date.now();
          const GLOBAL_BUDGET_MS = 45_000;
          const CONCURRENCY = 6;
          const PER_CALL_TIMEOUT_MS = 8_000;
          const aborted = { value: false };
          const collected: UnifiedPart[] = [];
          const seen = new Set<string>();
          let totalRaw = 0;
          let sectionsHit = 0;
          const timedOutSections: number[] = [];
          const retriedSections: number[] = [];
          const failedSections: { id: number; error: string }[] = [];

          await writeScanProgress(adminClient, cacheKey, {
            phase: 'starting', engineID: resolvedEngineID,
            sectionsTotal: TECDOC_SECTIONS.length, sectionsDone: 0,
          });

          const budgetTimer = setTimeout(() => { aborted.value = true; }, GLOBAL_BUDGET_MS);

          const sectionResults = await runConcurrent(
            TECDOC_SECTIONS,
            CONCURRENCY,
            async (sec) => {
              if (aborted.value) return { sec, rawCount: 0, items: [] as UnifiedPart[], skipped: true };
              const reqBody = { engineID: resolvedEngineID, genArtID: sec.id, getOECodes: true, target: 'P' };
              const res = await nextisPostWithRetry('/catalogs/items-finding-by-vehicle', reqBody, {
                timeoutMs: PER_CALL_TIMEOUT_MS,
                maxAttempts: 3,
              });
              if (!res.ok) {
                if (res.timedOut) timedOutSections.push(sec.id);
                else failedSections.push({ id: sec.id, error: res.error });
                return { sec, rawCount: 0, items: [] as UnifiedPart[] };
              }
              if (res.attempts > 1) retriedSections.push(sec.id);
              const rawList = res.data?.items || res.data?.Items || [];
              return { sec, rawCount: rawList.length, items: normalizeItems(res.data) };
            },
            (done, total) => {
              if (done % 4 === 0 || done === total) {
                writeScanProgress(adminClient, cacheKey, {
                  phase: 'scanning', engineID: resolvedEngineID,
                  sectionsTotal: total, sectionsDone: done,
                  sectionsHit, totalRawHits: totalRaw,
                  elapsedMs: Date.now() - startedAt,
                  aborted: aborted.value,
                });
              }
            },
          );
          clearTimeout(budgetTimer);

          for (const r of sectionResults) {
            totalRaw += r.rawCount;
            if (r.items.length > 0) sectionsHit++;
            const liveSectionLabel = liveSectionLabelFromItems(r.items, r.sec.label);
            for (const it of r.items) {
              if (!it.oem_number || !isAllowedBrand(it.brand)) continue;
              const key = `${r.sec.id}::${normalizeOemCode(it.brand)}::${normalizeOemCode(it.oem_number)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              collected.push({
                ...it,
                category: liveSectionLabel,
                // @ts-ignore — extra field consumed by frontend
                tecdoc_section: { id: r.sec.id, label: liveSectionLabel },
              });
            }
          }

          const enriched = await enrichItemsWithRelatedOem(adminClient, collected);
          const durationMs = Date.now() - startedAt;
          const quotaExceeded = totalRaw === 0 && failedSections.some((s) => /maximum calls per day/i.test(s.error));
          if (quotaExceeded) {
            await writeScanProgress(adminClient, cacheKey, {
              phase: 'quota_exceeded', engineID: resolvedEngineID,
              sectionsTotal: TECDOC_SECTIONS.length, sectionsDone: TECDOC_SECTIONS.length,
              sectionsHit: 0, totalRawHits: 0, durationMs, partial: true,
            });
            // STALE-WHILE-ERROR: pokud máme starší úspěšná data v cache, vrátíme je s flagem stale=true
            if (lastKnownCache && Array.isArray(lastKnownCache.data?.items) && lastKnownCache.data.items.length > 0) {
              const ageHours = Math.round((Date.now() - new Date(lastKnownCache.created_at).getTime()) / 3600000);
              result = {
                ...lastKnownCache.data,
                fromCache: true,
                stale: true,
                staleAgeHours: ageHours,
                staleSince: lastKnownCache.created_at,
                warning: `Externí katalog má vyčerpaný denní limit. Zobrazujeme poslední známá data (stáří ~${ageHours} h). Aktualizace po půlnoci.`,
              };
              break;
            }
            result = {
              items: [],
              engineID: resolvedEngineID,
              sectionsScanned: TECDOC_SECTIONS.length,
              sectionsHit: 0,
              totalRawHits: 0,
              source: 'engineID-quota-blocked',
              warning: 'Externí katalog má vyčerpaný denní limit; pro tento vůz zatím nejsou v cache žádná data. Zkuste to po půlnoci.',
              debug: {
                flow: 'engineIdQuotaBlocked',
                k_type: resolvedEngineID,
                k_type_source: kTypeSource,
                k_type_mapping_id: kTypeMappingId,
                durationMs,
                failedSections,
              },
            };
            break;
          } else {
          const out = {
            items: enriched,
            engineID: resolvedEngineID,
            sectionsScanned: TECDOC_SECTIONS.length,
            sectionsHit,
            totalRawHits: totalRaw,
            source: 'engineID-multi-genart',
            debug: {
              flow: 'engineId',
              k_type: resolvedEngineID,
              k_type_source: kTypeSource,
              k_type_mapping_id: kTypeMappingId,
              sectionsScanned: TECDOC_SECTIONS.length,
              sectionsHit,
              totalRawHits: totalRaw,
              durationMs,
              timedOutSections,
              retriedSections,
              failedSections,
              partial: aborted.value,
              concurrency: CONCURRENCY,
              perCallTimeoutMs: PER_CALL_TIMEOUT_MS,
            },
          };
          try {
            await adminClient.from('api_cache').upsert({
              cache_type: 'jm_parts_for_engine',
              cache_key: cacheKey,
              data: out,
              ttl_seconds: 604800,
              created_at: new Date().toISOString(),
            }, { onConflict: 'cache_type,cache_key' });
          } catch (_) { /* non-blocking */ }
          await writeScanProgress(adminClient, cacheKey, {
            phase: 'done', engineID: resolvedEngineID,
            sectionsTotal: TECDOC_SECTIONS.length, sectionsDone: TECDOC_SECTIONS.length,
            sectionsHit, totalRawHits: totalRaw,
            durationMs, partial: aborted.value,
          });
          result = out;
          break;
          }
        }

        // ===== STRATEGY B: OEM-seed fallback (no engineID set) =====

        const engineVariants = (() => {
          if (!engine) return [] as string[];
          const out = new Set<string>([engine]);
          out.add(engine.replace(/^(\d+\.\d+)(\s)/, '$1L$2'));
          out.add(engine.replace(/^(\d+\.\d+)L(\s)/, '$1$2'));
          const m = engine.match(/^(\d+\.\d+)/);
          if (m) out.add(m[1]);
          return [...out].filter(Boolean);
        })();

        // Pull OEM seeds from parts_new (Mopar/7zap/CSV-Mopar). Diverse: cap per category.
        // IMPORTANT: category comes from the source OEM section and must be preserved.
        // Do not re-classify J+M results into a small keyword map — that loses most sections.
        const normalizeSeedCategory = (value: unknown) =>
          String(value || 'Ostatní').replace(/\s*\([^)]*\)\s*/g, '').trim() || 'Ostatní';
        const fetchSeeds = async (useEngine: boolean): Promise<{ codes: string[]; categoryByCode: Map<string, string> }> => {
          const variantsToTry = useEngine && engineVariants.length ? engineVariants : [null];
          for (const variant of variantsToTry) {
            let q = adminClient.from('parts_new')
              .select('oem_number, catalog_source, manufacturer, category')
              .ilike('compatible_vehicles', `%${brand}%`)
              .ilike('compatible_vehicles', `%${model}%`)
              .in('catalog_source', ['mopar', 'mopar_oem', '7zap', 'csv', 'epc-link'])
              .limit(2000);
            if (variant) q = q.ilike('compatible_vehicles', `%${variant}%`);
            const { data } = await q;
            const clean = (data || []).filter((r: any) => {
              const src = String(r.catalog_source || '').toLowerCase();
              if (src === 'csv') return String(r.manufacturer || '').trim().toLowerCase() === 'mopar';
              return true;
            });
            // Bucket by every source category, take up to 25 per bucket → 15–20 visible sections.
            const byCat = new Map<string, string[]>();
            const categoryByCode = new Map<string, string>();
            for (const r of clean) {
              const oem = String(r.oem_number || '').trim();
              if (!oem) continue;
              const cat = normalizeSeedCategory(r.category);
              if (!byCat.has(cat)) byCat.set(cat, []);
              const arr = byCat.get(cat)!;
              if (arr.length < 25) {
                arr.push(oem);
                categoryByCode.set(normalizeOemCode(oem), cat);
              }
            }
            const codes = [...new Set([...byCat.values()].flat())];
            if (codes.length > 0) return { codes, categoryByCode };
          }
          return { codes: [], categoryByCode: new Map() };
        };

        let seedBundle = await fetchSeeds(true);
        let oemSeeds = seedBundle.codes;
        let seedCategoryByCode = seedBundle.categoryByCode;
        if (oemSeeds.length < 30) {
          const broad = await fetchSeeds(false);
          for (const [code, cat] of broad.categoryByCode) seedCategoryByCode.set(code, cat);
          oemSeeds = [...new Set([...oemSeeds, ...broad.codes])];
        }
        oemSeeds = oemSeeds.slice(0, 350);

        if (oemSeeds.length === 0) {
          result = { items: [], oemSeedsUsed: 0, warning: `Žádný Mopar OEM seed pro ${brand} ${model}` };
          break;
        }

        // Parallel batched calls to Nextis (8 at a time to avoid rate-limit).
        const BATCH = 8;
        const collected: UnifiedPart[] = [];
        const seen = new Set<string>();
        let totalRaw = 0;
        for (let i = 0; i < oemSeeds.length; i += BATCH) {
          const slice = oemSeeds.slice(i, i + BATCH);
          const results = await Promise.all(
            slice.map((code) => fetchJmForSpecificCode(code, 'CodeOE')
              .then((r) => ({ code, ...r }))
              .catch(() => ({ code, rawCount: 0, items: [] as UnifiedPart[] }))),
          );
          for (const r of results) {
            totalRaw += r.rawCount;
            for (const it of r.items) {
              if (!it.oem_number || !isAllowedBrand(it.brand)) continue;
              const seedCategory = seedCategoryByCode.get(normalizeOemCode(r.code)) || 'Ostatní';
              const key = `${normalizeOemCode(seedCategory)}::${normalizeOemCode(it.brand)}::${normalizeOemCode(it.oem_number)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              collected.push({
                ...it,
                related_oem_number: it.related_oem_number || r.code,
                category: seedCategory,
                // @ts-ignore — extra field consumed by frontend
                tecdoc_section: { id: seedCategory, label: seedCategory },
              });
            }
          }
        }

        // Enrich related_oem_number from parts_new where missing
        const enriched = await enrichItemsWithRelatedOem(adminClient, collected);

        const out = {
          items: enriched,
          oemSeedsUsed: oemSeeds.length,
          totalRawHits: totalRaw,
          source: 'oem-fallback-grouped',
          debug: {
            flow: 'oemFallback',
            k_type: 0,
            k_type_source: 'none',
            sectionsScanned: 0,
            sectionsHit: 0,
            totalRawHits: totalRaw,
            oemSeedsUsed: oemSeeds.length,
          },
        };

        // Cache 1h
        try {
          await adminClient.from('api_cache').upsert({
            cache_type: 'jm_parts_for_engine',
            cache_key: cacheKey,
            data: out,
            ttl_seconds: 604800,
            created_at: new Date().toISOString(),
          }, { onConflict: 'cache_type,cache_key' });
        } catch (_) { /* non-blocking */ }

        result = out;
        break;
      }


      case 'enrichPrices': {
        // Bulk: pull missing-price OEMs from parts_new and enrich them
        const limit = Math.min(Number(payload.limit ?? 100), 500);
        const { data: missing } = await adminClient
          .from('parts_new')
          .select('oem_number')
          .or('price_with_vat.is.null,price_with_vat.eq.0')
          .eq('price_locked', false)
          .limit(limit);
        const codes = (missing || []).map((r: any) => r.oem_number).filter(Boolean);
        const out = await enrichPricesIntoDb(adminClient, codes);
        result = out;
        break;
      }

      case 'partDetail': {
        // Lazy enrichment: full info (images, OE numbers, technical_parameters)
        // for a single J+M item. Used by the catalog detail panel.
        const code = String(payload.code || payload.oem_number || '').trim();
        if (!code) { result = { item: null }; break; }
        const cacheKey = `detail:${normalizeOemCode(code)}`;
        try {
          const { data: cached } = await adminClient
            .from('api_cache')
            .select('data, created_at, ttl_seconds')
            .eq('cache_type', 'jm_part_detail')
            .eq('cache_key', cacheKey)
            .maybeSingle();
          if (cached) {
            const ageMs = Date.now() - new Date(cached.created_at as string).getTime();
            if (ageMs < (cached.ttl_seconds ?? 7 * 24 * 3600) * 1000) {
              result = { item: cached.data, fromCache: true };
              break;
            }
          }
        } catch (_) { /* non-blocking */ }

        // Try CodeProduct (item code from supplier) first, then CodeOE (OE number).
        let direct = await fetchJmForSpecificCode(code, 'CodeProduct').catch(() => ({ rawCount: 0, items: [] as UnifiedPart[] }));
        if (!direct.items.length) {
          direct = await fetchJmForSpecificCode(code, 'CodeOE').catch(() => ({ rawCount: 0, items: [] as UnifiedPart[] }));
        }
        // Pick best match: exact OEM match wins, otherwise first
        const norm = normalizeOemCode(code);
        const best = direct.items.find((it) => normalizeOemCode(it.oem_number) === norm) || direct.items[0] || null;

        if (best) {
          try {
            await adminClient.from('api_cache').upsert({
              cache_type: 'jm_part_detail',
              cache_key: cacheKey,
              data: best,
              ttl_seconds: 7 * 24 * 3600,
              created_at: new Date().toISOString(),
            }, { onConflict: 'cache_type,cache_key' });
          } catch (_) { /* non-blocking */ }
        }

        result = { item: best, rawCount: direct.rawCount };
        break;
      }


      case 'getCategoryTree':
      case 'fetchCategoryTree':
      case 'categoryTree': {
        const { data, error } = await adminClient
          .from('catalog_categories')
          .select('id, parent_id, slug, name_cs, name_en, node_type, vehicle_brand, vehicle_model, vehicle_engine, is_global, sort_order')
          .order('sort_order', { ascending: true })
          .order('name_cs', { ascending: true });
        if (error) throw new Error(error.message);
        result = { items: data || [], count: (data || []).length };
        break;
      }

      case 'validateOrder':
      case 'createOrder': {
        // Items: [{ code, brand?, qty, userNote? }]
        const rawItems = Array.isArray(payload.items) ? payload.items : [];
        if (!rawItems.length) throw new Error('items required');
        const items = rawItems.slice(0, 100).map((it: any, idx: number) => ({
          code: String(it.code || it.oem || '').trim(),
          brand: it.brand ? String(it.brand).trim() : undefined,
          qty: Number(it.qty || it.quantity || 1),
          pairID: Number.isFinite(it.pairID) ? it.pairID : idx + 1,
          userNote: it.userNote ? String(it.userNote).slice(0, 400) : undefined,
        })).filter((i: any) => i.code && i.qty > 0);
        if (!items.length) throw new Error('no valid items');

        const path = action === 'validateOrder' ? '/orders/validation' : '/orders/sending';
        const reqBody: Record<string, unknown> = {
          items,
          orderType: payload.orderType || 'General',
          userNote: payload.userNote ? String(payload.userNote).slice(0, 600) : undefined,
          userOrder: payload.userOrder ? String(payload.userOrder).slice(0, 75) : undefined,
          keepBackOrder: payload.keepBackOrder !== false,
          trySearchWithoutManufacturer: payload.trySearchWithoutManufacturer === true,
        };
        const raw = await nextisPost(path, reqBody);
        const nextisOrderId =
          raw?.orderID ?? raw?.OrderID ?? raw?.orderId ?? raw?.OrderId ??
          raw?.orderNumber ?? raw?.OrderNumber ?? null;
        result = {
          action,
          path,
          nextisOrderId: nextisOrderId != null ? String(nextisOrderId) : null,
          status: raw?.status ?? raw?.Status ?? null,
          statusText: raw?.statusText ?? raw?.StatusText ?? null,
          itemsResult: raw?.items ?? raw?.Items ?? [],
          raw,
        };
        break;
      }

      default: {
        const known = [
          'ping', 'diagnose', 'syncCategories', 'searchByCode', 'vehicleCategories',
          'searchByVehicle', 'partsForEngine', 'priceAndStock', 'enrichPrices',
          'getCategoryTree', 'fetchCategoryTree', 'categoryTree',
          'validateOrder', 'createOrder',
        ];
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Unknown action',
            action: action ?? null,
            knownActions: known,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('jm-proxy error:', e);
    // Best-effort error logging — uses fresh service-role client (admin client may not exist if early failure)
    try {
      const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      await logCatalogEvent(sb, {
        level: 'error',
        event: 'jm_proxy_unhandled',
        message: (e as Error).message,
        details: { stack: ((e as Error).stack || '').slice(0, 1000) },
      });
    } catch (_) { /* swallow */ }
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
