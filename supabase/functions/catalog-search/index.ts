const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

type Session = { loggedIn: boolean; cookies: Record<string, string> };

interface PartResult {
  oem_number: string;
  name: string;
  price_without_vat: number;
  price_with_vat: number;
  found: boolean;
  cached: boolean;
  search_code: string;
  catalog_source: string;
  category: string | null;
  family: string | null;
  segment: string | null;
  packaging: string | null;
  description: string | null;
  manufacturer: string | null;
  availability: string;
  compatible_vehicles: string | null;
  superseded_by: string | null;
  supersedes: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { oemCodes, mode } = body;
    if (!oemCodes || !Array.isArray(oemCodes) || oemCodes.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'oemCodes array is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const password = Deno.env.get('CATALOG_PASS') || '';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase config');

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const results: PartResult[] = [];
    const diagnostics = { mopar: { status: 'ok', responseTime: 0 }, autokelly: { status: 'disabled', responseTime: 0 }, intercars: { status: 'disabled', responseTime: 0 } };

    const loginStart = Date.now();
    const session = await loginToCatalog(password);
    diagnostics.mopar.responseTime = Date.now() - loginStart;
    diagnostics.mopar.status = session.loggedIn ? 'ok' : 'login_failed';
    console.log('Login success:', session.loggedIn, 'in', diagnostics.mopar.responseTime, 'ms');

    for (const oem of oemCodes.slice(0, 10)) {
      const cleanOem = oem.replace(/[\s-]/g, '').toUpperCase();
      const searchCode = `6${cleanOem}`;

      // Check cache in DB
      const { data: cached } = await supabase
        .from('parts_new')
        .select('id, oem_number, name, price_without_vat, price_with_vat, last_price_update, price_locked, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source')
        .eq('oem_number', cleanOem)
        .single();

      // Check supersessions
      const { data: supersededBy } = await supabase
        .from('part_supersessions')
        .select('new_oem_number')
        .eq('old_oem_number', cleanOem)
        .limit(1);

      const { data: supersedes } = await supabase
        .from('part_supersessions')
        .select('old_oem_number')
        .eq('new_oem_number', cleanOem)
        .limit(1);

      const supersededByOem = supersededBy?.[0]?.new_oem_number || null;
      const supersedesOem = supersedes?.[0]?.old_oem_number || null;

      if (cached?.last_price_update && mode !== 'force') {
        const hoursAgo = (Date.now() - new Date(cached.last_price_update).getTime()) / 36e5;
        if (hoursAgo < 24 || cached.price_locked) {
          results.push({
            oem_number: cleanOem, name: cached.name,
            price_without_vat: cached.price_without_vat, price_with_vat: cached.price_with_vat,
            found: true, cached: true, search_code: searchCode,
            catalog_source: cached.catalog_source || 'mopar',
            category: cached.category, family: cached.family, segment: cached.segment, packaging: cached.packaging,
            description: cached.description, manufacturer: cached.manufacturer,
            availability: cached.availability || 'unknown',
            compatible_vehicles: cached.compatible_vehicles,
            superseded_by: supersededByOem, supersedes: supersedesOem,
          });
          continue;
        }
      }

      // Search external Mopar catalog
      let searchResult = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, category: '', family: '', segment: '', packaging: '' };
      if (session.loggedIn) {
        try {
          const searchStart = Date.now();
          searchResult = await searchCatalog(session, searchCode, cleanOem);
          diagnostics.mopar.responseTime = Math.max(diagnostics.mopar.responseTime, Date.now() - searchStart);
        } catch (err) { console.error('Search failed:', err); }
      }

      if (searchResult.found) {
        const partData: any = {
          name: searchResult.name || `Díl ${cleanOem}`,
          price_without_vat: searchResult.price_without_vat,
          price_with_vat: searchResult.price_with_vat,
          last_price_update: new Date().toISOString(),
          catalog_source: 'mopar',
          availability: 'available',
        };
        if (searchResult.category) partData.category = searchResult.category;
        if (searchResult.family) partData.family = searchResult.family;
        if (searchResult.segment) partData.segment = searchResult.segment;
        if (searchResult.packaging) partData.packaging = searchResult.packaging;

        if (cached) {
          if (cached.price_without_vat !== searchResult.price_without_vat && !cached.price_locked) {
            await supabase.from('price_history').insert({
              part_id: cached.id, old_price_without_vat: cached.price_without_vat,
              new_price_without_vat: searchResult.price_without_vat, old_price_with_vat: cached.price_with_vat,
              new_price_with_vat: searchResult.price_with_vat, source: 'catalog-search',
            });
          }
          if (!cached.price_locked) {
            await supabase.from('parts_new').update(partData).eq('id', cached.id);
          }
        } else {
          await supabase.from('parts_new').insert({ oem_number: cleanOem, ...partData });
        }
      }

