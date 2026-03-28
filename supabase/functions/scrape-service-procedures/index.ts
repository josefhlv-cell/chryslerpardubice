const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

// Models with correct workshop-manuals.com slugs and engine variants
const CHRYSLER_MODELS = [
  { model: '300', slugs: [
    { slug: 'chrysler/300/v6-3.5l', engine: '3.5L V6', year: 2008 },
    { slug: 'chrysler/300/v6-3.5l_vin_g', engine: '3.5L V6', year: 2005 },
    { slug: 'chrysler/300/v6-3.6l', engine: '3.6L V6', year: 2011 },
    { slug: 'chrysler/300_srt-8/v8-6.1l', engine: '6.1L HEMI V8', year: 2008 },
    { slug: 'chrysler/300_srt-8/v8-6.1l_vin_w', engine: '6.1L HEMI V8', year: 2005 },
  ]},
  { model: 'Pacifica', slugs: [
    { slug: 'chrysler/pacifica/v6-3.8l', engine: '3.8L V6', year: 2008 },
    { slug: 'chrysler/pacifica/v6-3.8l_vin_l', engine: '3.8L V6', year: 2005 },
  ]},
  { model: 'Town & Country', slugs: [
    { slug: 'chrysler/town__country_awd/v6-3.8l_vin_l', engine: '3.8L V6 AWD', year: 2003 },
    { slug: 'chrysler/town__country_lwb_fwd/v6-3.3l_vin_3_flex_fuel', engine: '3.3L V6 FWD', year: 2001 },
    { slug: 'chrysler/town__country_lwb_fwd/v6-3.8l_vin_l', engine: '3.8L V6 FWD', year: 2002 },
  ]},
  { model: 'PT Cruiser', slugs: [
    { slug: 'chrysler/pt_cruiser/l4-2.4l', engine: '2.4L L4', year: 2008 },
    { slug: 'chrysler/pt_cruiser/l4-2.4l_turbo', engine: '2.4L Turbo', year: 2009 },
    { slug: 'chrysler/pt_cruiser/l4-2.4l_vin_b', engine: '2.4L L4', year: 2001 },
  ]},
  { model: 'Voyager', slugs: [
    { slug: 'chrysler/voyager/l4-2.4l_vin_b', engine: '2.4L L4', year: 2001 },
  ]},
  { model: 'Sebring', slugs: [
    { slug: 'chrysler/sebring_sedan/l4-2.4l', engine: '2.4L L4', year: 2007 },
    { slug: 'chrysler/sebring_sedan/v6-2.7l', engine: '2.7L V6', year: 2009 },
  ]},
];

// Technical data sections to scrape
const TECH_SECTIONS = [
  { category: 'Motor', path: 'engine_cooling_and_exhaust/engine/compression_check/system_information/specifications' },
  { category: 'Motor', path: 'engine_cooling_and_exhaust/engine/timing_belt_chain/component_information/service_and_repair' },
  { category: 'Převodovka', path: 'transmission_and_drivetrain/actuators_and_solenoids_transmission_and_drivetrain' },
  { category: 'Brzdy', path: 'brakes_and_traction_control/antilock_brakes/traction_control_systems' },
  { category: 'Odpružení', path: 'steering_and_suspension/alignment/system_information' },
  { category: 'Elektroinstalace', path: 'power_and_ground_distribution' },
  { category: 'Klimatizace', path: 'heating_and_air_conditioning' },
  { category: 'Řízení', path: 'steering_and_suspension' },
  { category: 'Startování', path: 'starting_and_charging' },
  { category: 'Karoserie', path: 'body_and_frame' },
  { category: 'Osvětlení', path: 'lighting_and_horns' },
  { category: 'Tempomat', path: 'cruise_control/cruise_control_module/component_information/specifications' },
  { category: 'Přístroje', path: 'instrument_panel_gauges_and_warning_indicators' },
  { category: 'Stěrače', path: 'wiper_and_washer_systems' },
];

// Diagram / wiring sections
const DIAGRAM_SECTIONS = [
  { category: 'Relé a moduly', path: 'relays_and_modules/relays_and_modules_powertrain_management/relays_and_modules_computers_and_control_systems/body_control_module/component_information/diagrams' },
  { category: 'Chlazení', path: 'relays_and_modules/relays_and_modules_cooling_system/radiator_cooling_fan_motor_relay/component_information/diagrams' },
  { category: 'Osvětlení', path: 'relays_and_modules/relays_and_modules_lighting_and_horns/interior_lighting_relay/component_information/diagrams' },
  { category: 'Startér', path: 'relays_and_modules/relays_and_modules_starting_and_charging/starter_relay/component_information/diagrams' },
  { category: 'Stěrače', path: 'relays_and_modules/relays_and_modules_wiper_and_washer_systems/wiper_relay/component_information/diagrams' },
  { category: 'Okna', path: 'relays_and_modules/relays_and_modules_windows_and_glass/heated_glass_element_relay/component_information/diagrams' },
  { category: 'Příslušenství', path: 'accessories_and_optional_equipment/accessory_delay_module/accessory_delay_relay/component_information/diagrams' },
];

