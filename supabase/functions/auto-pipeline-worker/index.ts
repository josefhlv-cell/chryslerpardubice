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

    // Pull a batch of pending jobs
    const { data: jobs } = await admin
      .from('auto_pipeline_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100);

    if (!jobs?.length) return j({ success: true, processed: 0 });

    const ids = jobs.map((x: any) => x.id);
    await admin.from('auto_pipeline_queue').update({ status: 'processing', attempts: 1 }).in('id', ids);

    let done = 0, failed = 0;
    for (const job of jobs) {
      try {
        if (job.job_type === 'categorize' && job.part_id) {
          const { data: p } = await admin.from('parts_new').select('name, category').eq('id', job.part_id).single();
          if (p && (!p.category || p.category === '')) {
            const cat = classify(p.name || '');
            if (cat) await admin.from('parts_new').update({ category: cat }).eq('id', job.part_id);
          }
        } else if (job.job_type === 'fetch_price' && job.oem_number) {
          // Best-effort fire to price-sync
          await fetch(`${SUPABASE_URL}/functions/v1/price-sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE}` },
            body: JSON.stringify({ oem_number: job.oem_number, force: true }),
          }).catch(() => {});
        } else if (job.job_type === 'match_compat' && job.part_id) {
          await fetch(`${SUPABASE_URL}/functions/v1/compat-matcher`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE}` },
            body: JSON.stringify({ part_id: job.part_id }),
          }).catch(() => {});
        }
        await admin.from('auto_pipeline_queue').update({ status: 'done', processed_at: new Date().toISOString() }).eq('id', job.id);
        done++;
      } catch (e: any) {
        await admin.from('auto_pipeline_queue').update({
          status: 'failed', error_message: e?.message || String(e), processed_at: new Date().toISOString(),
        }).eq('id', job.id);
        failed++;
      }
    }

    return j({ success: true, processed: jobs.length, done, failed });
  } catch (e: any) {
    return j({ success: false, error: e?.message || String(e) }, 500);
  }
});

function j(d: any, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
