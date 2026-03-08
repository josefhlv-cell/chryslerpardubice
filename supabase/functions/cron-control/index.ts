const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action } = await req.json(); // 'status' | 'pause' | 'resume'

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Missing secrets' }, 500);
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'status') {
      const { data, error } = await supabase.rpc('get_cron_job_status');
      if (error) {
        // Fallback: try direct query
        const { data: fallback } = await supabase
          .from('api_cache')
          .select('data')
          .eq('cache_key', 'cron-sync-status')
          .single();
        return json({ active: fallback?.data?.active ?? true });
      }
      return json({ active: data ?? true });
    }

    if (action === 'pause') {
      // Unschedule the cron job
      const { error } = await supabase.rpc('manage_price_sync_cron', { p_action: 'pause' });
      if (error) throw error;
      return json({ success: true, active: false });
    }

    if (action === 'resume') {
      const { error } = await supabase.rpc('manage_price_sync_cron', { p_action: 'resume' });
      if (error) throw error;
      return json({ success: true, active: true });
    }

    return json({ error: 'Invalid action. Use: status, pause, resume' }, 400);
  } catch (e) {
    console.error('cron-control error:', e);
    return json({ error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
