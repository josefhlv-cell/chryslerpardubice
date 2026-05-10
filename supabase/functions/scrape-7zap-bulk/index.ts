import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.1"

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
    if (!authHeader.startsWith('Bearer ')) return j({ success: false, error: 'Chybí Authorization hlavička' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const FC_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    
    if (!FC_KEY) return j({ success: false, error: 'FIRECRAWL_API_KEY není nastavena' }, 500);

    // Vytvoříme klienta s Service Role - ten má oprávnění na vše
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // --- OPRAVA CHYBY Z SCREENSHOTU ---
    // Místo nespolehlivých metod vytáhneme uživatele přímo z tokenu
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return j({ success: false, error: 'Neplatný token (Unauthorized)', details: authError }, 401);
    }

    // Kontrola admin role v tabulce user_roles
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();
      
    if (!roleData) {
      return j({ success: false, error: 'Přístup odepřen: Nejste administrátor' }, 403);
    }

    // Zpracování dat z requestu
    const { brand, model, year, max_pages = 50 } = await req.json();
    if (!brand || !model) return j({ success: false, error: 'Značka a model jsou povinné' }, 400);

    // --- LOGIKA FIRECRAWL CRAWLERU ---
    const brandSlug = brand.toLowerCase();
    const modelSlug = model.toLowerCase().replace(/&/g, '').replace(/\s+/g, '-');
    const rootUrl = `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;

    // Spuštění crawl úlohy (V2 API)
    const crawlStart = await fetch('https://api.firecrawl.dev/v2/crawl', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FC_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: rootUrl,
        limit: max_pages,
        scrapeOptions: { formats: ['markdown'], onlyMainContent: true },
      }),
    });

    if (!crawlStart.ok) {
      const errTxt = await crawlStart.text();
      return j({ success: false, error: `Firecrawl se nepodařilo spustit: ${errTxt}` }, 502);
    }

    const { id: jobId } = await crawlStart.json();

    // Čekání na výsledek (Polling)
    let pages: any[] = [];
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 4000)); // Čekat 4 sekundy
      const statusCheck = await fetch(`https://api.firecrawl.dev/v2/crawl/${jobId}`, {
        headers: { 'Authorization': `Bearer ${FC_KEY}` },
      });
      const sd = await statusCheck.json();
      
      if (sd.status === 'completed') { 
        pages = sd.data || []; 
        break; 
      }
      if (sd.status === 'failed') {
        return j({ success: false, error: 'Firecrawl crawl selhal' }, 502);
      }
    }

    // Extrakce OEM čísel (Mopar formát)
    const oemRegex = /\b([0-9]{4,8}[A-Z]{1,3}[0-9A-Z]{0,4}|[K6][0-9]{6,9})\b/g;
    const seenParts = new Map();

    for (const page of pages) {
      const md = page.markdown || '';
      const matches = [...md.matchAll(oemRegex)];
      
      for (const m of matches) {
        const oem = m[1].toUpperCase();
        if (!seenParts.has(oem)) {
          seenParts.set(oem, { oem, category: 'Import 7zap' });
        }
      }
    }

    const finalParts = Array.from(seenParts.values());

    // Uložení výsledku do tabulky náhledů (scrape_preview_jobs)
    const { data: job, error: insErr } = await supabase
      .from('scrape_preview_jobs')
      .insert({
        source: '7zap',
        brand, 
        model, 
        status: 'preview',
        raw_payload: finalParts,
        parts_count: finalParts.length,
        created_by: user.id
      })
      .select('id')
      .single();

    if (insErr) return j({ success: false, error: `Chyba při ukládání preview: ${insErr.message}` }, 500);

    return j({ 
      success: true, 
      job_id: job.id, 
      parts_count: finalParts.length,
      message: 'Preview katalogu bylo úspěšně vytvořeno.' 
    });

  } catch (error: any) {
    console.error('Kritická chyba funkce:', error);
    return j({ success: false, error: error.message || 'Neznámá chyba' }, 500);
  }
});
