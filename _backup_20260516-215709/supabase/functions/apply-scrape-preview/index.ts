/**
 * Applies a scrape_preview_jobs payload into parts_new.
 * Triggers the parts_new_after_insert pipeline (categorize/price/compat).
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    if (!authHeader.startsWith('Bearer ')) return j({ success: false, error: 'Unauthorized' }, 401);

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const ANON = Deno.env.get('SUPABASE_ANON_KEY')!;
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');

    const authClient = createClient(SUPABASE_URL, ANON, { global: { headers: { Authorization: authHeader } } });
    const { data: claims } = await authClient.auth.getClaims(authHeader.replace('Bearer ', ''));
    if (!claims?.claims?.sub) return j({ success: false, error: 'Unauthorized' }, 401);
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: role } = await admin.from('user_roles').select('role').eq('user_id', claims.claims.sub).eq('role', 'admin').maybeSingle();
    if (!role) return j({ success: false, error: 'Forbidden' }, 403);

    const { job_id, exclude_oems = [] } = await req.json();
    if (!job_id) return j({ success: false, error: 'job_id required' }, 400);

    const { data: job, error: jErr } = await admin.from('scrape_preview_jobs').select('*').eq('id', job_id).single();
    if (jErr || !job) return j({ success: false, error: 'Job not found' }, 404);
    if (job.status !== 'preview') return j({ success: false, error: `Job already ${job.status}` }, 400);

    await admin.from('scrape_preview_jobs').update({ status: 'applying' }).eq('id', job_id);

    const skip = new Set(exclude_oems.map((o: string) => o.toUpperCase()));
    const parts = (job.raw_payload as any[]).filter(p => p.oem && !skip.has(p.oem.toUpperCase()));
    const compat = `${job.brand} ${job.model}${job.engine ? ' ' + job.engine : ''}`.trim();

    let inserted = 0;
    for (let i = 0; i < parts.length; i += 100) {
      const chunk = parts.slice(i, i + 100).map(p => ({
        oem_number: String(p.oem).toUpperCase().replace(/[\s-]/g, ''),
        name: p.name || `Díl ${p.oem}`,
        category: p.category || null,
        compatible_vehicles: compat,
        catalog_source: job.source,
        price_with_vat: 0,
        manufacturer: 'Mopar',
      }));
      // upsert by oem_number — ignore conflicts (existing rows won't be touched)
      const { error, count } = await admin.from('parts_new').upsert(chunk, { onConflict: 'oem_number', ignoreDuplicates: true, count: 'exact' });
      if (!error) inserted += count || 0;
    }

    await admin.from('scrape_preview_jobs').update({
      status: 'applied',
      applied_count: inserted,
      applied_at: new Date().toISOString(),
    }).eq('id', job_id);

    return j({ success: true, inserted, total: parts.length });
  } catch (e: any) {
    return j({ success: false, error: e?.message || String(e) }, 500);
  }
});

function j(d: any, s = 200) { return new Response(JSON.stringify(d), { status: s, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
