const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const BACKUP_TABLES = [
  'profiles',
  'user_roles',
  'user_vehicles',
  'orders',
  'new_part_orders',
  'used_part_requests',
  'service_orders',
  'service_order_parts',
  'service_order_status_history',
  'service_bookings',
  'service_history',
  'service_plans',
  'service_checkins',
  'service_invoices',
  'mechanic_tasks',
  'mechanics',
  'employees',
  'notifications',
  'fault_reports',
  'parts_new',
  'parts_catalog',
  'price_history',
  'feature_flags',
  'vehicle_buyback_requests',
  'vehicle_import_requests',
  'vehicle_inquiries',
  'cars_for_sale',
  'vehicles',
  'ai_conversations',
  'epc_categories',
  'epc_part_links',
  'part_crossref',
  'part_supersessions',
  'service_procedures',
  'service_reviews',
  'admin_sessions',
];

const MAX_RETAINED_DAYS = 7;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return json({ error: 'Missing secrets' }, 500);
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');

    // ── Auth: require admin ──
    const authHeader = req.headers.get('Authorization');
    let isScheduled = false;

    if (authHeader === `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      // Internal server-to-server call from another backend function.
      isScheduled = true;
    } else if (!authHeader || authHeader === `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`) {
      // Could be a cron call — allow if no specific user needed
      isScheduled = true;
    } else {
      const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
      const anonClient = createClient(SUPABASE_URL, ANON_KEY!, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authErr } = await anonClient.auth.getUser();
      if (authErr || !user) {
        console.warn('[SECURITY] db-backup: UNAUTHORIZED_ACCESS_ATTEMPT');
        return json({ error: 'Unauthorized' }, 401);
      }

      const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      const { data: roleData } = await serviceClient
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      if (!roleData) {
        console.warn(`[SECURITY] db-backup: UNAUTHORIZED — user ${user.id}`);
        return json({ error: 'Forbidden' }, 403);
      }
    }

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'backup'; // 'backup' | 'list' | 'cleanup'

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    if (action === 'list') {
      const { data, error } = await supabase.storage
        .from('backups')
        .list('daily', { limit: 30, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      return json({ backups: data || [] });
    }

    if (action === 'cleanup') {
      return await cleanupOldBackups(supabase);
    }

    // ── BACKUP ──
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '-');
    const fileName = `daily/backup-${dateStr}_${timeStr}.json`;

    console.log(`[BACKUP_STARTED] ${fileName} — ${BACKUP_TABLES.length} tables`);

    const backupData: Record<string, any> = {
      _meta: {
        created_at: now.toISOString(),
        tables: BACKUP_TABLES.length,
        version: '1.0',
      },
    };

    let totalRows = 0;
    const errors: string[] = [];

    for (const table of BACKUP_TABLES) {
      try {
        // Fetch all rows (paginated for large tables)
        const allRows: any[] = [];
        let from = 0;
        const batchSize = 1000;
        let hasMore = true;

        while (hasMore) {
          const { data, error } = await supabase
            .from(table)
            .select('*')
            .range(from, from + batchSize - 1);

          if (error) {
            errors.push(`${table}: ${error.message}`);
            break;
          }

          if (data && data.length > 0) {
            allRows.push(...data);
            from += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        backupData[table] = allRows;
        totalRows += allRows.length;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        errors.push(`${table}: ${msg}`);
        console.error(`[BACKUP_TABLE_ERROR] ${table}: ${msg}`);
      }
    }

    backupData._meta.total_rows = totalRows;
    backupData._meta.errors = errors;

    // Upload to storage
    const jsonStr = JSON.stringify(backupData);
    const { error: uploadError } = await supabase.storage
      .from('backups')
      .upload(fileName, jsonStr, {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadError) {
      console.error(`[BACKUP_FAILED] Upload: ${uploadError.message}`);
      return json({ success: false, error: uploadError.message }, 500);
    }

    const sizeKB = Math.round(jsonStr.length / 1024);
    console.log(`[BACKUP_CREATED] ${fileName} — ${totalRows} rows, ${sizeKB} KB, ${errors.length} errors`);

    // Auto-cleanup old backups
    await cleanupOldBackups(supabase).catch((e) =>
      console.error('[BACKUP_CLEANUP_FAILED]', e)
    );

    return json({
      success: true,
      file: fileName,
      tables: BACKUP_TABLES.length,
      total_rows: totalRows,
      size_kb: sizeKB,
      errors: errors.length > 0 ? errors : undefined,
      scheduled: isScheduled,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error(`[BACKUP_FAILED] ${msg}`);
    return json({ success: false, error: msg }, 500);
  }
});

async function cleanupOldBackups(supabase: any) {
  const { data: files } = await supabase.storage
    .from('backups')
    .list('daily', { limit: 100, sortBy: { column: 'created_at', order: 'asc' } });

  if (!files || files.length <= MAX_RETAINED_DAYS) {
    return json({ cleaned: 0 });
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_RETAINED_DAYS);

  const toDelete = files.filter((f: any) => new Date(f.created_at) < cutoff);

  if (toDelete.length > 0) {
    const paths = toDelete.map((f: any) => `daily/${f.name}`);
    await supabase.storage.from('backups').remove(paths);
    console.log(`[BACKUP_CLEANUP] Removed ${toDelete.length} old backups`);
  }

  return json({ cleaned: toDelete.length });
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
