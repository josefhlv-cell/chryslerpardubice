const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const AK_BASE = 'https://www.autokelly.cz';
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
    const diagnostics = {
      mopar: { status: 'ok', responseTime: 0 },
      autokelly: { status: 'disabled', responseTime: 0 },
      intercars: { status: 'disabled', responseTime: 0 },
    };

    // Login to Mopar catalog
    const loginStart = Date.now();
    const session = await loginToCatalog(password);
    diagnostics.mopar.responseTime = Date.now() - loginStart;
    diagnostics.mopar.status = session.loggedIn ? 'ok' : 'login_failed';
    console.log('Mopar login:', session.loggedIn, 'in', diagnostics.mopar.responseTime, 'ms');

    // Login to AutoKelly
    const akEmail = Deno.env.get('AUTOKELLY_EMAIL') || '';
    const akPass = Deno.env.get('AUTOKELLY_PASS') || '';
    let akSession: Session = { loggedIn: false, cookies: {} };
    if (akEmail && akPass) {
      const akStart = Date.now();
      akSession = await loginToAutoKelly(akEmail, akPass);
      diagnostics.autokelly.responseTime = Date.now() - akStart;
      diagnostics.autokelly.status = akSession.loggedIn ? 'ok' : 'login_failed';
      console.log('AutoKelly login:', akSession.loggedIn, 'in', diagnostics.autokelly.responseTime, 'ms');
    }

    for (const oem of oemCodes.slice(0, 10)) {
      const cleanOem = oem.replace(/[\s-]/g, '').toUpperCase();
      const padded = cleanOem.length <= 9 ? `0${cleanOem}` : cleanOem;
      const searchVariants = [...new Set([`K${padded}`, `K${cleanOem}`, padded, cleanOem])];

      // Check cache in DB
      const { data: cached } = await supabase
        .from('parts_new')
        .select('id, oem_number, name, price_without_vat, price_with_vat, last_price_update, price_locked, category, family, segment, packaging, description, manufacturer, availability, compatible_vehicles, catalog_source')
        .eq('oem_number', cleanOem)
        .maybeSingle();

      // Check supersessions
      const [{ data: supersededBy }, { data: supersedes }] = await Promise.all([
        supabase.from('part_supersessions').select('new_oem_number').eq('old_oem_number', cleanOem).limit(1),
        supabase.from('part_supersessions').select('old_oem_number').eq('new_oem_number', cleanOem).limit(1),
      ]);

      const supersededByOem = supersededBy?.[0]?.new_oem_number || null;
      const supersedesOem = supersedes?.[0]?.old_oem_number || null;

      if (cached?.last_price_update && mode !== 'force') {
        const hoursAgo = (Date.now() - new Date(cached.last_price_update).getTime()) / 36e5;
        if (hoursAgo < 24 || cached.price_locked) {
          results.push({
            oem_number: cleanOem, name: cached.name,
            price_without_vat: cached.price_without_vat, price_with_vat: cached.price_with_vat,
            found: true, cached: true, search_code: searchVariants[0],
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

      // --- Search Mopar catalog ---
      let moparResult = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, category: '', family: '', segment: '', packaging: '' };
      let usedSearchCode = searchVariants[0];
      if (session.loggedIn) {
        for (const variant of searchVariants) {
          try {
            const searchStart = Date.now();
            moparResult = await searchCatalog(session, variant, cleanOem);
            diagnostics.mopar.responseTime = Math.max(diagnostics.mopar.responseTime, Date.now() - searchStart);
            usedSearchCode = variant;
            if (moparResult.found) break;
          } catch (err) { console.error('Mopar search failed:', err); }
        }
      }

      // --- Search AutoKelly ---
      let akResult: { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } = {
        found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown',
      };
      if (akSession.loggedIn) {
        try {
          const akStart = Date.now();
          akResult = await searchAutoKelly(akSession, cleanOem);
          diagnostics.autokelly.responseTime = Math.max(diagnostics.autokelly.responseTime, Date.now() - akStart);
          console.log(`AutoKelly search ${cleanOem}: found=${akResult.found}, name=${akResult.name}, price=${akResult.price_with_vat}`);
        } catch (err) { console.error('AutoKelly search failed:', err); }
      }

      // Save Mopar result to DB
      if (moparResult.found) {
        const partData: any = {
          name: moparResult.name || `Díl ${cleanOem}`,
          price_without_vat: moparResult.price_without_vat,
          price_with_vat: moparResult.price_with_vat,
          last_price_update: new Date().toISOString(),
          catalog_source: 'mopar',
          availability: 'available',
        };
        if (moparResult.category) partData.category = moparResult.category;
        if (moparResult.family) partData.family = moparResult.family;
        if (moparResult.segment) partData.segment = moparResult.segment;
        if (moparResult.packaging) partData.packaging = moparResult.packaging;

        if (cached) {
          if (cached.price_without_vat !== moparResult.price_without_vat && !cached.price_locked) {
            await supabase.from('price_history').insert({
              part_id: cached.id, old_price_without_vat: cached.price_without_vat,
              new_price_without_vat: moparResult.price_without_vat, old_price_with_vat: cached.price_with_vat,
              new_price_with_vat: moparResult.price_with_vat, source: 'catalog-search',
            });
          }
          if (!cached.price_locked) {
            await supabase.from('parts_new').update(partData).eq('id', cached.id);
          }
        } else {
          await supabase.from('parts_new').insert({ oem_number: cleanOem, ...partData });
        }
      }

      // Save AutoKelly result as separate entry (source: autokelly)
      if (akResult.found && akResult.manufacturer?.toLowerCase() !== 'starline') {
        const akOemKey = `AK-${cleanOem}`;
        const { data: akCached } = await supabase
          .from('parts_new')
          .select('id')
          .eq('oem_number', akOemKey)
          .eq('catalog_source', 'autokelly')
          .maybeSingle();

        const akPartData = {
          oem_number: akOemKey,
          name: akResult.name || `Díl ${cleanOem}`,
          price_without_vat: akResult.price_without_vat,
          price_with_vat: akResult.price_with_vat,
          last_price_update: new Date().toISOString(),
          catalog_source: 'autokelly',
          manufacturer: akResult.manufacturer || 'AutoKelly',
          availability: akResult.availability || 'available',
          description: `Alternativa k OEM ${cleanOem}`,
        };

        if (akCached) {
          await supabase.from('parts_new').update(akPartData).eq('id', akCached.id);
        } else {
          await supabase.from('parts_new').insert(akPartData);
        }
      }

      // Build primary result (Mopar)
      results.push({
        oem_number: cleanOem,
        name: moparResult.found ? (moparResult.name || `Díl ${cleanOem}`) : (cached?.name || `Díl ${cleanOem}`),
        price_without_vat: moparResult.found ? moparResult.price_without_vat : (cached?.price_without_vat || 0),
        price_with_vat: moparResult.found ? moparResult.price_with_vat : (cached?.price_with_vat || 0),
        found: moparResult.found || !!cached,
        cached: false, search_code: usedSearchCode,
        catalog_source: 'mopar',
        category: moparResult.category || cached?.category || null,
        family: moparResult.family || cached?.family || null,
        segment: moparResult.segment || cached?.segment || null,
        packaging: moparResult.packaging || cached?.packaging || null,
        description: cached?.description || null,
        manufacturer: cached?.manufacturer || 'Mopar',
        availability: moparResult.found ? 'available' : (cached?.availability || 'unknown'),
        compatible_vehicles: cached?.compatible_vehicles || null,
        superseded_by: supersededByOem, supersedes: supersedesOem,
      });

      // Add AutoKelly alternative result
      if (akResult.found && akResult.manufacturer?.toLowerCase() !== 'starline') {
        results.push({
          oem_number: cleanOem,
          name: akResult.name || `Díl ${cleanOem} (alternativa)`,
          price_without_vat: akResult.price_without_vat,
          price_with_vat: akResult.price_with_vat,
          found: true, cached: false, search_code: cleanOem,
          catalog_source: 'autokelly',
          category: moparResult.category || cached?.category || null,
          family: null, segment: null, packaging: null,
          description: `Aftermarket alternativa k OEM ${cleanOem}`,
          manufacturer: akResult.manufacturer || 'AutoKelly',
          availability: akResult.availability || 'available',
          compatible_vehicles: cached?.compatible_vehicles || null,
          superseded_by: null, supersedes: null,
        });
      }
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

// ===== Cookie helpers =====

function collectCookies(resp: Response, jar: Record<string, string>) {
  for (const c of resp.headers.getSetCookie?.() || []) {
    const parts = c.split(';')[0].split('=');
    if (parts.length >= 2) jar[parts[0].trim()] = parts.slice(1).join('=').trim();
  }
}

function cookieHeader(jar: Record<string, string>): string {
  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ===== Mopar catalog =====

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
  const html = await resp.text();
  const textOnly = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  console.log(`Mopar search ${searchCode}: HTML length=${html.length}, text snippet="${textOnly.substring(0, 300)}"`);
  return parseSearchResult(html, oem);
}

function parseSearchResult(html: string, oem: string): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; category: string; family: string; segment: string; packaging: string } {
  const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

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

// ===== AutoKelly =====

async function loginToAutoKelly(email: string, pass: string): Promise<Session> {
  const cookies: Record<string, string> = {};
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'cs-CZ,cs;q=0.9',
  };

  try {
    // 1. GET login page to collect initial cookies
    const initResp = await fetch(`${AK_BASE}/Account/Login`, { headers, redirect: 'manual' });
    collectCookies(initResp, cookies);
    const initHtml = await initResp.text();

    // Extract __RequestVerificationToken from the HTML form
    const tokenMatch = initHtml.match(/name="__RequestVerificationToken"[^>]*value="([^"]+)"/);
    const verificationToken = tokenMatch?.[1] || '';

    // 2. POST login credentials
    const loginBody = new URLSearchParams({
      UserName: email,
      Password: pass,
      ...(verificationToken ? { __RequestVerificationToken: verificationToken } : {}),
    });

    const loginResp = await fetch(`${AK_BASE}/Account/Login`, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookieHeader(cookies),
        'Origin': AK_BASE,
        'Referer': `${AK_BASE}/Account/Login`,
      },
      body: loginBody.toString(),
      redirect: 'manual',
    });
    collectCookies(loginResp, cookies);
    await loginResp.text();

    // Follow redirect if 302
    if (loginResp.status === 302 || loginResp.status === 301) {
      const location = loginResp.headers.get('Location');
      if (location) {
        const redirectUrl = location.startsWith('http') ? location : `${AK_BASE}${location}`;
        const rResp = await fetch(redirectUrl, {
          headers: { ...headers, 'Cookie': cookieHeader(cookies) },
          redirect: 'manual',
        });
        collectCookies(rResp, cookies);
        await rResp.text();
      }
      // If redirected away from login, consider logged in
      const loc = loginResp.headers.get('Location') || '';
      if (!loc.includes('Login') && !loc.includes('Account')) {
        return { loggedIn: true, cookies };
      }
    }

    // Check if we're still on login page
    const checkResp = await fetch(`${AK_BASE}/HomePage/Car`, {
      headers: { ...headers, 'Cookie': cookieHeader(cookies) },
      redirect: 'manual',
    });
    collectCookies(checkResp, cookies);
    const checkHtml = await checkResp.text();

    // If we see the search form and not the login prompt, we're in
    const isLoggedIn = !checkHtml.includes('Account/Login') || checkHtml.includes('Odhlásit');
    return { loggedIn: isLoggedIn, cookies };
  } catch (err) {
    console.error('AutoKelly login error:', err);
    return { loggedIn: false, cookies };
  }
}

