// Long-running bulk price sync. Runs server-side independently of the client.
// Starts a "run" record, then iterates batches until done or until the function
// is about to time out, in which case it self-invokes to continue.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY =
  Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY')!;

const BATCH_SIZE = 200;
const MAX_RUNTIME_MS = 50_000; // self-relaunch before 60s edge timeout

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    const { action = 'start', mode = 'missing', runId: existingRunId, internal } = body;

    // ── action: continue (internal self-call, no auth) ──
    if (action === 'continue' && internal === true && existingRunId) {
      return await processRun(admin, existingRunId);
    }

    // ── action: start (admin only) ──
    if (action === 'start') {
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) return json({ error: 'Unauthorized' }, 401);

      const anon = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user } } = await anon.auth.getUser();
      if (!user) return json({ error: 'Unauthorized' }, 401);

      const { data: roleData } = await admin
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();
      if (!roleData) return json({ error: 'Forbidden' }, 403);

      // Auto-fail stuck runs (no update for >10 min)
      const staleCutoff = new Date(Date.now() - 10 * 60 * 1000).toISOString();
      await admin
        .from('price_sync_runs')
        .update({
          status: 'failed',
          last_error: 'Auto-cleared: stuck (no progress >10min)',
          finished_at: new Date().toISOString(),
        })
        .eq('status', 'running')
        .lt('updated_at', staleCutoff);

      // Check for already running (fresh)
      const { data: running } = await admin
        .from('price_sync_runs')
        .select('id, updated_at')
        .eq('status', 'running')
        .gte('updated_at', staleCutoff)
        .limit(1)
        .maybeSingle();
      if (running) {
        if (body.force === true) {
          await admin
            .from('price_sync_runs')
            .update({ status: 'failed', last_error: 'Force-cleared by admin', finished_at: new Date().toISOString() })
            .eq('id', running.id);
        } else {
          return json({ error: 'Sync již běží', runId: running.id }, 409);
        }
      }

      // Count target — pouze podporované zdroje
      const allowedSources = ['mopar', 'mopar_oem', 'csv', 'epc-link'];
      let targetCount = 0;
      if (mode === 'missing') {
        const { count } = await admin
          .from('parts_new')
          .select('id', { count: 'exact', head: true })
          .in('catalog_source', allowedSources)
          .neq('is_active', false)
          .or('price_with_vat.is.null,price_with_vat.eq.0');
        targetCount = count || 0;
      } else {
        const { count } = await admin
          .from('parts_new')
          .select('id', { count: 'exact', head: true })
          .in('catalog_source', allowedSources)
          .neq('is_active', false);
        targetCount = count || 0;
      }

      const { data: run, error: insErr } = await admin
        .from('price_sync_runs')
        .insert({
          mode,
          status: 'running',
          total_target: targetCount,
          started_by: user.id,
        })
        .select()
        .single();
      if (insErr) return json({ error: insErr.message }, 500);

      // Fire-and-forget self-call to begin processing
      selfInvoke(run.id).catch((e) => console.error('selfInvoke failed:', e));

      return json({ success: true, runId: run.id, totalTarget: targetCount });
    }

    return json({ error: 'Invalid action' }, 400);
  } catch (e) {
    console.error('bulk-price-sync error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

async function processRun(admin: any, runId: string): Promise<Response> {
  const startedAt = Date.now();

  const { data: run } = await admin
    .from('price_sync_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (!run || run.status !== 'running') {
    return json({ done: true, reason: 'not_running' });
  }

  let processedTotal = run.processed || 0;
  let updatedTotal = run.updated_count || 0;
  let errorTotal = run.error_count || 0;
  let lastError: string | null = run.last_error;

  while (Date.now() - startedAt < MAX_RUNTIME_MS) {
    // Pull next batch — POUZE Mopar/CSV/EPC-Link (7zap/makro nemají ceny na vernostsevyplaci.cz)
    let q = admin
      .from('parts_new')
      .select('id, oem_number, catalog_source')
      .in('catalog_source', ['mopar', 'mopar_oem', 'csv', 'epc-link'])
      .neq('is_active', false)
      .limit(BATCH_SIZE);
    if (run.mode === 'missing') {
      q = q.or('price_with_vat.is.null,price_with_vat.eq.0');
    } else {
      // mode 'all' — process oldest updated first
      q = q.order('last_price_update', { ascending: true, nullsFirst: true });
    }
    const { data: batch, error: batchErr } = await q;
    if (batchErr) {
      lastError = batchErr.message;
      errorTotal += 1;
      break;
    }
    if (!batch || batch.length === 0) {
      // Done
      await admin
        .from('price_sync_runs')
        .update({
          status: 'completed',
          processed: processedTotal,
          updated_count: updatedTotal,
          error_count: errorTotal,
          last_error: lastError,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
      await notifyAdmins(admin, runId, 'completed', processedTotal, updatedTotal);
      return json({ done: true, processed: processedTotal });
    }

    // Invoke the existing price-sync function for this batch (it does the actual scraping + DB update)
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/price-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE}`,
        },
        body: JSON.stringify({
          batchSize: batch.length,
          mode: 'auto', // skips JWT auth; explicit partNumbers override prioritization
          partNumbers: batch.map((b: any) => b.oem_number),
        }),
      });
      const result = await res.json().catch(() => ({}));
      processedTotal += batch.length;
      updatedTotal += result.updated || result.successCount || 0;
      if (result.errors) errorTotal += result.errors;
    } catch (e) {
      errorTotal += batch.length;
      lastError = e instanceof Error ? e.message : String(e);
    }

    // Persist progress every batch
    await admin
      .from('price_sync_runs')
      .update({
        processed: processedTotal,
        updated_count: updatedTotal,
        error_count: errorTotal,
        last_error: lastError,
      })
      .eq('id', runId);
  }

  // Time budget exhausted — relaunch self
  selfInvoke(runId).catch((e) => console.error('relaunch failed:', e));
  return json({ done: false, processed: processedTotal, relaunched: true });
}

async function selfInvoke(runId: string) {
  // Detached: don't await response in caller path
  await fetch(`${SUPABASE_URL}/functions/v1/bulk-price-sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify({ action: 'continue', internal: true, runId }),
  });
}

async function notifyAdmins(
  admin: any,
  runId: string,
  status: string,
  processed: number,
  updated: number,
) {
  try {
    const { data: admins } = await admin
      .from('user_roles')
      .select('user_id')
      .eq('role', 'admin');
    if (!admins?.length) return;

    const title = status === 'completed' ? '✅ Sync cen dokončen' : '⚠️ Sync cen selhal';
    const message = `Zpracováno ${processed} dílů, aktualizováno ${updated} cen.`;

    const rows = admins.map((a: any) => ({
      user_id: a.user_id,
      title,
      message,
    }));
    await admin.from('notifications').insert(rows);
    await admin.from('price_sync_runs').update({ notified: true }).eq('id', runId);
  } catch (e) {
    console.error('notifyAdmins failed:', e);
  }
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
