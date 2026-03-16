const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const AK_BASE = 'https://www.lkq.cz';
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

    // AutoKelly/LKQ credentials
    const akEmail = Deno.env.get('AUTOKELLY_EMAIL') || '';
    const akPass = Deno.env.get('AUTOKELLY_PASS') || '';
    let akSession: Session = { loggedIn: false, cookies: {} };
    if (akEmail && akPass) {
      const akStart = Date.now();
      akSession = await loginToAutoKelly(akEmail, akPass);
      diagnostics.autokelly.responseTime = Date.now() - akStart;
      diagnostics.autokelly.status = akSession.loggedIn ? 'ok' : 'login_failed';
      console.log('AutoKelly/LKQ login:', akSession.loggedIn, 'in', diagnostics.autokelly.responseTime, 'ms');
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
  _session: Session,
  oemCode: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string }> {
  const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');
  const akEmail = Deno.env.get('AUTOKELLY_EMAIL') || '';
  const akPass = Deno.env.get('AUTOKELLY_PASS') || '';
  
  if (!firecrawlKey) {
    console.log('AutoKelly: No Firecrawl key, skipping');
    return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  }

  try {
    // Use Firecrawl with actions: executeJavascript to login + navigate + extract
    const fcResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `${AK_BASE}/Account/Login`,
        formats: ['markdown'],
        waitFor: 2000,
        timeout: 20000,
        actions: [
          { type: 'wait', milliseconds: 1000 },
          {
            type: 'executeJavascript',
            script: `
              const u = document.querySelector('input[name="UserName"], #UserName');
              const p = document.querySelector('input[name="Password"], #Password');
              if (u) u.value = '${akEmail}';
              if (p) p.value = '${akPass}';
              const f = u?.closest('form');
              if (f) f.submit();
            `
          },
          { type: 'wait', milliseconds: 3000 },
          { 
            type: 'executeJavascript', 
            script: `window.location.href = 'https://www.lkq.cz/Catalog/Car?searchText=${encodeURIComponent(oemCode)}';`
          },
          { type: 'wait', milliseconds: 5000 },
          { type: 'scrape' },
        ],
      }),
    });
    
    const fcData = await fcResp.json();
    
    if (!fcResp.ok) {
      console.error('AutoKelly Firecrawl error:', JSON.stringify(fcData).substring(0, 500));
      return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
    }

    const markdown = fcData.data?.markdown || fcData.markdown || '';
    const html = fcData.data?.html || '';
    console.log(`AutoKelly Firecrawl ${oemCode}: markdown_len=${markdown.length}`);
    console.log(`AutoKelly Firecrawl markdown preview: "${markdown.substring(0, 1000)}"`);
    
    if (markdown.length > 50) {
      const result = parseAutoKellyMarkdown(markdown, oemCode);
      if (result.found) {
        console.log(`AutoKelly found: ${result.name}, ${result.manufacturer}, ${result.price_with_vat} Kč`);
        return result;
      }
    }

    return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  } catch (err) {
    console.error('AutoKelly search error:', err);
    return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  }
}

function extractFromAutoKellyJSON(
  json: any,
  oemCode: string
): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } {
  // Try various JSON structures AutoKelly might use
  const items = json.Products || json.products || json.Items || json.items || json.Data || json.data || 
                json.SearchResults || json.searchResults || json.Result || json.result ||
                (Array.isArray(json) ? json : null);
  
  if (Array.isArray(items) && items.length > 0) {
    const first = items[0];
    const priceWithVat = first.PriceWithVat || first.priceWithVat || first.PriceVat || first.Price || first.price || 0;
    const priceWithoutVat = first.PriceWithoutVat || first.priceWithoutVat || first.PriceNet || 
                            (priceWithVat > 0 ? Math.round(priceWithVat / 1.21 * 100) / 100 : 0);
    return {
      found: true,
      name: first.Name || first.name || first.ProductName || first.Text || first.Description || `Díl ${oemCode}`,
      price_without_vat: priceWithoutVat,
      price_with_vat: priceWithVat,
      manufacturer: first.Manufacturer || first.manufacturer || first.Brand || first.Producer || '',
      availability: (first.Available || first.InStock || first.IsAvailable) ? 'available' : 'on_order',
    };
  }

  // Single object result
  if (json.Name || json.ProductName || json.Price || json.PriceWithVat) {
    const priceWithVat = json.PriceWithVat || json.Price || 0;
    return {
      found: true,
      name: json.Name || json.ProductName || `Díl ${oemCode}`,
      price_without_vat: json.PriceWithoutVat || Math.round(priceWithVat / 1.21 * 100) / 100,
      price_with_vat: priceWithVat,
      manufacturer: json.Manufacturer || json.Brand || '',
      availability: json.Available ? 'available' : 'on_order',
    };
  }

  return { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
}

function parseAutoKellyMarkdown(
  markdown: string,
  oemCode: string
): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } {
  // Extract prices from rendered markdown
  const prices: number[] = [];
  const priceRegex = /(\d[\d\s]*[,.]?\d*)\s*Kč/gi;
  let pm;
  while ((pm = priceRegex.exec(markdown)) !== null) {
    const v = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 0 && v < 500000) prices.push(v);
  }

  // Extract product name - look for lines near the OEM code
  let name = '';
  const lines = markdown.split('\n').filter(l => l.trim().length > 3);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(oemCode) || lines[i].match(/brzdov|filtr|olej|svíčk|řemen|ložisk|čerpadl|tlumič/i)) {
      name = lines[i].replace(/[|*#]/g, '').trim().substring(0, 100);
      break;
    }
  }

  // Extract manufacturer
  let manufacturer = '';
  const mfrPatterns = ['TRW', 'BREMBO', 'BOSCH', 'MANN', 'MAHLE', 'FEBI', 'SACHS', 'LEMFÖRDER', 'MEYLE', 'GATES', 'DAYCO', 'SKF', 'FAG', 'SNR', 'LUK', 'VALEO', 'DELPHI', 'ATE', 'TEXTAR', 'FERODO', 'JURID', 'NGK', 'DENSO', 'HELLA', 'OSRAM', 'PHILIPS'];
  for (const mfr of mfrPatterns) {
    if (markdown.toUpperCase().includes(mfr)) {
      manufacturer = mfr;
      break;
    }
  }

  if (prices.length > 0) {
    let priceWithVat = 0, priceWithoutVat = 0;
    if (prices.length >= 2) {
      priceWithoutVat = Math.min(prices[0], prices[1]);
      priceWithVat = Math.max(prices[0], prices[1]);
    } else {
      priceWithVat = prices[0];
      priceWithoutVat = Math.round(prices[0] / 1.21 * 100) / 100;
    }
    
    const isAvailable = markdown.toLowerCase().includes('skladem');
    
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

// Old parseAutoKellyHTML removed - replaced by extractFromAutoKellyJSON and parseAutoKellyMarkdown above
