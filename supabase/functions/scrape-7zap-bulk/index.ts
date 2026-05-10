/**
 * 7zap Bulk OEM Scraper — preview-first.
 * Fetches all OEM numbers for a brand+model from *.7zap.com via Firecrawl
 * and stores them in scrape_preview_jobs (status=preview). Does NOT touch parts_new.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return j({ success: false, error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const FC_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FC_KEY) return j({ success: false, error: 'FIRECRAWL_API_KEY not configured' }, 500);

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (!claims?.claims?.sub) return j({ success: false, error: 'Unauthorized' }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', claims.claims.sub).eq('role', 'admin').maybeSingle();
    if (!role) return j({ success: false, error: 'Forbidden' }, 403);

    const { brand, model, year, engine, max_pages = 50 } = await req.json();
    if (!brand || !model) return j({ success: false, error: 'brand and model required' }, 400);

    const brandSlug = brand.toLowerCase();
    const modelSlug = model.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-');
    const rootUrl = `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;

    // Crawl with Firecrawl (depth 2-3 to get diagram pages with OEMs)
    const crawlResp = await fetch('https://api.firecrawl.dev/v2/crawl', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: rootUrl,
        limit: max_pages,
        maxDepth: 3,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    });

    if (!crawlResp.ok) {
      const errText = await crawlResp.text();
      return j({ success: false, error: `Firecrawl: ${crawlResp.status} ${errText.slice(0, 200)}` }, 502);
    }

    const crawlData = await crawlResp.json();
    const jobId = crawlData.id || crawlData.jobId;
    if (!jobId) return j({ success: false, error: 'Firecrawl no job id' }, 502);

    // Poll up to 90s
    let pages: any[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const stat = await fetch(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${FC_KEY}` },
      });
      if (!stat.ok) continue;
      const sd = await stat.json();
      if (sd.status === 'completed') { pages = sd.data || []; break; }
      if (sd.status === 'failed') return j({ success: false, error: 'Firecrawl crawl failed' }, 502);
    }

    // Extract OEMs from markdown — pattern: 8-12 alphanumeric OEM codes (Mopar style: 68191349AC, 4663515AE)
    const oemRegex = /\b([0-9]{4,8}[A-Z]{1,3}[0-9A-Z]{0,4}|[K6][0-9]{6,9})\b/g;
    const seen = new Map<string, { oem: string; name: string; category: string }>();
    let currentCat = 'Ostatní';

    for (const page of pages) {
      const md = page.markdown || '';
      const url = page.metadata?.sourceURL || page.url || '';
      // Try to derive category from URL path
      const pathParts = url.split('/').filter(Boolean);
      const catHint = pathParts[pathParts.length - 1]?.replace(/-/g, ' ');
      if (catHint && catHint.length > 2 && catHint.length < 60) {
        currentCat = catHint.charAt(0).toUpperCase() + catHint.slice(1);
      }

      // Walk lines: OEM often appears on a line with a name nearby
      const lines = md.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = [...line.matchAll(oemRegex)];
        for (const m of matches) {
          const oem = m[1].toUpperCase();
          if (seen.has(oem)) continue;
          // name = surrounding non-OEM text
          const name = line.replace(oemRegex, '').replace(/[|\-*_#\[\]\(\)]/g, ' ').trim().slice(0, 120) || `OEM ${oem}`;
          seen.set(oem, { oem, name, category: currentCat });
        }
      }
    }

    const parts = Array.from(seen.values());

    const { data: job, error: insErr } = await admin.from('scrape_preview_jobs').insert({
      source: '7zap',
      brand, model, year: year || null, engine: engine || null,
      status: 'preview',
      raw_payload: parts,
      parts_count: parts.length,
      created_by: claims.claims.sub,
    }).select('id').single();

    if (insErr) return j({ success: false, error: insErr.message }, 500);

    return j({ success: true, job_id: job.id, parts_count: parts.length, sample: parts.slice(0, 20) });
  } catch (e: any) {
    return j({ success: false, error: e?.message || String(e) }, 500);
  }
});

function j(d: any, s = 200) { ret