// Original service procedure paths
const SERVICE_SECTIONS = [
  { category: 'Motor', path: 'engine_cooling_and_exhaust' },
  { category: 'Převodovka', path: 'transmission_and_drivetrain' },
  { category: 'Brzdy', path: 'brakes_and_traction_control' },
  { category: 'Odpružení', path: 'steering_and_suspension' },
  { category: 'Elektroinstalace', path: 'power_and_ground_distribution' },
  { category: 'Klimatizace', path: 'heating_and_air_conditioning' },
  { category: 'Chladící systém', path: 'engine_cooling_and_exhaust' },
  { category: 'Palivový systém', path: 'powertrain_management' },
  { category: 'Řízení', path: 'steering_and_suspension' },
  { category: 'Výfuk', path: 'engine_cooling_and_exhaust' },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require admin role
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
    const adminCheck = createAuthClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const { data: roleData } = await adminCheck.from('user_roles').select('role').eq('user_id', claimsData.claims.sub).eq('role', 'admin').maybeSingle();
    if (!roleData) {
      return new Response(JSON.stringify({ success: false, error: 'Forbidden: admin required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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
    const targetModel = body.model || null;
    const mode = body.mode || 'service'; // 'service' | 'technical' | 'diagrams'

    const models = targetModel
      ? CHRYSLER_MODELS.filter(m => m.model === targetModel)
      : CHRYSLER_MODELS;

    const sections = mode === 'technical' ? TECH_SECTIONS
      : mode === 'diagrams' ? DIAGRAM_SECTIONS
      : SERVICE_SECTIONS;

    const results: any[] = [];
    let savedCount = 0;

    for (const modelDef of models) {
      // Use first slug variant for the model (or all for tech data)
      const slugsToUse = mode === 'service' ? [modelDef.slugs[0]] : modelDef.slugs.slice(0, 2);

      for (const slugDef of slugsToUse) {
        for (const section of sections) {
          const url = `https://www.workshop-manuals.com/${slugDef.slug}/${section.path}/`;
          console.log(`[${mode}] Scraping: ${url}`);

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
              const status = scrapeResp.status;
              console.error(`Failed ${url}: ${status}`);
              if (status === 402) {
                return new Response(
                  JSON.stringify({ success: false, error: 'Nedostatek kreditů Firecrawl. Doplňte kredity.', savedCount, results }),
                  { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                );
              }
              results.push({ model: modelDef.model, engine: slugDef.engine, category: section.category, status: 'error', code: status });
              continue;
            }

            const scrapeData = await scrapeResp.json();
            const markdown = scrapeData.data?.markdown || scrapeData.markdown || '';

            if (!markdown || markdown.length < 100) {
              results.push({ model: modelDef.model, engine: slugDef.engine, category: section.category, status: 'empty' });
              continue;
            }

            // Parse sections from markdown
            const parsed = parseMarkdownSections(markdown);

            for (const sec of parsed) {
              const procedureType = mode === 'diagrams' ? 'wiring'
                : mode === 'technical' ? 'specification'
                : detectProcedureType(sec.title);

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
                  model: modelDef.model,
                  category: section.category,
                  title: `${sec.title} (${slugDef.engine}, ${slugDef.year})`,
                  content: sec.content,
                  source_url: url,
                  source: 'workshop-manuals',
                  procedure_type: procedureType,
                }),
              });

              if (insertResp.ok) savedCount++;
            }

            results.push({
              model: modelDef.model,
              engine: slugDef.engine,
              category: section.category,
              status: 'ok',
              sections: parsed.length,
              contentLength: markdown.length,
            });

          } catch (err) {
            console.error(`Error ${modelDef.model}/${section.category}:`, err);
            results.push({ model: modelDef.model, category: section.category, status: 'error', message: String(err) });
          }

          // Rate limit
          await new Promise(r => setTimeout(r, 800));
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, savedCount, results, mode }),
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
        const content = currentContent.join('\n').trim();
        if (content.length > 30) {
          sections.push({ title: currentTitle.trim(), content });
        }
      }
      currentTitle = headerMatch[1];
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  if (currentTitle && currentContent.length > 0) {
    const content = currentContent.join('\n').trim();
    if (content.length > 30) {
      sections.push({ title: currentTitle.trim(), content });
    }
  }

  if (sections.length === 0 && markdown.trim().length > 100) {
    sections.push({ title: 'Technická data', content: markdown.trim() });
  }

  return sections;
}

function detectProcedureType(title: string): string {
  const lower = title.toLowerCase();
  if (lower.includes('diagnos') || lower.includes('troubleshoot') || lower.includes('dtc')) return 'diagnostic';
  if (lower.includes('remov') || lower.includes('replac') || lower.includes('install')) return 'repair';
  if (lower.includes('inspect') || lower.includes('check') || lower.includes('test')) return 'inspection';
  if (lower.includes('specification') || lower.includes('torque') || lower.includes('capacity')) return 'specification';
  if (lower.includes('wiring') || lower.includes('diagram') || lower.includes('circuit') || lower.includes('relay')) return 'wiring';
  return 'repair';
}
