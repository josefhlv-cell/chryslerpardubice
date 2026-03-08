const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Vehicle configs to scrape from 7zap.com
const VEHICLE_CONFIGS = [
  { brand: 'Chrysler', slug: 'chrysler', models: [
    { model: '300C', path: '300c-parts-catalog', year_from: 2005, year_to: 2023 },
    { model: 'Pacifica', path: 'pacifica-parts-catalog', year_from: 2004, year_to: 2023 },
    { model: 'Town & Country', path: 'town-country-5th-generation-parts-catalog', year_from: 2008, year_to: 2016 },
    { model: 'Voyager', path: 'voyager-parts-catalog', year_from: 2020, year_to: 2023 },
  ]},
  { brand: 'Dodge', slug: 'dodge', models: [
    { model: 'Grand Caravan', path: 'grand-caravan-5th-generation-parts-catalog', year_from: 2008, year_to: 2020 },
    { model: 'Durango', path: 'durango-3rd-generation-parts-catalog', year_from: 2011, year_to: 2023 },
    { model: 'Charger', path: 'charger-7th-generation-parts-catalog', year_from: 2011, year_to: 2023 },
    { model: 'Challenger', path: 'challenger-parts-catalog', year_from: 2008, year_to: 2023 },
  ]},
];

interface ScrapedCategory {
  name: string;
  url: string;
  subcategories?: { name: string; url: string }[];
}

interface ScrapedPart {
  oem_number: string;
  part_name: string;
  manufacturer?: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { brand, model, action } = await req.json();
    
