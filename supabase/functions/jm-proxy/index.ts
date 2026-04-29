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
const ALLOWED_BRANDS: readonly string[] = ["chrysler", "dodge", "ram", "cadillac", "lancia"];

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
    throw new Error(`Nextis ${path} ${res.status}: ${t.slice(0, 300)}`);
  }
  return await res.json();
}

// ---------- normalisation ----------
// MANDATORY +37 % markup applied LIVE on every J+M (aftermarket) price (per architect plan).
// OEM (Mopar): 0 % margin (price_locked). Universal: handled via UNIVERSAL_MARGIN.
const JM_MARGIN = 1.37;
const UNIVERSAL_MARGIN = 1.20;

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
  const imageUrls = collectImageUrls(it);

  return {
    supplier: 'jm',
    oem_number: String(prefix ? `${prefix}${code}` : code).trim(),
    brand: String(brand).trim(),
    name: String(name).trim(),
    price_without_vat: Math.round(priceNoVat * 100) / 100,
    price_with_vat: Math.round(priceVat * 100) / 100,
    stock,
    availability: stock > 0 ? 'in_stock' : 'on_order',
    image: imageUrls[0] || '',
    image_urls: imageUrls,
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
  const collected: UnifiedPart[] = [];
  let rawCount = 0;
  for (const target of targets) {
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
    rawCount += rawList.length;
    const items = normalizeItems(raw);
    if (items.length > 0) {
      collected.push(...items);
      break;
    }
  }
  return { rawCount, items: dedupeUnifiedParts(collected) };
}

async function fetchJmViaCrossRefs(adminClient: any, oeCode: string, category = ''): Promise<{ items: UnifiedPart[]; xrefsTried: string[]; rawHits: number }> {
  const xrefs = await lookupCrossRefsForOem(adminClient, oeCode, 80);
  const items: UnifiedPart[] = [];
  const xrefsTried: string[] = [];
  let rawHits = 0;

  for (const x of xrefs) {
    const partNumber = String(x.part_number || '').trim();
    if (!partNumber) continue;
    xrefsTried.push(partNumber);
    console.log(`Found Cross-Ref ${partNumber} for OE ${oeCode}. Querying J+M again...`);
    let result = await fetchJmForSpecificCode(partNumber, 'CodeProduct');
    if (result.items.length === 0) {
      const oeResult = await fetchJmForSpecificCode(partNumber, 'CodeOE');
      result = { rawCount: result.rawCount + oeResult.rawCount, items: oeResult.items };
    }
    rawHits += result.rawCount;
    for (const part of result.items) {
      items.push({
        ...part,
        category: category || part.category,
        related_oem_number: oeCode,
        searched_code: partNumber,
      });
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
    const apiKeyHeader = req.headers.get('apikey') || '';
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const publishableKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const isProjectKey = (!!anonKey && bearer === anonKey) || (!!publishableKey && bearer === publishableKey) || (!!apiKeyHeader && bearer === apiKeyHeader);
    const isServerKey = isProjectKey || bearer === serviceKey;

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
        const enableCrossref = payload.enableCrossref !== false; // default ON

        // OE PREFIX/SUFFIX LADDER: try original, K-prefix variants, suffix-stripped,
        // and base-8 variants before falling back to local crossrefs.
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

        for (const variant of variants) {
          const direct = await fetchJmForSpecificCode(variant, 'CodeOE');
          totalRawHits += direct.rawCount;
          attempts.push({ code: variant, raw: direct.rawCount, count: direct.items.length, mode: 'direct-oe' });
          if (direct.items.length) merged.push(...direct.items);
        }

        if (enableCrossref) {
          const cross = await fetchJmViaCrossRefs(adminClient, rawCode);
          totalRawHits += cross.rawHits;
          attempts.push(...cross.xrefsTried.map((code) => ({ code, raw: 0, count: 0, mode: 'crossref-product' })));
          merged.push(...cross.items);
          console.log(`[searchByCode] crossref recursive lookup ${cross.xrefsTried.length} refs for ${rawCode}, items=${cross.items.length}`);
        }

        const seen = new Set<string>();
        merged = dedupeUnifiedParts(merged).filter((p) => {
          if (!p.oem_number) return false;
          const key = `${normalizeOemCode(p.brand)}::${normalizeOemCode(p.oem_number)}`;
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
          totalRawHits,
        };
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
        for (const variant of (engineVariants.length ? engineVariants : [null])) {
          let q = adminClient
            .from('parts_new')
            .select('oem_number, name, category, description, compatible_vehicles')
            .ilike('compatible_vehicles', `%${vBrand}%`)
            .ilike('compatible_vehicles', `%${vModel}%`)
            .limit(3000);
          if (variant) q = q.ilike('compatible_vehicles', `%${variant}%`);
          const { data, error } = await q;
          if (error) throw error;
          if (data && data.length > 0) { rows = data; break; }
        }
        // Final fallback: brand+model only
        if (!rows || rows.length === 0) {
          const fallback = await adminClient
            .from('parts_new')
            .select('oem_number, name, category, description, compatible_vehicles')
            .ilike('compatible_vehicles', `%${vBrand}%`)
            .ilike('compatible_vehicles', `%${vModel}%`)
            .limit(3000);
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
              .select('oem_number, name, category, description, compatible_vehicles')
              .ilike('compatible_vehicles', `%${brand}%`)
              .ilike('compatible_vehicles', `%${model}%`)
              .limit(500);
            if (variant) q = q.ilike('compatible_vehicles', `%${variant}%`);
            const { data: rows, error } = await q;
            if (error) {
              console.warn('[searchByVehicle] oem lookup error:', error.message);
              continue;
            }
            if (rows?.length) {
              allRows.push(...rows);
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

        // RELAXATION LADDER (Phase 2 — Operation Redline 2.0):
        // 1) strict subcategory + engine
        // 2) parent keywords + engine (broader, same vehicle)
        // 3) strict subcategory + brand+model only (ignore engine — covers 300C 3.0 CRD etc.)
        // 4) parent keywords + brand+model only
        // 5) brand+model only, NO keyword filter (last resort, gets ANY OEM seed)
        const seedKeywords = categoryKeywords.length > 0 ? categoryKeywords : parentKeywords;
        const sameAsSeed = (kws: string[]) => JSON.stringify(kws) === JSON.stringify(seedKeywords);
        const ladder: Array<{ label: string; useEngine: boolean; keywords: string[] }> = [
          { label: 'engine+subcat', useEngine: true,  keywords: seedKeywords },
          { label: 'engine+parent', useEngine: true,  keywords: parentKeywords },
          { label: 'brand+subcat',  useEngine: false, keywords: seedKeywords },
          { label: 'brand+parent',  useEngine: false, keywords: parentKeywords },
          { label: 'brand-only',    useEngine: false, keywords: [] },
        ];

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

      default: {
        const known = [
          'ping', 'diagnose', 'syncCategories', 'searchByCode', 'vehicleCategories',
          'searchByVehicle', 'priceAndStock', 'enrichPrices',
          'getCategoryTree', 'fetchCategoryTree', 'categoryTree',
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
    return new Response(
      JSON.stringify({ success: false, error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
