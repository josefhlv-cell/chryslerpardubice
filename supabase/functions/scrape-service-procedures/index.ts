const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const CHRYSLER_MODELS = [
  { model: '300', slug: 'chrysler/300' },
  { model: 'Pacifica', slug: 'chrysler/pacifica' },
  { model: 'Town & Country', slug: 'chrysler/town-and-country' },
  { model: 'Voyager', slug: 'chrysler/voyager' },
  { model: 'PT Cruiser', slug: 'chrysler/pt-cruiser' },
  { model: 'Sebring', slug: 'chrysler/sebring' },
];

const CATEGORIES = [
  { category: 'Motor', path: 'engine' },
  { category: 'Převodovka', path: 'transmission' },
  { category: 'Brzdy', path: 'brakes' },
  { category: 'Odpružení', path: 'suspension' },
  { category: 'Elektroinstalace', path: 'electrical' },
  { category: 'Klimatizace', path: 'heating-and-air-conditioning' },
  { category: 'Chladící systém', path: 'engine-cooling' },
  { category: 'Palivový systém', path: 'fuel-system' },
  { category: 'Řízení', path: 'steering' },
  { category: 'Výfuk', path: 'exhaust-system' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const body = await req.json().catch(() => ({}));
    const targetModel = body.model || null; // optional filter
    const targetCategory = body.category || null;

    const models = targetModel
      ? CHRYSLER_MODELS.filter(m => m.model === targetModel)
      : CHRYSLER_MODELS;

    const categories = targetCategory
      ? CATEGORIES.filter(c => c.category === targetCategory)
      : CATEGORIES;

    const results: any[] = [];
    let savedCount = 0;

    for (const model of models) {
      for (const cat of categories) {
        const url = `https://www.workshop-manuals.com/${model.slug}/${cat.path}/`;
        console.log(`Scraping: ${url}`);

        try {
          const scrapeResp = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              url,
              formats: ['markdown'],
              onlyMainContent: true,
              waitFor: 3000,
            }),
          });

          if (!scrapeResp.ok) {
            console.error(`Failed to scrape ${url}: ${scrapeResp.status}`);
            results.push({ model: model.model, category: cat.category, status: 'error', code: scrapeResp.status });
            continue;
          }

          const scrapeData = await scrapeResp.json();
          const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

          if (!markdown || markdown.length < 100) {
            results.push({ model: model.model, category: cat.category, status: 'empty' });
            continue;
          }

          // Parse sections from markdown
          const sections = parseMarkdownSections(markdown);

          for (const section of sections) {
            // Save to database
            const insertResp = await fetch(`${supabaseUrl}/rest/v1/service_procedures`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Prefer': 'resolution=merge-duplicates',
              },
              body: JSON.stringify({
                brand: 'Chrysler',
                model: model.model,
                category: cat.category,
                title: section.title,
                content: section.content,
                source_url: url,
                source: 'workshop-manuals',
                procedure_type: detectProcedureType(section.title),
              }),
            });

            if (insertResp.ok) {
              savedCount++;
            }
          }

          results.push({
            model: model.model,
            category: cat.category,
            status: 'ok',
            sections: sections.length,
            contentLength: markdown.length,
          });

        } catch (err) {
          console.error(`Error scraping ${model.model}/${cat.category}:`, err);
          results.push({ model: model.model, category: cat.category, status: 'error', message: String(err) });
        }

        // Rate limit - wait between requests
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    return new Response(
      JSON.stringify({ success: true, savedCount, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function parseMarkdownSections(markdown: string): { title: string; content: string }[] {
  const sections: { title: string; content: string }[] = [];
  const lines = markdown.split('\n');
  let currentTitle = '';
  let currentContent: string[] = [];

  for (const line of lines) {
    const headerMatch = line.match(/^#{1,3}\s+(.+)/);
    if (headerMatch) {
      if (currentTitle && currentContent.length > 0) {
        sections.push({
          title: currentTitle.trim(),
          content: currentContent.join('\n').trim(),
        });
      }
      currentTitle = headerMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentTitle && currentContent.length > 0) {
    sections.push({
      title: currentTitle.trim(),
      content: currentContent.join('\n').trim(),
    });
  }

  // If no sections found, treat entire content as one
  if (sections.length === 0 && markdown.trim().length > 50) {
    sections.push({
      title: 'Obecný postup',
      content: markdown.trim(),
    });
  }

  return sections;
}

function detectProcedureType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('diagnos') || lower.includes('troubleshoot') || lower.includes('dtc')) return 'diagnostic';
  if (lower.includes('remov') || lower.includes('replac') || lower.includes('install')) return 'repair';
  if (lower.includes('inspect') || lower.includes('check') || lower.includes('test')) return 'inspection';
  if (lower.includes('specification') || lower.includes('torque')) return 'specification';
  if (lower.includes('wiring') || lower.includes('diagram') || lower.includes('circuit')) return 'wiring';
  return 'repair';
}