async function searchAutoKelly(
  session: Session,
  oemCode: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string }> {
  const headers = {
    'User-Agent': UA,
    'Accept': 'application/json, text/html, */*',
    'Accept-Language': 'cs-CZ,cs;q=0.9',
    'Cookie': cookieHeader(session.cookies),
    'Referer': `${AK_BASE}/HomePage/Car`,
    'X-Requested-With': 'XMLHttpRequest',
  };

  try {
    // Try the quick search AJAX endpoint first
    const quickSearchUrl = `${AK_BASE}/Search/QuickSearch?query=${encodeURIComponent(oemCode)}`;
    const qsResp = await fetch(quickSearchUrl, { headers });
    const qsText = await qsResp.text();
    console.log(`AutoKelly QuickSearch ${oemCode}: status=${qsResp.status}, length=${qsText.length}, snippet="${qsText.substring(0, 300)}"`);

    // Try to parse as JSON first
    try {
      const json = JSON.parse(qsText);
      if (json && (json.Products || json.products || json.Items || json.items || Array.isArray(json))) {
        const items = json.Products || json.products || json.Items || json.items || json;
        if (Array.isArray(items) && items.length > 0) {
          const first = items[0];
          return {
            found: true,
            name: first.Name || first.name || first.ProductName || `Díl ${oemCode}`,
            price_without_vat: first.PriceWithoutVat || first.priceWithoutVat || first.Price || 0,
            price_with_vat: first.PriceWithVat || first.priceWithVat || first.PriceVat || 0,
            manufacturer: first.Manufacturer || first.manufacturer || first.Brand || '',
            availability: first.Available || first.InStock ? 'available' : 'unknown',
          };
        }
      }
    } catch { /* not JSON, try HTML */ }

    // Parse as HTML
    const akResult = parseAutoKellyHTML(qsText, oemCode);
    if (akResult.found) return akResult;

    // Fallback: try full search result page
    const searchUrl = `${AK_BASE}/Search/ResultList?searchText=${encodeURIComponent(oemCode)}`;
    const sResp = await fetch(searchUrl, { headers: { ...headers, 'Accept': 'text/html,*/*' } });
    const sHtml = await sResp.text();
    console.log(`AutoKelly ResultList ${oemCode}: status=${sResp.status}, length=${sHtml.length}`);

    return parseAutoKellyHTML(sHtml, oemCode);
  } catch (err) {
    console.error('AutoKelly search error:', err);
    return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  }
}

