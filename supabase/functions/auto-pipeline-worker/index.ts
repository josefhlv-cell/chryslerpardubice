/**
 * Auto-pipeline worker — processes auto_pipeline_queue.
 * Job types:
 *   - categorize: deterministic keyword classifier on part name
 *   - fetch_price: invokes price-sync for the OEM (vernostsevyplaci.cz)
 *   - match_compat: invokes compat-matcher for the part
 * Designed for cron (every 2 min) but also callable manually by admin.
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const KEYWORDS: Array<[RegExp, string]> = [
  [/brzd|destič|kotouč|třmen/i, 'Brzdové zařízení'],
  [/filtr/i, 'Filtry'],
  [/olej|kapalin|maziv|lubricant/i, 'Kapaliny a oleje'],
  [/tlumič|pružin|rameno|čep|silentblok/i, 'Odpružení'],
  [/výfuk|katalyz|lambda/i, 'Výfuk'],
  [/svíčk|cívk|zapal|zapalov/i, 'Elektroinstalace'],
  [/motor|píst|ventil|těsnění hlavy|rozvod|řemen/i, 'Motor'],
  [/převodov|spojk|olej převod/i, 'Převodovka'],
  [/chlad|chladič|termostat|vodní|antifreez/i, 'Chlazení'],
  [/palivov|čerpadlo paliv|tryska/i, 'Palivový systém'],
  [/řízení|tyč říz/i, 'Řízení'],
  [/karoser|nárazník|blatník|kapot|dveře/i, 'Karoserie'],
  [/světl|žárovk|reflektor|halogen/i, 'Osvětlení'],
  [/klima|chladič klim|kompresor klim/i, 'Klimatizace'],
  [/náprav|náboj kola|ložisko kola/i, 'Náprava'],
];

function classify(name: string): string | null {
  if (!name) return null;
  for (const [re, cat] of KEYWORDS) if (re.test(name)) return cat;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const admin = createClient(SUPABASE_URL, SERVICE);

    const url = new URL(req.url);
    const BATCH = Number(url.searchParams.get('batch') ?? '600');
    const CHUNK = Number(url.searchParams.get('chunk') ?? '50');     // OEMs per price-sync call
    const SEGMENTS = Number(url.searchParams.get('segments') ?? '8'); // parallel price-sync locks

    // Pull a batch of pending jobs
    const { data: jobs } = await admin
      .from('auto_pipeline_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(BATCH);

    if (!jobs?.length) return j({ success: true, processed: 0 });

    const ids = jobs.map((x: any) => x.id);
    await admin.from('auto_pipeline_queue').update({ status: 'processing', attempts: 1 }).in('id', ids);

    let done = 0, failed = 0;

    // ── Split jobs by type ─────────────────────────────────────────
    const priceJobs = jobs.filter((j: any) => j.job_type === 'fetch_price' && j.oem_number);
    const catJobs   = jobs.filter((j: any) => j.job_type === 'categorize' && j.part_id);
    const compatJobs = jobs.filter((j: any) => j.job_type === 'match_compat' && j.part_id);

    // ── 1) Categorize (cheap, local) — parallel ────────────────────
    await Promise.all(catJobs.map(async (job: any) => {
      try {
        const { data: p } = await admin.from('parts_new').select('name, category').eq('id', job.part_id).single();
        if (p && (!p.category || p.category === '')) {
          const cat = classify(p.name || '');
          if (cat) await admin.from('parts_new').update({ category: cat }).eq('id', job.part_id);
        }
        await admin.from('auto_pipeline_queue').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', job.id);
        done++;
      } catch (e: any) {
        await admin.from('auto_pipeline_queue').update({ status: 'failed', error_message: String(e?.message || e), processed_at: new Date().toISOString() }).eq('id', job.id);
        failed++;
      }
    }));

    // ── 2) Fetch price: chunk OEMs and call price-sync per segment lock ──
    // Build chunks of CHUNK OEMs and distribute across SEGMENTS parallel locks.
    const chunks: Array<{ jobs: any[]; segment: number }> = [];
    for (let i = 0; i < priceJobs.length; i += CHUNK) {
      chunks.push({ jobs: priceJobs.slice(i, i + CHUNK), segment: (chunks.length % SEGMENTS) });
    }

    // Group chunks by segment to serialize within a segment (lock-aware)
    const bySegment: Record<number, Array<{ jobs: any[]; segment: number }>> = {};
    for (const c of chunks) (bySegment[c.segment] ||= []).push(c);

    await Promise.all(Object.values(bySegment).map(async (segChunks) => {
      for (const c of segChunks) {
        const oems = c.jobs.map((x) => x.oem_number);
        let chunkOk = false;
        try {
          const resp = await fetch(`${SUPABASE_URL}/functions/v1/price-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE}` },
            body: JSON.stringify({ partNumbers: oems, mode: 'force', segment: c.segment, batchSize: oems.length }),
          });
          chunkOk = resp.ok;
        } catch { chunkOk = false; }

        const finalStatus = chunkOk ? 'done' : 'failed';
        await admin.from('auto_pipeline_queue')
          .update({ status: finalStatus, processed_at: new Date().toISOString(), error_message: chunkOk ? null : 'price-sync chunk failed' })
          .in('id', c.jobs.map((x) => x.id));
        if (chunkOk) done += c.jobs.length; else failed += c.jobs.length;
      }
    }));

    // ── 3) Match compat (lightweight, parallel) ────────────────────
    await Promise.all(compatJobs.map(async (job: any) => {
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/compat-matcher`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE}` },
          body: JSON.stringify({ part_id: job.part_id }),
        });
        await admin.from('auto_pipeline_queue').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', job.id);
        done++;
      } catch (e: any) {
        await admin.from('auto_pipeline_queue').update({ status: 'failed', error_message: String(e?.message || e), processed_at: new Date().toISOString() }).eq('id', job.id);
        failed++;
      }
    }));

    return j({ success: true, processed: jobs.length, done, failed, segments: SEGMENTS, chunk: CHUNK });
  } catch (e: any) {
    return j({ success: false, error: e?.message || String(e) }, 500);
  }
});

function j(d: any, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
