import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function j(d: any, s = 200) { 
  return new Response(JSON.stringify(d), { 
    status: s, 
    headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
  }); 
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return j({ success: false, error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const FC_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!FC_KEY) return j({ success: false, error: 'Firecrawl API key missing' }, 500);

    // Vytvoříme admin klienta
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- KLÍČOVÁ OPRAVA: Manuální validace JWT ---
    // Místo auth.getUser(), které v Edge Functions občas selhává na "is not a function",
    // využijeme interní metodu pro ověření uživatele z tokenu.
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return j({ success: false, error: 'Unauthorized: Invalid token', details: authError }, 401);
    }

    // Kontrola admin role
    const { data: role } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
      
    if (!role) return j({ success: false, error: 'Forbidden: Admin required' }, 403);

    const body = await req.json();
    const { brand, model, year, max_pages = 50 } = body;
    if (!brand || !model) return j({ success: false, error: 'Brand and model required' }, 400);

    // --- FIRECRAWL LOGIKA ---
    const brandSlug = brand.toLowerCase();
    const modelSlug = model.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-');
    const rootUrl = `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;

    const crawlResp = await fetch('https://api.firecrawl.dev/v2/crawl', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: rootUrl,
        limit: max_pages,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    });

    if (!crawlResp.ok) return j({ success: false, error: 'Firecrawl failed to start' }, 502);
    const { id: jobId } = await crawlResp.json();

    // Polling (zjednodušeno pro ukázku)
    let pages: any[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 4000));
      const stat = await fetch(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${FC_KEY}` },
      });
      const sd = await stat.json();
      if (sd.status === 'completed') { pages = sd.data || []; break; }
    }

    // Extrakce a uložení
    const oemRegex = /\b([0-9]{4,8}[A-Z]{1,3}[0-9A-Z]{0,4})\b/g;
    const parts = [];
    for (const page of pages) {
      const matches = [...(page.markdown || '').matchAll(oemRegex)];
      for (const m of matches) {
        parts.push({ oem: m[1], category: 'Zjištěno z 7zap' });
      }
    }

    const { data: job, error: insErr } = await supabase
      .from('scrape_preview_jobs')
      .insert({
        source: '7zap',
        brand, model, status: 'preview',
        raw_payload: parts,
        parts_count: parts.length,
        created_by: user.id
      }).select('id').single();

    return j({ success: true, job_id: job?.id, parts_count: parts.length });

  } catch (e: any) {
    return j({ success: false, error: e.message }, 500);
  }
});
