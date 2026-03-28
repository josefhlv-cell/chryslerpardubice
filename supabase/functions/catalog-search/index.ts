const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CATALOG_URL = 'https://www.vernostsevyplaci.cz/cnd/';
const SAG_BASE = 'https://connect-int.sag.services/sag-cz';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const SAG_MARGIN = 0.15; // 15% margin
const AK_MARGIN = 0.15; // 15% margin for AutoKelly

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
    // Auth check - require authenticated user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const { createClient: createAuthClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const authClient = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: authHeader } } });
    const { data: claimsData, error: claimsError } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (claimsError || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
    const diagnostics: any = {
      mopar: { status: 'ok', responseTime: 0 },
      sag: { status: 'disabled', responseTime: 0 },
      autokelly: { status: 'disabled', responseTime: 0 },
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

    // AutoKelly credentials
    const akEmail = Deno.env.get('AUTOKELLY_EMAIL') || '';
    const akPass = Deno.env.get('AUTOKELLY_PASS') || '';
    const akEnabled = !!(akEmail && akPass && FIRECRAWL_API_KEY);
    if (akEnabled) {
      diagnostics.autokelly.status = 'ok';
      console.log('AutoKelly enabled');
    } else {
      console.log('AutoKelly disabled (missing credentials or Firecrawl key)');
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

          // Still check for cached SAG and AutoKelly alternatives
          const { data: altCached } = await supabase
            .from('parts_new')
            .select('id, oem_number, name, price_without_vat, price_with_vat, catalog_source, manufacturer, availability, description')
            .in('oem_number', [`SAG-${cleanOem}`, `AK-${cleanOem}`])
            .gt('price_with_vat', 0);

          if (altCached) {
            for (const alt of altCached) {
              results.push({
                oem_number: cleanOem,
                name: alt.name,
                price_without_vat: alt.price_without_vat,
                price_with_vat: alt.price_with_vat,
                found: true, cached: true, search_code: cleanOem,
                catalog_source: alt.catalog_source || 'sag',
                category: cached.category, family: null, segment: null, packaging: null,
                description: alt.description,
                manufacturer: alt.manufacturer || (alt.catalog_source === 'autokelly' ? 'AutoKelly' : 'SAG'),
                availability: alt.availability || 'available',
                compatible_vehicles: cached.compatible_vehicles,
                superseded_by: null, supersedes: null,
              });
            }
          }

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

      // --- Look up cross-reference part numbers for aftermarket search ---
      const { data: crossRefs } = await supabase
        .from('part_crossref')
        .select('part_number, manufacturer')
        .eq('oem_number', cleanOem);

      const altSearchCodes = crossRefs?.map(cr => cr.part_number) || [];
      // Use first cross-ref code (best match), then OEM as fallback
      const bestAltCode = altSearchCodes[0] || cleanOem;
      console.log(`Cross-refs for ${cleanOem}: ${altSearchCodes.length} found — ${altSearchCodes.slice(0, 5).join(', ')}. Using: ${bestAltCode}`);

      // --- Search SAG + AutoKelly in parallel with best cross-ref code ---
      let sagResult: { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } = {
        found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown',
      };
      let akResult: { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } = {
        found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown',
      };

      const altPromises: Promise<void>[] = [];

      if (sagEnabled) {
        altPromises.push((async () => {
          try {
            const sagStart = Date.now();
            sagResult = await searchSAG(sagUser, sagPass, FIRECRAWL_API_KEY, bestAltCode);
            diagnostics.sag.responseTime = Math.max(diagnostics.sag.responseTime, Date.now() - sagStart);
            if (sagResult.found) {
              console.log(`SAG found ${bestAltCode} (OEM: ${cleanOem}): ${sagResult.name}, ${sagResult.price_with_vat} Kč`);
            }
          } catch (err) { console.error('SAG search failed:', err); }
        })());
      }

      if (akEnabled) {
        altPromises.push((async () => {
          try {
            const akStart = Date.now();
            akResult = await searchAutoKelly(akEmail, akPass, FIRECRAWL_API_KEY, bestAltCode);
            diagnostics.autokelly.responseTime = Math.max(diagnostics.autokelly.responseTime, Date.now() - akStart);
            if (akResult.found) {
              console.log(`AutoKelly found ${bestAltCode} (OEM: ${cleanOem}): ${akResult.name}, ${akResult.price_with_vat} Kč`);
            }
          } catch (err) { console.error('AutoKelly search failed:', err); }
        })());
      }

      await Promise.all(altPromises);

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

      // Save SAG result as separate entry (source: sag) — only if price is valid
      if (sagResult.found && sagResult.price_with_vat > 0) {
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

      // Save AutoKelly result as separate entry (source: autokelly) — only if price is valid
      if (akResult.found && akResult.price_with_vat > 0) {
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
          description: `Alternativa k OEM ${cleanOem} (AutoKelly)`,
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

      // Add SAG alternative result — only with valid price
      if (sagResult.found && sagResult.price_with_vat > 0) {
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

      // Add AutoKelly alternative result — only with valid price
      if (akResult.found && akResult.price_with_vat > 0) {
        results.push({
          oem_number: cleanOem,
          name: akResult.name || `Díl ${cleanOem} (AutoKelly)`,
          price_without_vat: akResult.price_without_vat,
          price_with_vat: akResult.price_with_vat,
          found: true, cached: false, search_code: cleanOem,
          catalog_source: 'autokelly',
          category: moparResult.category || cached?.category || null,
          family: null, segment: null, packaging: null,
          description: `Aftermarket alternativa k OEM ${cleanOem} (AutoKelly)`,
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

// ===== SAG Connect via Firecrawl =====

async function searchSAG(
  username: string,
  password: string,
  firecrawlKey: string,
  oemCode: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string }> {
  const empty = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  try {
    console.log(`SAG: searching ${oemCode} via Firecrawl (navigate strategy)`);

    const searchUrl = `https://connect-int.sag.services/sag-cz/article/result?type=ARTICLES&keywords=${encodeURIComponent(oemCode)}`;

    const fcResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: 'https://connect-int.sag.services/sag-cz/login',
        formats: ['markdown', 'screenshot'],
        waitFor: 8000,
        onlyMainContent: false,
        timeout: 60000,
        actions: [
          { type: 'wait', milliseconds: 4000 },
          {
            type: 'executeJavascript',
            script: `
              (function() {
                const inputs = document.querySelectorAll('input');
                let userInput = null, passInput = null;
                for (const inp of inputs) {
                  const t = (inp.type || '').toLowerCase();
                  if (t === 'password') { passInput = inp; }
                  else if (t === 'text' || t === 'email') { if (!userInput) userInput = inp; }
                }
                if (!userInput && inputs.length >= 2) { userInput = inputs[0]; passInput = inputs[1]; }
                
                function setVal(el, val) {
                  if (!el) return;
                  el.focus();
                  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                  nativeSetter.call(el, val);
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                }
                
                if (userInput) setVal(userInput, '${username}');
                if (passInput) setVal(passInput, '${password}');
                
                setTimeout(() => {
                  const btns = document.querySelectorAll('button');
                  for (const btn of btns) {
                    const txt = (btn.textContent || '').toLowerCase();
                    if (txt.includes('přihlásit') || txt.includes('login') || btn.type === 'submit') {
                      btn.click();
                      break;
                    }
                  }
                  const form = document.querySelector('form');
                  if (form) form.dispatchEvent(new Event('submit', { bubbles: true }));
                }, 500);
                
                document.title = 'FILLED:user=' + !!userInput + ',pass=' + !!passInput + ',inputs=' + inputs.length;
              })();
            `
          },
          { type: 'wait', milliseconds: 10000 },
          {
            type: 'executeJavascript',
            script: `
              document.title = 'PRE_NAV:' + window.location.href;
              window.location.href = '${searchUrl}';
            `
          },
          { type: 'wait', milliseconds: 12000 },
          { type: 'scrape' },
        ],
      }),
    });

    const fcData = await fcResp.json();
    if (!fcResp.ok) {
      console.error('SAG Firecrawl error:', JSON.stringify(fcData).substring(0, 500));
      return empty;
    }

    const markdown = fcData?.data?.markdown || fcData?.markdown || '';
    const html = fcData?.data?.html || fcData?.html || '';
    const screenshot = fcData?.data?.screenshot || fcData?.screenshot || '';
    console.log(`SAG Firecrawl result: markdown=${markdown.length} chars, html=${html.length} chars, screenshot=${screenshot ? 'yes' : 'no'}`);
    console.log(`SAG markdown (first 1500): ${markdown.substring(0, 1500)}`);

    const hasLoginForm = (markdown.includes('Přihlásit se') || markdown.includes('Přihlášení')) && !markdown.includes('Ahoj,') && !markdown.includes('Výsledky vyhledávání') && !markdown.includes('Výsledků:');
    if (hasLoginForm) {
      console.log('SAG: Still on login page, authentication failed');
      return empty;
    }

    if (markdown.includes('Výsledků: 0') || markdown.includes('Žádné odpovídající položky')) {
      console.log(`SAG: No results for ${oemCode} in SAG catalog`);
      return empty;
    }

    return parseSAGResults(markdown, html, oemCode);
  } catch (err) {
    console.error('SAG search error:', err);
    return empty;
  }
}

function parseSAGResults(
  markdown: string,
  html: string,
  oemCode: string
): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } {
  const empty = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };

  const pricesFromHtml: number[] = [];
  const htmlPriceRegex = /(\d[\d\s]*[,.]?\d{0,2})\s*(?:Kč|CZK|,-)/gi;
  let hm;
  while ((hm = htmlPriceRegex.exec(html)) !== null) {
    const v = parseFloat(hm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 1 && v < 500000) pricesFromHtml.push(v);
  }

  const pricesFromMd: number[] = [];
  const mdPriceRegex = /(\d[\d\s]*[,.]?\d{0,2})\s*(?:Kč|CZK|,-)/gi;
  while ((hm = mdPriceRegex.exec(markdown)) !== null) {
    const v = parseFloat(hm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 1 && v < 500000) pricesFromMd.push(v);
  }

  const rangeRegex = /(\d{2,6})\s*-\s*[A-Z]/g;
  while ((hm = rangeRegex.exec(markdown)) !== null) {
    const v = parseFloat(hm[1]);
    if (v > 1 && v < 500000 && !pricesFromMd.includes(v)) pricesFromMd.push(v);
  }

  const allPrices = [...new Set([...pricesFromHtml, ...pricesFromMd])].sort((a, b) => a - b);
  console.log(`SAG prices found: ${JSON.stringify(allPrices)}`);

  let name = '';
  const namePatterns = [
    /(?:^|\n)\*\*([^*]+)\*\*/m,
    /Číslo položky:\s*(\S+)/i,
    /class="[^"]*article[^"]*name[^"]*"[^>]*>([^<]+)/i,
  ];
  for (const pattern of namePatterns) {
    const m = markdown.match(pattern) || html.match(pattern);
    if (m && m[1] && m[1].length > 2 && m[1].length < 150) {
      name = m[1].trim();
      break;
    }
  }

  if (!name) {
    const lines = markdown.split('\n').filter(l => l.trim().length > 3);
    for (const line of lines) {
      const clean = line.replace(/[|*#\[\]]/g, '').trim();
      if (clean.match(/brzdov|filtr|olej|svíčk|řemen|ložisk|čerpadl|tlumič|destičk|kotouč|hadice|senzor|snímač|lambda|termostat|chladič|ventil|pružin|rameno|tyč|kulový|stabilizátor|těsnění|palivov|vzduchov|kabinov|baterie|alternátor|startér|spojk|rozvodov/i)) {
        name = clean.substring(0, 120);
        break;
      }
    }
  }

  let manufacturer = '';
  const mfrPatterns = ['TRW', 'BREMBO', 'BOSCH', 'MANN', 'MAHLE', 'FEBI', 'SACHS', 'LEMFÖRDER', 'MEYLE', 'GATES', 'DAYCO', 'SKF', 'FAG', 'SNR', 'LUK', 'VALEO', 'DELPHI', 'ATE', 'TEXTAR', 'FERODO', 'NGK', 'DENSO', 'HELLA', 'RIDEX', 'OPTIMAL', 'ZIMMERMANN', 'BLUE PRINT', 'ELRING', 'CORTECO', 'CONTITECH', 'INA', 'SWAG', 'TOPRAN', 'FILTRON', 'PURFLUX', 'KNECHT', 'HENGST', 'WIX', 'VAG', 'VOLKSWAGEN', 'MOPAR', 'QUALITY', 'PRIME LINE'];
  const upperContent = (markdown + ' ' + html).toUpperCase();
  for (const mfr of mfrPatterns) {
    if (upperContent.includes(mfr)) { manufacturer = mfr; break; }
  }

  const content = markdown + ' ' + html;
  const isAvailable = /skladem|dostupn|zítra|ihned|\d+\s*ks/i.test(content);

  if (allPrices.length > 0) {
    const basePrice = allPrices[0];
    const priceWithoutVat = Math.round(basePrice * (1 + SAG_MARGIN) * 100) / 100;
    const priceWithVat = Math.round(priceWithoutVat * 1.21 * 100) / 100;

    return {
      found: true,
      name: name || `Díl ${oemCode} (SAG)`,
      price_without_vat: priceWithoutVat,
      price_with_vat: priceWithVat,
      manufacturer,
      availability: isAvailable ? 'available' : 'on_order',
    };
  }

  if (name && (manufacturer || content.includes('Číslo položky'))) {
    console.log('SAG: Found article but no price extracted — skipping (would create invalid cache entry)');
  }

  console.log('SAG: No results parsed from scraped content');
  return empty;
}

// ===== AutoKelly via Firecrawl =====

async function searchAutoKelly(
  email: string,
  password: string,
  firecrawlKey: string,
  oemCode: string
): Promise<{ found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string }> {
  const empty = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };
  try {
    console.log(`AutoKelly: searching ${oemCode} via Firecrawl`);

    // AutoKelly shows results without login for basic search — use direct scrape
    const searchResultUrl = `https://www.autokelly.cz/Search/ResultList?searchTerm=${encodeURIComponent(oemCode)}`;

    const fcResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${firecrawlKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: searchResultUrl,
        formats: ['markdown', 'html'],
        waitFor: 8000,
        onlyMainContent: false,
        timeout: 60000,
        actions: [
          { type: 'wait', milliseconds: 5000 },
          // Accept cookies if banner appears
          {
            type: 'executeJavascript',
            script: `
              (function() {
                const btns = document.querySelectorAll('button, a');
                for (const b of btns) {
                  const txt = (b.textContent || '').toLowerCase();
                  if (txt.includes('souhlasím') || txt.includes('přijmout') || txt.includes('accept')) {
                    b.click(); break;
                  }
                }
              })();
            `
          },
          { type: 'wait', milliseconds: 3000 },
          { type: 'scrape' },
        ],
      }),
    });

    const fcData = await fcResp.json();
    if (!fcResp.ok) {
      console.error('AutoKelly Firecrawl error:', JSON.stringify(fcData).substring(0, 500));
      return empty;
    }

    const markdown = fcData?.data?.markdown || fcData?.markdown || '';
    const html = fcData?.data?.html || fcData?.html || '';
    console.log(`AutoKelly Firecrawl result: markdown=${markdown.length} chars, html=${html.length} chars`);
    console.log(`AutoKelly markdown (first 1500): ${markdown.substring(0, 1500)}`);

    // Check if we're still on login page
    const stillOnLogin = markdown.includes('Uživatelské jméno / Email') && markdown.includes('Heslo') && !markdown.includes('Odhlásit') && !markdown.includes('Košík') && !markdown.includes('Výsledky');
    if (stillOnLogin) {
      console.log('AutoKelly: Still on login page, trying without login');
      // Even if login wall appears, there might be results visible
    }

    // Check for 404 or no results
    if (markdown.includes('Stránka nebyla nalezena') || markdown.includes('Ups!')) {
      console.log(`AutoKelly: 404 page for search ${oemCode}`);
      return empty;
    }

    // Check for zero results
    if (markdown.includes('Dle zadaných parametrů nic nenalezeno') || markdown.includes('Nebyly nalezeny žádné produkty')) {
      console.log(`AutoKelly: No results for ${oemCode}`);
      return empty;
    }

    return parseAutoKellyResults(markdown, html, oemCode);
  } catch (err) {
    console.error('AutoKelly search error:', err);
    return empty;
  }
}