    const FIRECRAWL_API_KEY = Deno.env.get('FIRECRAWL_API_KEY');
    if (!FIRECRAWL_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl connector not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error('Missing Supabase config');

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find vehicle config
    const brandConfig = VEHICLE_CONFIGS.find(b => b.brand.toLowerCase() === brand?.toLowerCase());
    if (!brandConfig) {
      return new Response(
        JSON.stringify({ success: false, error: `Brand not found: ${brand}`, available: VEHICLE_CONFIGS.map(v => v.brand) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const modelConfig = brandConfig.models.find(m => m.model.toLowerCase() === model?.toLowerCase());
    if (!modelConfig) {
      return new Response(
        JSON.stringify({ success: false, error: `Model not found: ${model}`, available: brandConfig.models.map(m => m.model) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const baseUrl = `https://${brandConfig.slug}.7zap.com/en/global/${modelConfig.path}/`;
    console.log(`Scraping: ${baseUrl}`);

    // Step 1: Scrape the model page to get categories
    if (action === 'list-categories' || action === 'full') {
      const categoriesMarkdown = await firecrawlScrape(FIRECRAWL_API_KEY, baseUrl);
      const categories = parseCategoriesFromMarkdown(categoriesMarkdown);
      console.log(`Found ${categories.length} categories for ${brandConfig.brand} ${modelConfig.model}`);

      if (action === 'list-categories') {
        return new Response(
          JSON.stringify({ success: true, brand: brandConfig.brand, model: modelConfig.model, categories, url: baseUrl }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Step 2: For each category, scrape parts
      let totalParts = 0;
      let totalCategories = 0;

      for (const cat of categories) {
        // Insert category into DB
        const { data: catData, error: catError } = await supabase
          .from('epc_categories')
          .upsert({
            brand: brandConfig.brand,
            model: modelConfig.model,
            category: cat.name,
            year_from: modelConfig.year_from,
            year_to: modelConfig.year_to,
            sort_order: totalCategories,
          }, { onConflict: 'brand,model,category' })
          .select('id')
          .single();

        if (catError) {
          // Try insert without upsert
          const { data: existingCat } = await supabase
            .from('epc_categories')
            .select('id')
            .eq('brand', brandConfig.brand)
            .eq('model', modelConfig.model)
            .eq('category', cat.name)
            .single();

          if (!existingCat) {
            const { data: newCat } = await supabase
              .from('epc_categories')
              .insert({
                brand: brandConfig.brand,
                model: modelConfig.model,
                category: cat.name,
                year_from: modelConfig.year_from,
                year_to: modelConfig.year_to,
                sort_order: totalCategories,
              })
              .select('id')
              .single();
            
            if (newCat) {
              totalCategories++;
              await scrapeAndInsertParts(FIRECRAWL_API_KEY, supabase, cat, newCat.id);
            }
          } else {
            totalCategories++;
            await scrapeAndInsertParts(FIRECRAWL_API_KEY, supabase, cat, existingCat.id);
          }
        } else if (catData) {
          totalCategories++;
          const partsCount = await scrapeAndInsertParts(FIRECRAWL_API_KEY, supabase, cat, catData.id);
          totalParts += partsCount;
        }

        // Rate limit - wait between requests
        await new Promise(r => setTimeout(r, 2000));
      }

      return new Response(
        JSON.stringify({ success: true, brand: brandConfig.brand, model: modelConfig.model, categories: totalCategories, parts: totalParts }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Action: scrape single category
    if (action === 'scrape-category') {
      const { categoryUrl, categoryName } = await req.json().catch(() => ({}));
      if (!categoryUrl) {
        return new Response(
          JSON.stringify({ success: false, error: 'categoryUrl required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const partsMarkdown = await firecrawlScrape(FIRECRAWL_API_KEY, categoryUrl);
      const parts = parsePartsFromMarkdown(partsMarkdown);

      return new Response(
        JSON.stringify({ success: true, parts, raw_length: partsMarkdown.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: 'Invalid action. Use: list-categories, full, scrape-category' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('epc-scrape error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function firecrawlScrape(apiKey: string, url: string): Promise<string> {
  console.log(`Firecrawl scraping: ${url}`);
  const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url,
      formats: ['markdown', 'links'],
      waitFor: 3000,
      onlyMainContent: true,
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error('Firecrawl error:', JSON.stringify(data));
    throw new Error(`Firecrawl error: ${data.error || response.status}`);
  }

  return data.data?.markdown || data.markdown || '';
}

function parseCategoriesFromMarkdown(markdown: string): ScrapedCategory[] {
  const categories: ScrapedCategory[] = [];
  const lines = markdown.split('\\n');
  
  // Look for links that point to category pages (contain "parts-catalog" or category patterns)
  const categoryPattern = /\\[([^\\]]+)\\]\((https?:\/\/[^\s)]+)\)/g;
  let match;
  
  while ((match = categoryPattern.exec(markdown)) !== null) {
    const name = match[1].trim();
    const url = match[2].trim();
    
    // Filter: only keep actual part category links (not navigation, not model links)
    if (url.includes('7zap.com') && 
        !url.includes('parts-catalog') && // Not model-level links
        name.length > 2 && 
        name.length < 100 &&
        !name.includes('7zap') &&
        !name.includes('VIN') &&
        !name.includes('Enter') &&
        !name.includes('Premium') &&
        !name.includes('flag')) {
      
      // Deduplicate
      if (!categories.find(c => c.name === name)) {
        categories.push({ name, url });
      }
    }
  }

  // Also try to find plain text category names (often in lists)
  const listPattern = /^[-*]\s+(.+)/gm;
  while ((match = listPattern.exec(markdown)) !== null) {
    const name = match[1].replace(/\[|\]|\(.*\)/g, '').trim();
    if (name.length > 2 && name.length < 80 && !categories.find(c => c.name === name)) {
      categories.push({ name, url: '' });
    }
  }

  // Common EPC categories as fallback
  if (categories.length === 0) {
    const defaultCategories = [
      'Engine', 'Transmission', 'Electrical', 'Brake System', 'Suspension',
      'Steering', 'Exhaust', 'Cooling System', 'Fuel System', 'Body',
      'Interior', 'HVAC', 'Wheels', 'Axle', 'Transfer Case'
    ];
    // Map to Czech names
    const czechMap: Record<string, string> = {
      'Engine': 'Motor', 'Transmission': 'Převodovka', 'Electrical': 'Elektroinstalace',
      'Brake System': 'Brzdový systém', 'Suspension': 'Podvozek', 'Steering': 'Řízení',
      'Exhaust': 'Výfukový systém', 'Cooling System': 'Chlazení', 'Fuel System': 'Palivový systém',
      'Body': 'Karoserie', 'Interior': 'Interiér', 'HVAC': 'Klimatizace/Topení',
      'Wheels': 'Kola', 'Axle': 'Náprava', 'Transfer Case': 'Rozvodovka'
    };
    for (const cat of defaultCategories) {
      categories.push({ name: czechMap[cat] || cat, url: '' });
    }
  }

  return categories;
}

function parsePartsFromMarkdown(markdown: string): ScrapedPart[] {
  const parts: ScrapedPart[] = [];
  
  // Pattern 1: OEM numbers (Mopar format: digits + letters, e.g., 68191349AC, 4663515AE)
  const oemPattern = /\b(\d{3,10}[A-Z]{0,4})\b/g;
  const potentialOems = new Set<string>();
  let match;
  
  while ((match = oemPattern.exec(markdown)) !== null) {
    const oem = match[1];
    // Validate: Mopar OEM format - usually 8-10 chars, ends with 0-2 letters
    if (oem.length >= 6 && oem.length <= 14 && /^\d+[A-Z]{0,4}$/.test(oem)) {
      potentialOems.add(oem);
    }
  }

  // Pattern 2: Table rows with part info
  const tableRowPattern = /\|([^|]+)\|([^|]+)\|/g;
  while ((match = tableRowPattern.exec(markdown)) !== null) {
    const cell1 = match[1].trim();
    const cell2 = match[2].trim();
    
    // Check if either cell contains an OEM-like number
    const oemInCell1 = /\b(\d{5,10}[A-Z]{0,4})\b/.exec(cell1);
    const oemInCell2 = /\b(\d{5,10}[A-Z]{0,4})\b/.exec(cell2);
    
    if (oemInCell1) {
      parts.push({ oem_number: oemInCell1[1], part_name: cell2 || `Díl ${oemInCell1[1]}` });
      potentialOems.delete(oemInCell1[1]);
    } else if (oemInCell2) {
      parts.push({ oem_number: oemInCell2[1], part_name: cell1 || `Díl ${oemInCell2[1]}` });
      potentialOems.delete(oemInCell2[1]);
    }
  }

  // Pattern 3: Lines with "part number" patterns
  const lines = markdown.split('\n');
  for (const line of lines) {
    const oemMatch = /\b(\d{5,10}[A-Z]{1,4})\b/.exec(line);
    if (oemMatch && !parts.find(p => p.oem_number === oemMatch[1])) {
      // Try to extract name from the same line
      const cleanLine = line.replace(oemMatch[0], '').replace(/[|*#\-]/g, '').trim();
      if (cleanLine.length > 2) {
        parts.push({ oem_number: oemMatch[1], part_name: cleanLine.substring(0, 100) });
        potentialOems.delete(oemMatch[1]);
      }
    }
  }

  // Add remaining potential OEMs without names
  for (const oem of potentialOems) {
    if (!parts.find(p => p.oem_number === oem)) {
      parts.push({ oem_number: oem, part_name: `Díl ${oem}` });
    }
  }

  return parts;
}

async function scrapeAndInsertParts(apiKey: string, supabase: any, cat: ScrapedCategory, categoryId: string): Promise<number> {
  if (!cat.url) return 0;
  
  try {
    const partsMarkdown = await firecrawlScrape(apiKey, cat.url);
    const parts = parsePartsFromMarkdown(partsMarkdown);
    
    if (parts.length === 0) return 0;

    const insertRows = parts.map(p => ({
      epc_category_id: categoryId,
      oem_number: p.oem_number,
      part_name: p.part_name,
      manufacturer: p.manufacturer || 'Mopar',
    }));

    // Batch insert
    const chunkSize = 200;
    let inserted = 0;
    for (let i = 0; i < insertRows.length; i += chunkSize) {
      const chunk = insertRows.slice(i, i + chunkSize);
      const { error } = await supabase.from('epc_part_links').insert(chunk);
      if (!error) inserted += chunk.length;
      else console.error(`Insert error for category ${cat.name}:`, error.message);
    }

    console.log(`Inserted ${inserted} parts for category: ${cat.name}`);
    return inserted;
  } catch (err) {
    console.error(`Failed to scrape parts for ${cat.name}:`, err);
    return 0;
  }
}
