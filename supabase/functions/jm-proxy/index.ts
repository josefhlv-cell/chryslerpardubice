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

// Backwards-compat name still used in a couple of call sites.
// Returns TRUE = keep the part. We now keep everything except blacklisted brands.
function isUsBrand(producer: string | null | undefined): boolean {
  return !isBlacklisted(producer);
}

// ---------- token cache ----------
let cachedToken: { token: string; expiresAt: number } | null = null;

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

  let res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload),
  });

  if (res.status === 401) {
    cachedToken = null;
    const fresh = await getToken();
    res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ ...payload, token: fresh }),
    });
  }

  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Nextis ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return await res.json();
}

// ---------- normalisation ----------
// MANDATORY +30 % markup applied LIVE on every J+M (aftermarket) price.
// Never persisted into parts_new — applied only on the response sent to the client.
const JM_MARGIN = 1.30;

interface UnifiedPart {
  supplier: 'jm';
  oem_number: string;
  brand: string;
  name: string;
  price_without_vat: number;
  price_with_vat: number;
  stock: number;
  availability: string;
  image: string;
  category: string;
  compatible_vehicles: string[];
}

function normalizeCatalogItem(it: any): UnifiedPart {
  // Real Nextis CatalogItem shape
  const code = it.productCode || it.ProductCode || '';
  const prefix = it.productPrefix || it.ProductPrefix || '';
  const brand = it.productBrand || it.ProductBrand || '';
  const name = it.productName || it.ProductName || it.productDescription || '';
  const price = it.price || it.Price || {};
  const purchaseNoVat = Number(price.unitPrice ?? price.UnitPrice ?? 0);
  const purchaseVat = Number(price.unitPriceIncVAT ?? price.UnitPriceIncVAT ?? purchaseNoVat * 1.21);
  // Apply mandatory +30 % markup (Phase 3A)
  const priceNoVat = purchaseNoVat * JM_MARGIN;
  const priceVat = purchaseVat * JM_MARGIN;
  const stock = Number(it.qtyAvailableMain ?? it.QtyAvailableMain ?? 0)
              + Number(it.qtyAvailableSupplier ?? it.QtyAvailableSupplier ?? 0);

  return {
    supplier: 'jm',
    oem_number: String(prefix ? `${prefix}${code}` : code).trim(),
    brand: String(brand).trim(),
    name: String(name).trim(),
    price_without_vat: Math.round(priceNoVat * 100) / 100,
    price_with_vat: Math.round(priceVat * 100) / 100,
    stock,
    availability: stock > 0 ? 'in_stock' : 'on_order',
    image: '',
    category: '',
    compatible_vehicles: [],
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
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const bearer = authHeader.replace('Bearer ', '').trim();
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isServerKey = bearer === anonKey || bearer === serviceKey;

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const body = await req.json();
    const { action, payload = {} } = body;

    // Auth: server keys (cron) always allowed; otherwise validate user JWT.
    // For syncCategories / enrichPrices, additionally require admin role.
    let userId: string | null = null;
    if (!isServerKey) {
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

        // Try variants in parallel: with K prefix, without K prefix, raw as-is.
        const stripped = rawCode.replace(/^K/i, '');
        const variants = Array.from(new Set([
          rawCode,
          stripped,
          `K${stripped}`,
        ].filter(Boolean)));
        const targets: Array<string | undefined> = [undefined, 'P', 'O'];

        const attempts: Array<{ code: string; target?: string; raw: any; count: number }> = [];
        const all: any[] = [];

        for (const variant of variants) {
          for (const target of targets) {
            const reqBody: Record<string, unknown> = {
              code: variant,
              searchTarget: 'CodeOE',
              trySearchWithoutManufacturer: true,
              getOECodes: true,
              getDeposits: false,
              getServices: false,
              getCashBack: false,
              getEANCodes: false,
            };
            if (target) reqBody.target = target;
            const raw = await nextisPost('/catalogs/items-finding-by-code', reqBody).catch((e) => ({ _error: String(e) }));
            const list = (raw?.items || raw?.Items || []);
            attempts.push({ code: variant, target, raw: { status: raw?.status, statusText: raw?.statusText, error: raw?._error }, count: list.length });
            if (list.length) {
              all.push(...list);
              break; // got hits for this variant, move to next variant
            }
          }
        }

        // Deduplicate by oem_number
        const seen = new Set<string>();
        const merged = extractItems({ items: all })
          .map(normalizeCatalogItem)
          .filter((p) => {
            if (!p.oem_number) return false;
            const key = p.oem_number.toUpperCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return skipBrandFilter ? true : isUsBrand(p.brand);
          });

        try {
          const codes = merged.map((i) => i.oem_number).filter(Boolean);
          if (codes.length) await enrichPricesIntoDb(adminClient, codes);
        } catch (_) { /* non-blocking */ }

        result = {
          items: merged,
          variantsTried: variants,
          attempts,
          skipBrandFilter,
          totalRawHits: all.length,
        };
        break;
      }

      case 'searchByVehicle': {
        // Nextis requires engineID (integer). We don't have one until the user
        // picks an engine in the local tree, so we fall back to brand+model
        // search via items-finding-by-code using the model name as a free hint.
        const engineID = Number(payload.engineID || 0);
        let raw: any;
        if (engineID > 0) {
          raw = await nextisPost('/catalogs/items-finding-by-vehicle', {
            engineID,
            getOECodes: true,
          });
        } else {
          // Soft fallback: search by brand+model string against item-finding-by-code
          const hint = [payload.brand, payload.model].filter(Boolean).join(' ').trim();
          if (!hint) { result = { items: [], warning: 'engineID or brand+model required' }; break; }
          raw = await nextisPost('/catalogs/items-finding-by-code', {
            code: hint,
            getOECodes: true,
          });
        }
        const items = normalizeItems(raw);
        try {
          const codes = items.map((i) => i.oem_number).filter(Boolean);
          if (codes.length) await enrichPricesIntoDb(adminClient, codes);
        } catch (_) { /* non-blocking */ }
        result = { items, status: raw?.status, statusText: raw?.statusText };
        break;
      }

      case 'priceAndStock': {
        const codes: string[] = Array.isArray(payload.codes) ? payload.codes.slice(0, 50) : [];
        if (!codes.length) { result = { items: [] }; break; }
        const enrich = await enrichPricesIntoDb(adminClient, codes).catch(() => ({ enriched: 0, items: [] }));
        result = { items: enrich.items || [], enrichedInDb: enrich.enriched || 0 };
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

      default:
        return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('jm-proxy error:', e);
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