function parseAutoKellyResults(
  markdown: string,
  html: string,
  oemCode: string
): { found: boolean; name: string; price_without_vat: number; price_with_vat: number; manufacturer: string; availability: string } {
  const empty = { found: false, name: '', price_without_vat: 0, price_with_vat: 0, manufacturer: '', availability: 'unknown' };

  // Extract prices from content
  const allPrices: number[] = [];
  const content = markdown + ' ' + html;

  // AutoKelly prices are shown as "XXX Kč" with "s DPH" or "bez DPH"
  const priceRegex = /(\d[\d\s]*[,.]?\d{0,2})\s*(?:Kč|CZK)/gi;
  let pm;
  while ((pm = priceRegex.exec(content)) !== null) {
    const v = parseFloat(pm[1].replace(/\s/g, '').replace(',', '.'));
    if (v > 1 && v < 500000) allPrices.push(v);
  }

  // Deduplicate and sort
  const uniquePrices = [...new Set(allPrices)].sort((a, b) => a - b);
  console.log(`AutoKelly prices found: ${JSON.stringify(uniquePrices)}`);

  // Extract product name
  let name = '';

  // Try to find product name from markdown structure
  // AutoKelly typically shows product names in bold or as headings
  const namePatterns = [
    /(?:^|\n)#+\s*([^\n]+)/m,  // Heading
    /(?:^|\n)\*\*([^*]{5,100})\*\*/m,  // Bold text
    /class="[^"]*product[^"]*name[^"]*"[^>]*>([^<]{5,100})/i,  // Product name class in HTML
    /class="[^"]*title[^"]*"[^>]*>([^<]{5,100})/i,  // Title class in HTML
  ];
  for (const pattern of namePatterns) {
    const m = markdown.match(pattern) || html.match(pattern);
    if (m && m[1] && m[1].length > 4 && m[1].length < 150) {
      // Skip navigation/header text
      const cleaned = m[1].trim();
      if (!cleaned.match(/^(KATALOG|PRO DÍLNU|MOJE GARÁŽ|Přihlášení|Registrace|Auto Kelly|Hledat)/i)) {
        name = cleaned;
        break;
      }
    }
  }

  // Fallback: find descriptive text with automotive keywords
  if (!name) {
    const lines = markdown.split('\n').filter(l => l.trim().length > 5);
    for (const line of lines) {
      const clean = line.replace(/[|*#\[\]]/g, '').trim();
      if (clean.match(/brzdov|filtr|olej|svíčk|řemen|ložisk|čerpadl|tlumič|destičk|kotouč|hadice|senzor|snímač|lambda|termostat|chladič|ventil|pružin|rameno|tyč|kulový|stabilizátor|těsnění|palivov|vzduchov|kabinov|baterie|alternátor|startér|spojk|rozvodov|těhlice|náboj|hřídel|manžet/i)) {
        name = clean.substring(0, 120);
        break;
      }
    }
  }

  // Extract manufacturer (same list as SAG + AutoKelly specific brands)
  let manufacturer = '';
  const mfrPatterns = ['TRW', 'BREMBO', 'BOSCH', 'MANN', 'MAHLE', 'FEBI', 'SACHS', 'LEMFÖRDER', 'MEYLE', 'GATES', 'DAYCO', 'SKF', 'FAG', 'SNR', 'LUK', 'VALEO', 'DELPHI', 'ATE', 'TEXTAR', 'FERODO', 'NGK', 'DENSO', 'HELLA', 'RIDEX', 'OPTIMAL', 'ZIMMERMANN', 'BLUE PRINT', 'ELRING', 'CORTECO', 'CONTITECH', 'INA', 'SWAG', 'TOPRAN', 'FILTRON', 'PURFLUX', 'KNECHT', 'HENGST', 'WIX', 'MONROE', 'BILSTEIN', 'KYB', 'SACHS', 'BERU', 'CHAMPION', 'MOOG', 'NIPPARTS', 'JAPANPARTS', 'KRAFT', 'MAXGEAR', 'QUALITY', 'PRIME LINE'];
  const upperContent = content.toUpperCase();
  for (const mfr of mfrPatterns) {
    if (upperContent.includes(mfr)) { manufacturer = mfr; break; }
  }

  // Check availability
  const isAvailable = /skladem|dostupn|ihned|\d+\s*ks|zítra/i.test(content);

  if (uniquePrices.length > 0) {
    // Use lowest price as base, apply margin
    const basePrice = uniquePrices[0];
    const priceWithoutVat = Math.round(basePrice * (1 + AK_MARGIN) * 100) / 100;
    const priceWithVat = Math.round(priceWithoutVat * 1.21 * 100) / 100;

    // Check if the price already includes VAT ("s DPH")
    const hasDphIndicator = /s\s*DPH/i.test(content);
    if (hasDphIndicator && uniquePrices.length >= 2) {
      // First price might be without VAT, second with VAT
      const pWithout = Math.round(uniquePrices[0] * (1 + AK_MARGIN) * 100) / 100;
      const pWith = Math.round(uniquePrices[1] * (1 + AK_MARGIN) * 100) / 100;
      return {
        found: true,
        name: name || `Díl ${oemCode} (AutoKelly)`,
        price_without_vat: pWithout,
        price_with_vat: pWith > pWithout ? pWith : Math.round(pWithout * 1.21 * 100) / 100,
        manufacturer,
        availability: isAvailable ? 'available' : 'on_order',
      };
    }

    return {
      found: true,
      name: name || `Díl ${oemCode} (AutoKelly)`,
      price_without_vat: priceWithoutVat,
      price_with_vat: priceWithVat,
      manufacturer,
      availability: isAvailable ? 'available' : 'on_order',
    };
  }

  if (name) {
    console.log('AutoKelly: Found article but no price extracted — skipping');
  }

  console.log('AutoKelly: No results parsed from scraped content');
  return empty;
}
