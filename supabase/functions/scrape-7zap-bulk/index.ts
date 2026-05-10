import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0"

/**
 * 7zap Bulk OEM Scraper — preview-first.
 * Fetches all OEM numbers for a brand+model from *.7zap.com via Firecrawl
 * and stores them in scrape_preview_jobs (status=preview).
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Pomocná funkce pro JSON odpověď
function j(d: any, s = 200) { 
  return new Response(JSON.stringify(d), { 
    status: s, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  }); 
}

Deno.serve(async (req) => {
  // CORS Preflight
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return j({ success: false, error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const FC_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!FC_KEY) return j({ success: false, error: 'FIRECRAWL_API_KEY not configured' }, 500);

    // Inicializace Supabase s Service Role
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // OPRAVA AUTH: Získání uživatele přímo z tokenu
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return j({ success: false, error: 'Unauthorized', details: authError }, 401);
    }

    // Kontrola admin role
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
      
    if (!role) return j({ success: false, error: 'Forbidden: Admin role required' }, 403);

    const body = await req.json();
    const { brand, model, year, engine, max_pages = 50 } = body;
    if (!brand || !model) return j({ success: false, error: 'brand and model required' }, 400);

    const brandSlug = brand.toLowerCase();
    const modelSlug = model.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-');
    const rootUrl = `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;

    // 1. Spuštění Crawl (Firecrawl v2 API)
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

    // 2. Polling (čekání na dokončení) - max 90s
    let pages: any[] = [];
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 3000));
      const stat = await fetch(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${FC_KEY}` },
      });
      
      if (!stat.ok) continue;
      
      const sd = await stat.json();
      if (sd.status === 'completed') { 
        pages = sd.data || []; 
        break; 
      }
      if (sd.status === 'failed') return j({ success: false, error: 'Firecrawl crawl failed' }, 502);
    }

    // 3. Extrakce OEM čísel z Markdownu
    const oemRegex = /\b([0-9]{4,8}[A-Z]{1,3}[0-9A-Z]{0,4}|[K6][0-9]{6,9})\b/g;
    const seen = new Map<string, { oem: string; name: string; category: string }>();
    let currentCat = 'Ostatní';

    for (const page of pages) {
      const md = page.markdown || '';
      const url = page.metadata?.sourceURL || page.url || '';
      
      // Pokus o určení kategorie z URL
      const pathParts = url.split('/').filter(Boolean);
      const catHint = pathParts[pathParts.length - 1]?.replace(/-/g, ' ');
      if (catHint && catHint.length > 2 && catHint.length < 60) {
        currentCat = catHint.charAt(0).toUpperCase() + catHint.slice(1);
      }

      const lines = md.split('\n');
      for (const line of lines) {
        const matches = [...line.matchAll(oemRegex)];
        for (const m of matches) {
          const oem = m[1].toUpperCase();
          if (seen.has(oem)) continue;
          
          const name = line.replace(oemRegex, '')
                           .replace(/[|\-*_#\[\]\(\)]/g, ' ')
                           .trim()
                           .slice(0, 120) || `OEM ${oem}`;
                           
          seen.set(oem, { oem, name, category: currentCat });
        }
      }
    }

    const parts = Array.from(seen.values());

    // 4. Uložení do náhledu (scrape_preview_jobs)
    const { data: job, error: insErr } = await supabase
      .from('scrape_preview_jobs')
      .insert({
        source: '7zap',
        brand, 
        model, 
        year: year || null, 
        engine: engine || null,
        status: 'preview',
        raw_payload: parts,
        parts_count: parts.length,
        created_by: user.id,
      })
      .select('id')
      .single();

    if (insErr) return j({ success: false, error: insErr.message }, 500);

    return j({ 
      success: true, 
      job_id: job.id, 
      parts_count: parts.length, 
      sample: parts.slice(0, 20) 
    });

  } catch (e: any) {
    console.error('Scrape error:', e);
    return j({ success: false, error: e?.message || String(e) }, 500);
  }
});
