// J+M Autodíly / Nextis API Proxy
// Secure server-side proxy that handles auth + caches Bearer token in memory.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BASE_URL = 'https://api.jmautodily.nextis.cz';

// Allowed US brands (normalized lowercase, partial match)
const US_BRANDS = [
  'chrysler', 'dodge', 'jeep', 'ram', 'cadillac', 'chevrolet', 'chevy',
  'gmc', 'buick', 'ford', 'lincoln', 'mercury', 'pontiac', 'hummer',
  'tesla', 'oldsmobile', 'plymouth', 'saturn', 'mopar',
];

// Universal/generic brands always allowed (oils, filters, batteries etc.)
const UNIVERSAL_BRANDS = ['bosch', 'mann', 'mahle', 'denso', 'ngk', 'gates', 'febi', 'valeo'];

function isUsBrand(producer: string | null | undefined): boolean {
  if (!producer) return true; // unknown -> let it pass, frontend may filter further
  const p = producer.toLowerCase().trim();
  return US_BRANDS.some((b) => p.includes(b)) || UNIVERSAL_BRANDS.some((b) => p.includes(b));
}

// In-memory token cache (per warm instance)
let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.token;
  }
  const login = Deno.env.get('JM_LOGIN');
  const password = Deno.env.get('JM_PASS');
  const customerNo = Deno.env.get('JM_CUST_NO');

  if (!login || !password || !customerNo) {
    throw new Error('Missing JM credentials in secrets');
  }

  // Nextis auth: POST /common/authentication with { login, password }
  const url = `${BASE_URL}/common/authentication`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nextis auth failed: ${url} -> ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  const token = data.token || data.Token;
  if (!token) {
    throw new Error(`Nextis auth: no token in response (status=${data.status ?? '?'} ${data.statusText ?? ''})`);
  }
  // tokenValidTo (ISO date) controls real expiry; default ~120 min. Cache slightly less.
  const validTo = data.tokenValidTo ? new Date(data.tokenValidTo).getTime() : Date.now() + 110 * 60 * 1000;
  cachedToken = { token, expiresAt: validTo };
  return token;
}