      results.push({
        oem_number: cleanOem,
        name: searchResult.found ? (searchResult.name || `Díl ${cleanOem}`) : (cached?.name || `Díl ${cleanOem}`),
        price_without_vat: searchResult.found ? searchResult.price_without_vat : (cached?.price_without_vat || 0),
        price_with_vat: searchResult.found ? searchResult.price_with_vat : (cached?.price_with_vat || 0),
        found: searchResult.found || !!cached,
        cached: false, search_code: searchCode,
        catalog_source: 'mopar',
        category: searchResult.category || cached?.category || null,
        family: searchResult.family || cached?.family || null,
        segment: searchResult.segment || cached?.segment || null,
        packaging: searchResult.packaging || cached?.packaging || null,
        description: cached?.description || null,
        manufacturer: cached?.manufacturer || 'Mopar',
        availability: searchResult.found ? 'available' : (cached?.availability || 'unknown'),
        compatible_vehicles: cached?.compatible_vehicles || null,
        superseded_by: supersededByOem, supersedes: supersedesOem,
      });
    }

    return new Response(JSON.stringify({ success: true, results, diagnostics }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (error) {
    console.error('catalog-search error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function collectCookies(resp: Response, jar: Record<string, string>) {
  for (const c of resp.headers.getSetCookie?.() || []) {
    const parts = c.split(';')[0].split('=');
    if (parts.length >= 2) jar[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function loginToCatalog(password: string): Promise<Session> {
  const cookies: Record<string, string> = {};
  const headers = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*', 'Accept-Language': 'cs-CZ,cs;q=0.9' };

  const initResp = await fetch(CATALOG_URL, { headers, redirect: 'manual' });
  collectCookies(initResp, cookies);
  await initResp.text();

  const loginResp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieHeader(cookies), 'Origin': 'https://www.vernostsevyplaci.cz', 'Referer': CATALOG_URL },
    body: `password=${encodeURIComponent(password)}&submit-password=${encodeURIComponent('Přihlásit')}`,
    redirect: 'manual',
  });
  collectCookies(loginResp, cookies);
  const loginBody = await loginResp.text();

  if (loginBody.includes('name="password"')) return { loggedIn: false, cookies };
  return { loggedIn: true, cookies };
}

async function searchCatalog(session: Session, searchCode: string, oem: string): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number; category: string; family: string; segment: string; packaging: string }> {
  const resp = await fetch(CATALOG_URL, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Accept': 'text/html,*/*', 'Accept-Language': 'cs-CZ,cs;q=0.9', 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': cookieHeader(session.cookies), 'Referer': CATALOG_URL },
    body: `find-part=${encodeURIComponent(searchCode)}&search-part=${encodeURIComponent('Vyhledat')}`,
    redirect: 'follow',
  });
  return parseSearchResult(await resp.text(), oem);
}

function parseSearchResult(html: string, oem: string): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; category: string; family: string; segment: string; packaging: string } {
  const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Table: Kód dílu | Název | Famílie | Kategorie | Segment | Balení | Cena bez DPH | Cena s DPH
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;
  while ((match = rowRegex.exec(cleanHtml)) !== null) {
    const cells: string[] = [];
    const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cm;
    while ((cm = cellRegex.exec(match[1])) !== null) cells.push(cm[1].replace(/<[^>]+>/g, '').trim());

    if (cells.length < 7) continue;
    const priceIdx = cells.findIndex(c => c.includes('Kč'));
    if (priceIdx === -1) continue;

    const parse = (s: string) => parseFloat(s.replace(/\s/g, '').replace('Kč', '').replace(',', '.'));
    const priceWithout = parse(cells[priceIdx]);
    const priceWith = priceIdx + 1 < cells.length && cells[priceIdx + 1].includes('Kč') ? parse(cells[priceIdx + 1]) : Math.round(priceWithout * 1.21 * 100) / 100;
    if (isNaN(priceWithout) || priceWithout <= 0) continue;

    return {
      found: true,
      name: cells[1] || `Díl ${oem}`,
      price_without_vat: priceWithout,
      price_with_vat: priceWith,
      family: cells[2] || '',
      category: cells[3] || '',
      segment: cells[4] || '',
      packaging: cells[5] || '',
    };
  }

  // Fallback: price patterns in text
  const text = cleanHtml.replace(/<[^>]+>/g, ' ');
  const prices: number[] = [];
  const pp = /(\d[\d\s]*[,.]?\d*)\s*Kč/gi;
  let pm;
  while ((pm = pp.exec(text)) !== null) {
    const v = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 0 && v < 1000000) prices.push(v);
  }
  if (prices.length > 0) {
    return { found: true, name: `Díl ${oem}`, price_without_vat: prices[0], price_with_vat: prices.length > 1 ? prices[1] : Math.round(prices[0] * 1.21 * 100) / 100, family: '', category: '', segment: '', packaging: '' };
  }

  return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, family: '', category: '', segment: '', packaging: '' };
}
