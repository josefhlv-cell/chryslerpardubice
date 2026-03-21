const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { mode } = await req.json().catch(() => ({ mode: 'auto' }));

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Delete completed/cancelled orders older than 7 days (auto) or all completed (manual)
    const completedStatuses = ['vyrizena', 'zrusena', 'completed', 'cancelled', 'delivered', 'fulfilled'];

    let query = supabase
      .from('orders')
      .delete()
      .in('status', completedStatuses);

    if (mode === 'auto') {
      // Only delete orders older than 7 days for auto cleanup
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      query = query.lt('updated_at', sevenDaysAgo);
    }

    const { data, error, count } = await query.select('id');

    if (error) {
      console.error('Cleanup error:', error);
      return json({ success: false, error: error.message }, 500);
    }

    const deleted = data?.length || 0;
    console.log(`Cleanup ${mode}: deleted ${deleted} orders`);

    return json({ success: true, deleted, mode });
  } catch (e) {
    console.error('cleanup-orders error:', e);
    return json({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }, 500);
  }
});

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
