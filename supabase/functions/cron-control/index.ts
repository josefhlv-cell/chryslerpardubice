const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return json({ error: 'Missing secrets' }, 500);
    }

    // ── JWT + Admin role validation ──
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.warn('[SECURITY] cron-control: UNAUTHORIZED_ACCESS_ATTEMPT — no auth header');
      return json({ error: 'Unauthorized' }, 401);
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');

    // Verify JWT via anon client
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
    const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await anonClient.auth.getUser();

    if (authError || !user) {
      console.warn('[SECURITY] cron-control: UNAUTHORIZED_ACCESS_ATTEMPT — invalid JWT');
      return json({ error: 'Unauthorized' }, 401);
    }

    // Check admin role using service role client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: roleData } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!roleData) {
      console.warn(`[SECURITY] cron-control: UNAUTHORIZED_ACCESS_ATTEMPT — user ${user.id} is not admin`);
      return json({ error: 'Forbidden — admin role required' }, 403);
    }

    const { action } = await req.json(); // 'status' | 'pause' | 'resume'
    console.log(`[ADMIN_ACTION] cron-control: ${action} by user ${user.id}`);

    if (action === 'status') {
      const { data, error } = await supabase.rpc('get_cron_job_status');
      if (error) {
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
      const { error } = await supabase.rpc('manage_price_sync_cron', { p_action: 'pause' });
      if (error) {
        // Job might not exist — treat as already paused
        console.warn('cron pause error (job may not exist):', error.message);
        return json({ success: true, active: false, note: 'Job was not scheduled' });
      }
      return json({ success: true, active: false });
    }

    if (action === 'resume') {
      const { error } = await supabase.rpc('manage_price_sync_cron', { p_action: 'resume' });
      if (error) {
        console.error('cron resume error:', error);
        return json({ error: error.message }, 500);
      }
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