function parseAutoKellyHTML(
  html: string,
  oemCode: string
): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } {
  const cleanHtml = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');

  // Look for product items with price
  // AutoKelly typically shows: product name, manufacturer, price with/without DPH

  // Try to find product name
  let name = '';
  const nameMatch = cleanHtml.match(/class="[^"]*product[_-]?name[^"]*"[^>]*>([^<]+)/i)
    || cleanHtml.match(/class="[^"]*item[_-]?name[^"]*"[^>]*>([^<]+)/i)
    || cleanHtml.match(/class="[^"]*title[^"]*"[^>]*>([^<]+)/i);
  if (nameMatch) name = nameMatch[1].trim();

  // Try to find manufacturer
  let manufacturer = '';
  const mfrMatch = cleanHtml.match(/class="[^"]*brand[^"]*"[^>]*>([^<]+)/i)
    || cleanHtml.match(/class="[^"]*manufacturer[^"]*"[^>]*>([^<]+)/i);
  if (mfrMatch) manufacturer = mfrMatch[1].trim();

  // Find prices
  const text = cleanHtml.replace(/<[^>]+>/g, ' ');
  const prices: number[] = [];
  const priceRegex = /(\d[\d\s]*[,.]?\d*)\s*Kč/gi;
  let pm;
  while ((pm = priceRegex.exec(text)) !== null) {
    const v = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 0 && v < 500000) prices.push(v);
  }

  // Also try "bez DPH" / "s DPH" pattern
  let priceWithoutVat = 0;
  let priceWithVat = 0;
  const bezDphMatch = text.match(/(\d[\d\s]*[,.]?\d*)\s*Kč\s*bez\s*DPH/i);
  const sDphMatch = text.match(/(\d[\d\s]*[,.]?\d*)\s*Kč\s*s\s*DPH/i)
    || text.match(/s\s*DPH\s*(\d[\d\s]*[,.]?\d*)\s*Kč/i);

  if (bezDphMatch) priceWithoutVat = parseFloat(bezDphMatch[1].replace(/\s/g, '').replace(',', '.'));
  if (sDphMatch) priceWithVat = parseFloat(sDphMatch[1].replace(/\s/g, '').replace(',', '.'));

  // Fallback to generic prices
  if (priceWithoutVat === 0 && priceWithVat === 0 && prices.length > 0) {
    if (prices.length >= 2) {
      // Usually smaller is bez DPH, larger is s DPH
      priceWithoutVat = Math.min(prices[0], prices[1]);
      priceWithVat = Math.max(prices[0], prices[1]);
    } else {
      priceWithVat = prices[0];
      priceWithoutVat = Math.round(prices[0] / 1.21 * 100) / 100;
    }
  }

  // Calculate missing price
  if (priceWithoutVat > 0 && priceWithVat === 0) {
    priceWithVat = Math.round(priceWithoutVat * 1.21 * 100) / 100;
  }
  if (priceWithVat > 0 && priceWithoutVat === 0) {
    priceWithoutVat = Math.round(priceWithVat / 1.21 * 100) / 100;
  }

  // Check availability
  const isAvailable = text.toLowerCase().includes('skladem') || text.toLowerCase().includes('k dispozici');

  if (priceWithVat > 0 || name) {
    return {
      found: true,
      name: name || `Díl ${oemCode}`,
      price_without_vat: priceWithoutVat,
      price_with_vat: priceWithVat,
      manufacturer,
      availability: isAvailable ? 'available' : 'on_order',
    };
  }

  return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
}
