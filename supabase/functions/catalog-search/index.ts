const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const SAG_BASE = 'https://connect-int.sag.services/sag-cz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAG_MARGIN = 0.15; // 15% margin

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
      sag: { status: 'disabled', responseTime: 0 },
    };

    // Login to Mopar catalog
    const loginStart = Date.now();
    const session = await loginToCatalog(password);
    diagnostics.mopar.responseTime = Date.now() - loginStart;
    diagnostics.mopar.status = session.loggedIn ? 'ok' : 'login_failed';
    console.log('Mopar login:', session.loggedIn, 'in', diagnostics.mopar.responseTime, 'ms');

    // SAG Connect credentials
    const sagUser = Deno.env.get('SAG_USERNAME') || '';
    const sagPass = Deno.env.get('SAG_PASSWORD') || '';
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY') || '';
    const sagEnabled = !!(sagUser && sagPass && FIRECRAWL_API_KEY);
    if (sagEnabled) {
      diagnostics.sag.status = 'ok';
      console.log('SAG Connect enabled');
    } else {
      console.log('SAG Connect disabled (missing credentials or Firecrawl key)');
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

      // --- Search SAG Connect ---
      let sagResult: { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } = {
        found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown',
      };
      if (sagEnabled) {
        try {
          const sagStart = Date.now();
          sagResult = await searchSAG(sagUser, sagPass, FIRECRAWL_API_KEY, cleanOem);
          diagnostics.sag.responseTime = Math.max(diagnostics.sag.responseTime, Date.now() - sagStart);
          console.log(`SAG search ${cleanOem}: found=${sagResult.found}, name=${sagResult.name}, price=${sagResult.price_with_vat}`);
        } catch (err) { console.error('SAG search failed:', err); }
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

      // Save SAG result as separate entry (source: sag)
      if (sagResult.found) {
        const sagOemKey = `SAG-${cleanOem}`;
        const { data: sagCached } = await supabase
          .from('parts_new')
          .select('id')
          .eq('oem_number', sagOemKey)
          .eq('catalog_source', 'sag')
          .maybeSingle();

        const sagPartData = {
          oem_number: sagOemKey,
          name: sagResult.name || `Díl ${cleanOem}`,
          price_without_vat: sagResult.price_without_vat,
          price_with_vat: sagResult.price_with_vat,
          last_price_update: new Date().toISOString(),
          catalog_source: 'sag',
          manufacturer: sagResult.manufacturer || 'SAG',
          availability: sagResult.availability || 'available',
          description: `Alternativa k OEM ${cleanOem} (SAG Connect)`,
        };

        if (sagCached) {
          await supabase.from('parts_new').update(sagPartData).eq('id', sagCached.id);
        } else {
          await supabase.from('parts_new').insert(sagPartData);
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

      // Add SAG alternative result
      if (sagResult.found) {
        results.push({
          oem_number: cleanOem,
          name: sagResult.name || `Díl ${cleanOem} (SAG)`,
          price_without_vat: sagResult.price_without_vat,
          price_with_vat: sagResult.price_with_vat,
          found: true, cached: false, search_code: cleanOem,
          catalog_source: 'sag',
          category: moparResult.category || cached?.category || null,
          family: null, segment: null, packaging: null,
          description: `Aftermarket alternativa k OEM ${cleanOem} (SAG Connect)`,
          manufacturer: sagResult.manufacturer || 'SAG',
          availability: sagResult.availability || 'available',
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

// ===== SAG Connect via Firecrawl =====

async function searchSAG(
  username: string,
  password: string,
  firecrawlKey: string,
  oemCode: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string }> {
  const empty = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  try {
    console.log(`SAG: search ${oemCode}`);

    // Start at login page, login, then search from homepage
    const fcResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: `https://connect-int.sag.services/sag-cz/login`,
        formats: ['markdown'],
        waitFor: 3000,
        onlyMainContent: false,
        timeout: 45000,
        actions: [
          { type: 'wait', milliseconds: 2000 },
          // Login form - username is first text input
          { type: 'click', selector: 'input[type="text"]' },
          { type: 'write', text: username },
          { type: 'click', selector: 'input[type="password"]' },
          { type: 'write', text: password },
          { type: 'press', key: 'ENTER' },
          { type: 'wait', milliseconds: 5000 },
          // Now on homepage. Search input might not have type="text" explicitly
          // Try broader selector: any input not password/hidden/checkbox
          { type: 'click', selector: 'input:not([type="password"]):not([type="hidden"]):not([type="checkbox"]):not([type="radio"])' },
          { type: 'write', text: oemCode },
          { type: 'wait', milliseconds: 500 },
          { type: 'press', key: 'ENTER' },
          { type: 'wait', milliseconds: 5000 },
          { type: 'scrape' },
        ],
      }),
    });

    const fcData = await fcResp.json();
    if (!fcResp.ok) {
      console.error(`SAG error: ${fcResp.status}`, JSON.stringify(fcData).substring(0, 400));
      return empty;
    }

    const markdown = fcData?.data?.markdown || fcData?.markdown || '';
    console.log(`SAG result: ${markdown.length} chars`);
    console.log(`SAG snippet: "${markdown.substring(0, 800)}"`);

    if (markdown.includes('Kč') || markdown.includes('CZK') || markdown.includes('košík') || markdown.includes('položk')) {
      const parsed = parseSAGMarkdown(markdown, oemCode);
      if (parsed.found) {
        console.log(`SAG found: ${parsed.name}, price=${parsed.price_with_vat}`);
        return parsed;
      }
    }

    if (markdown.includes('Přihlásit')) {
      console.log('SAG: still on login page');
    } else {
      console.log('SAG: no pricing data found');
    }

    return empty;
  } catch (err) {
    console.error('SAG error:', err);
    return empty;
  }
}

function parseSAGMarkdown(
  markdown: string,
  oemCode: string
): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } {
  const prices: number[] = [];
  const priceRegex = /(\d[\d\s]*[,.]?\d*)\s*(Kč|CZK|,-)/gi;
  let pm;
  while ((pm = priceRegex.exec(markdown)) !== null) {
    const v = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 0 && v < 500000) prices.push(v);
  }

  const priceRegex2 = /(?:cena|price|moc|nákup)\s*:?\s*(\d[\d\s]*[,.]?\d*)/gi;
  while ((pm = priceRegex2.exec(markdown)) !== null) {
    const v = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 0 && v < 500000 && !prices.includes(v)) prices.push(v);
  }

  let name = '';
  const lines = markdown.split('\n').filter(l => l.trim().length > 3);
  for (const line of lines) {
    const clean = line.replace(/[|*#\[\]]/g, '').trim();
    if (clean.includes(oemCode) || clean.match(/brzdov|filtr|olej|svíčk|řemen|ložisk|čerpadl|tlumič|destičk|kotouč|hadice|senzor|snímač|lambda|termostat|chladič|ventil|pružin|rameno|tyč|kulový|stabilizátor|těsnění|palivov|vzduchov|kabinov/i)) {
      name = clean.substring(0, 120);
      break;
    }
  }

  let manufacturer = '';
  const mfrPatterns = ['TRW', 'BREMBO', 'BOSCH', 'MANN', 'MAHLE', 'FEBI', 'SACHS', 'LEMFÖRDER', 'MEYLE', 'GATES', 'DAYCO', 'SKF', 'FAG', 'SNR', 'LUK', 'VALEO', 'DELPHI', 'ATE', 'TEXTAR', 'FERODO', 'NGK', 'DENSO', 'HELLA', 'RIDEX', 'OPTIMAL', 'ZIMMERMANN', 'BLUE PRINT', 'ELRING', 'CORTECO', 'CONTITECH', 'INA', 'SWAG', 'TOPRAN', 'FILTRON', 'PURFLUX', 'KNECHT', 'HENGST', 'WIX'];
  for (const mfr of mfrPatterns) {
    if (markdown.toUpperCase().includes(mfr)) { manufacturer = mfr; break; }
  }

  if (prices.length > 0) {
    let basePrice = prices.length >= 2 ? Math.min(...prices.slice(0, 3)) : prices[0];
    const priceWithoutVat = Math.round(basePrice * (1 + SAG_MARGIN) * 100) / 100;
    const priceWithVat = Math.round(priceWithoutVat * 1.21 * 100) / 100;
    const isAvailable = /skladem|dostupn|\d+\s*ks/i.test(markdown);

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
