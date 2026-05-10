import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

const BRAND_SLUGS: Record<string, string> = {
  'Chrysler': 'chrysler', 'Dodge': 'dodge', 'RAM': 'ram',
};

const MODEL_SLUGS: Record<string, string> = {
  '300C': '300c', '300': '300', 'Pacifica': 'pacifica', 'Town & Country': 'town-country',
  'Voyager': 'voyager', 'Grand Caravan': 'grand-caravan', 'Durango': 'durango',
  'Charger': 'charger', 'Challenger': 'challenger', 'Grand Cherokee': 'grand-cherokee',
  'Wrangler': 'wrangler', 'Cherokee': 'cherokee', 'Compass': 'compass', '1500': '1500',
};

function buildCatalogUrl(brand: string, model: string): string {
  const brandSlug = BRAND_SLUGS[brand] || brand.toLowerCase();
  const modelSlug = MODEL_SLUGS[model] || model.toLowerCase().replace(/[&]/g, '').replace(/\s+/g, '-');
  return `https://${brandSlug}.7zap.com/en/global/${modelSlug}-parts-catalog/`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const firecrawlKey = Deno.env.get('FIRECRAWL_API_KEY');

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Missing Auth header' }, 401);

    // Klient s Service Role pro bezpečné ověření admina
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Ruční ověření uživatele přes token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Kontrola admin role
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      return jsonResponse({ error: 'Forbidden: Admin required' }, 403);
    }

    const body = await req.json();
    const { brand, model, year, action } = body;

    // --- SCRAPE CATALOG ---
    if (action === 'scrape-catalog') {
      if (!brand || !model) return jsonResponse({ error: 'Brand and Model are required' }, 400);

      const catalogUrl = buildCatalogUrl(brand, model);
      
      const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${firecrawlKey}`, 
          'Content-Type': 'application/json' 
        },
        body: JSON.stringify({ 
          url: catalogUrl, 
          formats: ['markdown'], 
          onlyMainContent: true,
          waitFor: 5000 
        }),
      });

      if (!scrapeResp.ok) return jsonResponse({ error: `Firecrawl error: ${scrapeResp.status}` }, 500);
      
      const data = await scrapeResp.json();
      const md = data.data?.markdown || '';
      const parts = parsePartsFromMarkdown(md);

      let saved = 0;
      for (const part of parts) {
        const { error } = await supabase.from('parts_new').upsert({
          oem_number: part.oem_number,
          name: part.name,
          category: part.category,
          compatible_vehicles: `${brand} ${model} ${year || ''}`.trim(),
          catalog_source: '7zap-manual'
        }, { onConflict: 'oem_number' });
        if (!error) saved++;
      }

      return jsonResponse({ 
        success: true, 
        url: catalogUrl, 
        parts_found: parts.length, 
        parts_saved: saved 
      });
    }

    // --- GENERATE (AI) ---
    if (action === 'generate-catalog') {
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      const prompt = `Return a JSON array of 50 Mopar parts for ${brand} ${model}. JSON only: [{"oem_number": "...", "name": "...", "category": "..."}]`;

      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LOVABLE_API_KEY}` },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [{ role: 'user', content: prompt }]
        }),
      });

      const aiData = await aiResp.json();
      const jsonMatch = aiData.choices[0].message.content.match(/\[[\s\S]*\]/);
      const parts = JSON.parse(jsonMatch[0]);

      for (const part of parts) {
        await supabase.from('parts_new').upsert({
          oem_number: part.oem_number,
          name: part.name,
          category: part.category,
          compatible_vehicles: `${brand} ${model}`,
          catalog_source: 'ai-generated'
        }, { onConflict: 'oem_number' });
      }

      return jsonResponse({ success: true, parts_count: parts.length });
    }

    return jsonResponse({ error: 'Invalid action' }, 400);

  } catch (error) {
    console.error('Error:', error);
    return jsonResponse({ success: false, error: error.message }, 500);
  }
});

function parsePartsFromMarkdown(md: string) {
  const parts: any[] = [];
  const lines = md.split('\n');
  let currentCat = 'General';
  
  for (const line of lines) {
    if (line.startsWith('#')) {
      currentCat = line.replace(/#/g, '').trim();
      continue;
    }
    // Hledá OEM čísla (typicky 8 znaků + 2 písmena)
    const oemMatch = line.match(/\b(\d{8,}[A-Z]{1,3})\b/g);
    if (oemMatch) {
      oemMatch.forEach(oem => {
        parts.push({
          oem_number: oem,
          name: line.replace(oem, '').replace(/[|#*\[\]()]/g, '').trim(),
          category: currentCat
        });
      });
    }
  }
  return parts;
}