async function nextisCall(path: string, body: unknown): Promise<unknown> {
  const token = await getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    cachedToken = null;
    const t2 = await getToken();
    const res2 = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${t2}`,
      },
      body: JSON.stringify(body),
    });
    if (!res2.ok) throw new Error(`Nextis ${path}: ${res2.status}`);
    return await res2.json();
  }
  if (!res.ok) throw new Error(`Nextis ${path}: ${res.status} ${await res.text()}`);
  return await res.json();
}

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

function normalizeItems(raw: any): UnifiedPart[] {
  const items: any[] = Array.isArray(raw) ? raw : raw?.Items || raw?.items || raw?.Data || raw?.Result || [];
  return items
    .map((it): UnifiedPart => {
      const code = it.Code || it.OemNumber || it.ItemCode || it.code || '';
      const producer = it.Producer || it.Brand || it.Manufacturer || it.producer || '';
      const name = it.Name || it.Description || it.name || '';
      const price = Number(it.Price || it.PriceWithoutVat || it.UnitPrice || 0);
      const stock = Number(it.Stock || it.StockQuantity || it.Available || 0);
      return {
        supplier: 'jm',
        oem_number: String(code),
        brand: String(producer),
        name: String(name),
        price_without_vat: price,
        price_with_vat: Math.round(price * 1.21 * 100) / 100,
        stock,
        availability: stock > 0 ? 'in_stock' : 'on_order',
        image: it.ImageUrl || it.Image || '',
        category: it.Category || it.CategoryName || '',
        compatible_vehicles: it.CompatibleVehicles || [],
      };
    })
    .filter((p) => isUsBrand(p.brand));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    // Auth: only authenticated users (and ideally admin) may proxy
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: claims, error: claimsErr } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { action, payload } = await req.json();

    // Admin client (service role) for writes to catalog_categories
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Allowed vehicle brands (Phase 1: strict whitelist)
    const ALLOWED_BRANDS = ['chrysler', 'dodge', 'ram', 'cadillac', 'lancia'];
    const isAllowedBrand = (b: string) =>
      ALLOWED_BRANDS.some((a) => (b || '').toLowerCase().includes(a));

    let result: unknown;
    switch (action) {
      case 'ping': {
        const token = await getToken();
        result = { ok: true, hasToken: !!token };
        break;
      }
      case 'syncCategories': {
        // Pull Nextis vehicle/category tree and persist allowed brands into catalog_categories.
        // Tries known Nextis catalog endpoints; gracefully falls back if shape differs.
        const endpoints = [
          '/api/v1/Catalogs/GetVehicleTree',
          '/api/v1/Catalogs/VehicleHierarchy',
          '/api/v1/Catalogs/GetBrands',
        ];
        let raw: any = null;
        let usedEndpoint = '';
        for (const ep of endpoints) {
          try {
            raw = await nextisCall(ep, { CustomerNumber: Deno.env.get('JM_CUST_NO') });
            usedEndpoint = ep;
            break;
          } catch (_) { /* try next */ }
        }
        if (!raw) {
          result = { synced: 0, error: 'No Nextis vehicle endpoint reachable', endpoints };
          break;
        }

        const brands: any[] =
          raw?.Brands || raw?.brands || raw?.Items || raw?.Data || (Array.isArray(raw) ? raw : []);

        // Lookup existing brand roots so we can attach models under them
        const { data: existingBrands } = await adminClient
          .from('catalog_categories')
          .select('id, vehicle_brand, slug')
          .eq('node_type', 'brand');
        const brandIdByName: Record<string, string> = {};
        for (const b of existingBrands || []) {
          if (b.vehicle_brand) brandIdByName[b.vehicle_brand.toLowerCase()] = b.id;
        }

        let inserted = 0;
        let skipped = 0;

        for (const br of brands) {
          const brandName: string = br.Name || br.BrandName || br.name || '';
          if (!brandName || !isAllowedBrand(brandName)) { skipped++; continue; }
          const brandKey = ALLOWED_BRANDS.find((a) => brandName.toLowerCase().includes(a))!;
          const parentId = brandIdByName[brandKey];
          if (!parentId) { skipped++; continue; }

          const models: any[] = br.Models || br.models || br.Items || [];
          for (const m of models) {
            const modelName: string = m.Name || m.ModelName || m.name || '';
            if (!modelName) continue;
            const slug = modelName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);

            const { data: modelRow, error: modelErr } = await adminClient
              .from('catalog_categories')
              .upsert({
                parent_id: parentId,
                slug,
                name_cs: modelName,
                name_en: modelName,
                node_type: 'model',
                vehicle_brand: brandKey.charAt(0).toUpperCase() + brandKey.slice(1),
                vehicle_model: modelName,
                source: 'jm',
                external_id: String(m.Id || m.id || ''),
              }, { onConflict: 'parent_id,slug' })
              .select('id')
              .single();
            if (modelErr) continue;
            inserted++;

            // Optional: engines under model
            const engines: any[] = m.Engines || m.engines || m.Types || [];
            for (const e of engines) {
              const engineName: string = e.Name || e.EngineName || e.name || '';
              if (!engineName) continue;
              const eSlug = engineName.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 60);
              await adminClient
                .from('catalog_categories')
                .upsert({
                  parent_id: modelRow.id,
                  slug: eSlug,
                  name_cs: engineName,
                  name_en: engineName,
                  node_type: 'engine',
                  vehicle_brand: brandKey.charAt(0).toUpperCase() + brandKey.slice(1),
                  vehicle_model: modelName,
                  vehicle_engine: engineName,
                  source: 'jm',
                  external_id: String(e.Id || e.id || ''),
                  year_from: e.YearFrom || e.year_from || null,
                  year_to: e.YearTo || e.year_to || null,
                }, { onConflict: 'parent_id,slug' });
              inserted++;
            }
          }
        }
        result = { synced: inserted, skipped, endpoint: usedEndpoint, allowedBrands: ALLOWED_BRANDS };
        break;
      }
      case 'searchByCode': {
        // payload: { code: string }
        const raw = await nextisCall('/api/v1/Catalogs/ItemFindingByCode', {
          Code: payload.code,
          CustomerNumber: Deno.env.get('JM_CUST_NO'),
        });
        result = { items: normalizeItems(raw) };
        break;
      }
      case 'searchByVehicle': {
        // payload: { vin?, brand?, model?, year? }
        const raw = await nextisCall('/api/v1/Catalogs/ItemFindingByVehicle', {
          ...payload,
          CustomerNumber: Deno.env.get('JM_CUST_NO'),
        });
        result = { items: normalizeItems(raw) };
        break;
      }
      case 'priceAndStock': {
        // payload: { codes: string[] }
        const raw = await nextisCall('/api/v1/Catalogs/GetItemPriceAndStock', {
          Codes: payload.codes,
          CustomerNumber: Deno.env.get('JM_CUST_NO'),
        });
        result = { items: raw };
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
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
