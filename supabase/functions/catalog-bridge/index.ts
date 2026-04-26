// Catalog Bridge: applies AI re-classification + text-based vehicle compatibility matching
// Actions: 'reclassify' | 'compat-match' | 'compat-status'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KEYWORDS = [
  // brand+model patterns; matched against compatible_vehicles + name + description (lowercased)
  { brand: 'Chrysler', model: '300C', patterns: [/300\s*c\b/, /\b300c\b/] },
  { brand: 'Chrysler', model: 'Pacifica', patterns: [/pacifica/] },
  { brand: 'Chrysler', model: 'Voyager', patterns: [/voyager/, /grand\s*voyager/] },
  { brand: 'Chrysler', model: 'Town & Country', patterns: [/town\s*&?\s*country/] },
  { brand: 'Chrysler', model: 'Crossfire', patterns: [/crossfire/] },
  { brand: 'Chrysler', model: 'Sebring', patterns: [/sebring/] },
  { brand: 'Chrysler', model: 'PT Cruiser', patterns: [/pt\s*cruiser/] },
  { brand: 'Dodge', model: 'RAM', patterns: [/\bram\b/] },
  { brand: 'Dodge', model: 'Challenger', patterns: [/challenger/] },
  { brand: 'Dodge', model: 'Charger', patterns: [/\bcharger\b/] },
  { brand: 'Dodge', model: 'Durango', patterns: [/durango/] },
  { brand: 'Dodge', model: 'Journey', patterns: [/journey/] },
  { brand: 'Dodge', model: 'Nitro', patterns: [/nitro/] },
  { brand: 'Dodge', model: 'Caliber', patterns: [/caliber/] },
  { brand: 'Dodge', model: 'Avenger', patterns: [/avenger/] },
  { brand: 'Jeep', model: 'Grand Cherokee', patterns: [/grand\s*cherokee/] },
  { brand: 'Jeep', model: 'Cherokee', patterns: [/\bcherokee\b/] },
  { brand: 'Jeep', model: 'Wrangler', patterns: [/wrangler/] },
  { brand: 'Jeep', model: 'Compass', patterns: [/compass/] },
  { brand: 'Jeep', model: 'Renegade', patterns: [/renegade/] },
  { brand: 'Jeep', model: 'Patriot', patterns: [/patriot/] },
  { brand: 'Jeep', model: 'Commander', patterns: [/commander/] },
  { brand: 'RAM', model: '1500', patterns: [/ram\s*1500/, /\b1500\b/] },
  { brand: 'RAM', model: '2500', patterns: [/ram\s*2500/, /\b2500\b/] },
  { brand: 'RAM', model: '3500', patterns: [/ram\s*3500/, /\b3500\b/] },
  { brand: 'Lancia', model: 'Voyager', patterns: [/lancia.*voyager/] },
  { brand: 'Lancia', model: 'Thema', patterns: [/thema/] },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SR = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!SUPABASE_URL || !SR) return json({ error: 'Missing secrets' }, 500);

  // Auth: allow anon-key calls (gateway-validated) OR authenticated admin user
  const authHeader = req.headers.get('Authorization') || '';
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
  if (!token) return json({ error: 'Unauthorized', hint: 'no token' }, 401);

  // Decode JWT payload (no verify — gateway already verifies)
  let claims: any = {};
  try {
    const payload = token.split('.')[1];
    claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {}
  const role = claims.role || '';
  const userId = claims.sub || '';

  if (role !== 'anon' && role !== 'service_role') {
    if (!userId) return json({ error: 'Unauthorized', hint: 'no sub' }, 401);
    const sbCheck = createClient(SUPABASE_URL, SR);
    const { data: adminRow } = await sbCheck.from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
    if (!adminRow) return json({ error: 'Forbidden' }, 403);
  }

  const body = await req.json().catch(() => ({}));
  const action = body.action || 'compat-status';
  const sb = createClient(SUPABASE_URL, SR);

  if (action === 'reclassify') {
    const items: Array<{ id: string; category: string }> = body.items || [];
    if (!items.length) return json({ error: 'No items' }, 400);
    // group by category
    const byCat = new Map<string, string[]>();
    for (const it of items) {
      if (!it.id || !it.category) continue;
      if (!byCat.has(it.category)) byCat.set(it.category, []);
      byCat.get(it.category)!.push(it.id);
    }
    let updated = 0;
    const errors: string[] = [];
    for (const [cat, ids] of byCat) {
      const { error, count } = await sb.from('parts_new').update({ category: cat }).in('id', ids).select('id', { count: 'exact', head: true });
      if (error) errors.push(`${cat}: ${error.message}`);
      else updated += count || ids.length;
    }
    return json({ success: true, updated, categories: byCat.size, errors });
  }

  if (action === 'compat-match') {
    const offset = body.offset || 0;
    const limit = Math.min(body.limit || 500, 1000);

    // Load nextis vehicles once
    const { data: vehicles, error: vErr } = await sb.from('nextis_vehicles').select('id, brand, model, year_from, year_to');
    if (vErr) return json({ error: vErr.message }, 500);
    if (!vehicles?.length) return json({ error: 'No nextis_vehicles seeded' }, 400);

    // Build vehicle index: brand+model -> vehicle id (first match)
    const vIdx = new Map<string, string>();
    for (const v of vehicles) {
      const key = `${(v.brand || '').toLowerCase()}|${(v.model || '').toLowerCase()}`;
      if (!vIdx.has(key)) vIdx.set(key, v.id);
    }

    // Fetch parts batch
    const { data: parts, error: pErr } = await sb
      .from('parts_new')
      .select('id, name, description, compatible_vehicles, manufacturer, catalog_source')
      .range(offset, offset + limit - 1);
    if (pErr) return json({ error: pErr.message }, 500);

    const inserts: any[] = [];
    let scanned = 0;
    for (const p of parts || []) {
      scanned++;
      const text = `${p.compatible_vehicles || ''} ${p.name || ''} ${p.description || ''}`.toLowerCase();
      if (!text.trim()) continue;
      const isOem = (p.catalog_source || '').toLowerCase().includes('mopar');
      for (const k of KEYWORDS) {
        const matched = k.patterns.some((re) => re.test(text));
        if (!matched) continue;
        // additional brand check to reduce false positives
        if (!text.includes(k.brand.toLowerCase()) && k.brand !== 'RAM') continue;
        const vid = vIdx.get(`${k.brand.toLowerCase()}|${k.model.toLowerCase()}`);
        inserts.push({
          part_id: p.id,
          nextis_vehicle_id: vid || null,
          brand: k.brand,
          model: k.model,
          is_oem: isOem,
          match_method: 'text',
          match_confidence: vid ? 75 : 60,
          source: 'manual',
          notes: 'auto text-match',
        });
      }
    }

    let inserted = 0;
    if (inserts.length) {
      // Chunked insert (avoid huge payload)
      for (let i = 0; i < inserts.length; i += 500) {
        const chunk = inserts.slice(i, i + 500);
        const { error, count } = await sb.from('catalog_vehicle_compatibility').insert(chunk).select('id', { count: 'exact', head: true });
        if (!error) inserted += count || chunk.length;
      }
    }

    return json({
      success: true,
      offset, limit,
      scanned,
      matches_found: inserts.length,
      inserted,
      next_offset: scanned === limit ? offset + limit : null,
    });
  }

  if (action === 'compat-status') {
    const { count: partsCount } = await sb.from('parts_new').select('id', { count: 'exact', head: true });
    const { count: compatCount } = await sb.from('catalog_vehicle_compatibility').select('id', { count: 'exact', head: true });
    const { count: vehCount } = await sb.from('nextis_vehicles').select('id', { count: 'exact', head: true });
    const { count: crossCount } = await sb.from('part_crossref').select('id', { count: 'exact', head: true });
    return json({ parts: partsCount, compatibility_links: compatCount, nextis_vehicles: vehCount, crossrefs: crossCount });
  }

  // ---- AI CROSSREF BULK GENERATION ----
  // Generates aftermarket equivalents (Bosch/TRW/MANN/MAHLE/Brembo/Ferodo) for Mopar OEMs
  // using Lovable AI Gateway. Stores results into part_crossref.
  if (action === 'crossref-bulk') {
    const LOVABLE_AI_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_AI_KEY) return json({ error: 'LOVABLE_API_KEY missing' }, 500);

    const limit = Math.min(body.limit || 30, 50);
    const brand = body.brand || 'Chrysler';
    const model = body.model || 'Pacifica';

    // Pick top OEMs without crossref for the given vehicle
    const { data: compatRows, error: cErr } = await sb
      .from('catalog_vehicle_compatibility')
      .select('part_id')
      .ilike('brand', brand)
      .ilike('model', `%${model}%`);
    if (cErr) return json({ error: `compat lookup: ${cErr.message}` }, 500);

    const partIds = (compatRows || []).map((r: any) => r.part_id).filter(Boolean);
    if (!partIds.length) {
      return json({ success: true, processed: 0, inserted: 0, message: `No parts linked to ${brand} ${model}` });
    }

    const { data: parts, error: pErr } = await sb
      .from('parts_new')
      .select('oem_number, name, category')
      .in('id', partIds)
      .limit(500);
    if (pErr) return json({ error: pErr.message }, 500);
    if (!parts?.length) {
      return json({ success: true, processed: 0, inserted: 0, message: 'No parts found' });
    }

    // Filter out OEMs that already have crossref
    const oems = [...new Set(parts.map((p: any) => p.oem_number).filter(Boolean))];
    const { data: existing } = await sb.from('part_crossref').select('oem_number').in('oem_number', oems);
    const haveSet = new Set((existing || []).map((r: any) => r.oem_number));
    const targets = parts.filter((p: any) => p.oem_number && !haveSet.has(p.oem_number)).slice(0, limit);

    if (!targets.length) return json({ success: true, processed: 0, inserted: 0, message: 'All have crossref' });

    // Build prompt — ask AI for known aftermarket part numbers
    const prompt = `You are an automotive parts cross-reference expert. For each Mopar/Chrysler OEM number below, return the most common aftermarket equivalents (Bosch, TRW, MANN, MAHLE, FILTRON, FEBI, Brembo, Ferodo, Textar, ATE, Hella, Valeo, ACDelco, Delphi).

Rules:
- Only include real, verifiable part numbers you have high confidence in
- Skip if you don't know — return empty array
- Max 4 alternatives per OEM
- Output JSON ONLY, no markdown, no explanations

Format: {"results":[{"oem":"68191349AC","alts":[{"mfr":"MANN","pn":"HU712/8X"},{"mfr":"MAHLE","pn":"OX370D"}]}]}

OEM list (with name for context):
${targets.map((p: any) => `${p.oem_number} | ${p.name}`).join('\n')}`;

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_AI_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: 'You return only valid JSON with verified automotive cross-references.' },
          { role: 'user', content: prompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      return json({ error: 'AI gateway failed', status: aiResp.status, detail: errText.slice(0, 500) }, 502);
    }

    const aiData = await aiResp.json();
    const content = aiData?.choices?.[0]?.message?.content || '{}';
    let parsed: any = {};
    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      return json({ error: 'AI returned non-JSON', raw: content.slice(0, 500) }, 502);
    }

    const inserts: any[] = [];
    for (const r of parsed.results || []) {
      if (!r.oem || !Array.isArray(r.alts)) continue;
      for (const a of r.alts) {
        if (!a.mfr || !a.pn) continue;
        inserts.push({
          oem_number: r.oem,
          manufacturer: String(a.mfr).slice(0, 50),
          part_number: String(a.pn).slice(0, 100),
          source: 'ai-gemini',
          note: `${brand} ${model}`,
        });
      }
    }

    let inserted = 0;
    if (inserts.length) {
      // Insert in chunks; ignore conflicts
      for (let i = 0; i < inserts.length; i += 200) {
        const chunk = inserts.slice(i, i + 200);
        const { error, count } = await sb.from('part_crossref').insert(chunk).select('id', { count: 'exact', head: true });
        if (!error) inserted += count || chunk.length;
      }
    }

    return json({
      success: true,
      vehicle: `${brand} ${model}`,
      processed: targets.length,
      crossrefs_generated: inserts.length,
      inserted,
      sample: inserts.slice(0, 5),
    });
  }

  return json({ error: 'Unknown action' }, 400);
});

function json(d: any, s = 200) {
  return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
