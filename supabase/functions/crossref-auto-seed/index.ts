// crossref-auto-seed
// Periodically seeds part_crossref for Mopar OEM parts that still have no
// aftermarket alternatives. Used both manually (admin button) and via cron.
//
// Strategy:
//   1. Find Mopar OEMs in parts_new without any row in part_crossref.
//   2. Skip OEMs already failed >=3 times in crossref_seed_queue.
//   3. Push next chunk into queue (status=running).
//   4. Ask Lovable AI Gateway for verified aftermarket part numbers.
//   5. Insert resulting alternatives into part_crossref + log to catalog_event_log.
//
// Safe to call repeatedly — picks up where it left off.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

async function logEvent(sb: any, params: {
  level: 'info' | 'warn' | 'error';
  event: string;
  message?: string;
  details?: Record<string, unknown>;
  duration_ms?: number;
}) {
  try {
    await sb.from('catalog_event_log').insert({
      source: 'crossref-auto-seed',
      level: params.level,
      event: params.event,
      message: params.message ?? null,
      duration_ms: params.duration_ms ?? null,
      details: params.details ?? {},
    });
  } catch (_) { /* swallow */ }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAt = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const LOVABLE_AI_KEY = Deno.env.get('LOVABLE_API_KEY');

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const sb = createClient(SUPABASE_URL, SERVICE_KEY);

    // Parse body (optional overrides)
    let payload: any = {};
    try { payload = await req.json(); } catch (_) { /* empty body OK for cron */ }
    const limit = Math.min(Math.max(Number(payload.limit) || 25, 1), 100);
    const dryRun = payload.dryRun === true;

    if (!LOVABLE_AI_KEY && !dryRun) {
      return json({ success: false, error: 'LOVABLE_API_KEY missing' }, 500);
    }

    // 1. Stats: how many Mopar OEMs total / without crossref
    const { count: moparTotal } = await sb
      .from('parts_new')
      .select('id', { count: 'exact', head: true })
      .ilike('manufacturer', 'mopar');

    // 2. Pull a candidate batch (oem + name) - take a wide window for filtering
    const { data: candidates, error: candErr } = await sb
      .from('parts_new')
      .select('oem_number, name')
      .ilike('manufacturer', 'mopar')
      .not('oem_number', 'is', null)
      .order('updated_at', { ascending: false })
      .limit(limit * 8);

    if (candErr) return json({ success: false, error: `candidates: ${candErr.message}` }, 500);

    const oems = [...new Set((candidates || []).map((c: any) => c.oem_number).filter(Boolean))];
    if (!oems.length) {
      await logEvent(sb, { level: 'info', event: 'auto_seed_no_candidates' });
      return json({ success: true, processed: 0, inserted: 0, message: 'No Mopar OEMs found' });
    }

    // 3. Filter out OEMs that ALREADY have crossref (chunked .in())
    const haveCrossref = new Set<string>();
    for (let i = 0; i < oems.length; i += 100) {
      const chunk = oems.slice(i, i + 100);
      const { data } = await sb.from('part_crossref').select('oem_number').in('oem_number', chunk);
      (data || []).forEach((r: any) => haveCrossref.add(r.oem_number));
    }

    // 4. Filter out OEMs that already failed too many times in queue
    const { data: failedQueue } = await sb
      .from('crossref_seed_queue')
      .select('oem_number, attempts, status')
      .gte('attempts', 3);
    const skipFailed = new Set<string>((failedQueue || []).map((r: any) => r.oem_number));

    const candidateMap = new Map<string, string>();
    for (const c of candidates || []) {
      if (c.oem_number && !haveCrossref.has(c.oem_number) && !skipFailed.has(c.oem_number)) {
        if (!candidateMap.has(c.oem_number)) candidateMap.set(c.oem_number, c.name || '');
      }
    }
    const targets = [...candidateMap.entries()].slice(0, limit).map(([oem, name]) => ({ oem, name }));

    if (!targets.length) {
      await logEvent(sb, {
        level: 'info',
        event: 'auto_seed_done',
        message: 'All Mopar OEMs already covered or quarantined',
        details: { moparTotal, haveCrossref: haveCrossref.size, skipFailed: skipFailed.size },
      });
      return json({
        success: true,
        processed: 0,
        inserted: 0,
        moparTotal,
        haveCrossref: haveCrossref.size,
        skipFailed: skipFailed.size,
        message: 'No remaining candidates',
      });
    }

    // 5. Mark queue rows as running
    if (!dryRun) {
      const queueRows = targets.map((t) => ({
        oem_number: t.oem,
        part_name: t.name,
        status: 'running',
      }));
      await sb.from('crossref_seed_queue').upsert(queueRows, { onConflict: 'oem_number' });
    }

    if (dryRun) {
      return json({ success: true, dryRun: true, candidates: targets.length, sample: targets.slice(0, 5) });
    }

    // 6. Ask AI Gateway for cross-references
    const prompt = `You are an automotive parts cross-reference expert.
For each Mopar/Chrysler OEM number below return verified aftermarket equivalents from
known brands (Bosch, TRW, MANN, MAHLE, FILTRON, FEBI, Brembo, Ferodo, Textar, ATE,
Hella, Valeo, ACDelco, Delphi, Gates, Dayco, Monroe, Wagner, KYB, Moog, Dorman, NGK, Denso).

Rules:
- Only include real, verifiable part numbers you have HIGH confidence in.
- Skip if uncertain — return alts:[] for that OEM.
- Max 4 alternatives per OEM.
- Output JSON ONLY, no markdown, no explanations.

Format: {"results":[{"oem":"68191349AC","alts":[{"mfr":"MANN","pn":"HU712/8X"},{"mfr":"MAHLE","pn":"OX370D"}]}]}

OEM list (with name for context):
${targets.map((t) => `${t.oem} | ${t.name}`).join('\n')}`;

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
      const status = aiResp.status;
      // Bump attempts so we don't retry forever in this batch
      await sb.from('crossref_seed_queue')
        .update({ status: 'failed', last_error: `AI ${status}`, attempts: 1 })
        .in('oem_number', targets.map((t) => t.oem));
      await logEvent(sb, {
        level: 'error',
        event: 'auto_seed_ai_fail',
        message: `AI gateway returned ${status}`,
        details: { status, sample: errText.slice(0, 300) },
      });
      return json({
        success: false,
        error: status === 402 ? 'AI credits exhausted' : `AI gateway ${status}`,
        detail: errText.slice(0, 300),
      }, 502);
    }

    const aiData = await aiResp.json();
    const content = aiData?.choices?.[0]?.message?.content || '{}';

    let parsed: any = {};
    try {
      const cleaned = content.replace(/```json\s*|\s*```/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      await logEvent(sb, { level: 'error', event: 'auto_seed_parse_fail', details: { sample: content.slice(0, 200) } });
      return json({ success: false, error: 'AI returned non-JSON', raw: content.slice(0, 300) }, 502);
    }

    // 7. Build inserts
    const inserts: any[] = [];
    const perOemAdded: Record<string, number> = {};
    for (const r of parsed.results || []) {
      if (!r.oem || !Array.isArray(r.alts)) continue;
      perOemAdded[r.oem] = 0;
      for (const a of r.alts) {
        if (!a.mfr || !a.pn) continue;
        inserts.push({
          oem_number: String(r.oem).trim(),
          manufacturer: String(a.mfr).slice(0, 50),
          part_number: String(a.pn).slice(0, 100),
          source: 'ai-auto-seed',
          note: 'auto-seed batch',
        });
        perOemAdded[r.oem]++;
      }
    }

    // 8. Insert (batched, ignore conflicts manually)
    let inserted = 0;
    for (let i = 0; i < inserts.length; i += 200) {
      const chunk = inserts.slice(i, i + 200);
      const { error } = await sb.from('part_crossref').insert(chunk);
      if (!error) inserted += chunk.length;
    }

    // 8b. ZLATÉ PRAVIDLO: pokud aftermarket part_number existuje v parts_new,
    //     propaguj engine-specific kompatibilitu z Mopar OEM dílu na něj.
    //     Tím získáme přesné vehicle-mapping bez fuzzy guess.
    let propagated = 0;
    try {
      const moparOems = [...new Set(inserts.map((i) => i.oem_number))];
      const aftPartNumbers = [...new Set(inserts.map((i) => i.part_number))];

      const { data: moparParts } = await sb
        .from('parts_new')
        .select('id, oem_number, category')
        .in('oem_number', moparOems)
        .in('catalog_source', ['mopar', 'mopar_oem', '7zap']);

      const { data: aftParts } = await sb
        .from('parts_new')
        .select('id, oem_number, category')
        .in('oem_number', aftPartNumbers);

      const aftByPn = new Map<string, { id: string; category: string | null }>();
      for (const ap of aftParts || []) aftByPn.set(ap.oem_number, ap);

      for (const mp of moparParts || []) {
        const linkedPns = inserts.filter((i) => i.oem_number === mp.oem_number).map((i) => i.part_number);
        const aftIds = linkedPns.map((pn) => aftByPn.get(pn)?.id).filter(Boolean) as string[];
        if (aftIds.length === 0) continue;

        const { data: moparCompat } = await sb
          .from('catalog_vehicle_compatibility')
          .select('nextis_vehicle_id, brand, model, engine, year_from, year_to')
          .eq('part_id', mp.id);

        if (!moparCompat || moparCompat.length === 0) continue;

        const newRows: any[] = [];
        for (const aftId of aftIds) {
          if (mp.category) {
            await sb.from('parts_new').update({ category: mp.category }).eq('id', aftId);
          }
          for (const c of moparCompat) {
            newRows.push({
              part_id: aftId,
              nextis_vehicle_id: c.nextis_vehicle_id,
              brand: c.brand,
              model: c.model,
              engine: c.engine,
              year_from: c.year_from,
              year_to: c.year_to,
              is_oem: false,
              match_method: 'crossref-mopar',
              match_confidence: 95,
              source: 'manual',
            });
          }
        }
        for (let i = 0; i < newRows.length; i += 200) {
          const chunk = newRows.slice(i, i + 200);
          const { error: ce } = await sb.from('catalog_vehicle_compatibility').upsert(chunk, {
            onConflict: 'part_id,nextis_vehicle_id',
            ignoreDuplicates: true,
          });
          if (!ce) propagated += chunk.length;
        }
      }
    } catch (propErr) {
      await logEvent(sb, { level: 'warn', event: 'auto_seed_propagation_fail', message: (propErr as Error).message });
    }

    // 9. Update queue rows
    const updates = targets.map((t) => {
      const added = perOemAdded[t.oem] ?? 0;
      return {
        oem_number: t.oem,
        part_name: t.name,
        status: added > 0 ? 'done' : 'skipped',
        attempts: 1,
        alternatives_added: added,
        processed_at: new Date().toISOString(),
        last_error: added > 0 ? null : 'AI returned no verified alternatives',
      };
    });
    await sb.from('crossref_seed_queue').upsert(updates, { onConflict: 'oem_number' });

    const ms = Date.now() - startedAt;
    await logEvent(sb, {
      level: 'info',
      event: 'auto_seed_done',
      message: `Seeded ${inserted} crossrefs for ${targets.length} OEMs`,
      duration_ms: ms,
      details: {
        processed: targets.length,
        inserted,
        moparTotal,
        remainingWithoutCrossref: Math.max(0, (moparTotal || 0) - haveCrossref.size - targets.filter((t) => (perOemAdded[t.oem] ?? 0) > 0).length),
      },
    });

    return json({
      success: true,
      processed: targets.length,
      inserted,
      propagated,
      moparTotal,
      haveCrossref: haveCrossref.size,
      duration_ms: ms,
    });
  } catch (e) {
    return json({ success: false, error: (e as Error).message }, 500);
  }
});
