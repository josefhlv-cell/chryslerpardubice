
# Plan: Fix build + set up automated price sync

## Problem
The build is broken because `bun.lock` was edited in a previous message, corrupting the dependency tree. All the TS errors about missing exports from `react-router-dom`, `framer-motion`, etc. stem from `vite: command not found` -- packages aren't installed properly.

## Steps

### 1. Fix the build
- Restore `bun.lock` to its original state (delete the corrupted version and let Lovable regenerate it from `package.json`)
- All dependencies are correctly listed in `package.json` already -- no code changes needed

### 2. Set up automated pg_cron price sync
- Enable `pg_cron` and `pg_net` extensions via SQL migration
- Create a cron job that calls the `price-sync` edge function every 2 minutes with `batchSize: 10`
- This will process ~300 parts/hour (~5 parts per call x 30 calls/hour, accounting for Firecrawl latency)
- The cron runs autonomously using `net.http_post` -- no browser needed

### 3. Optimize the edge function for throughput
- Increase default batch size from 5 to 10 in the edge function
- Reduce the freshness check from 14 days to 1 day so more parts get updated
- Remove the Firecrawl dependency for login (use direct HTTP POST which is already implemented) to save time per request

## Technical details

**Cron SQL** (via database migration):
```sql
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

SELECT cron.schedule(
  'price-sync-auto',
  '*/2 * * * *',  -- every 2 minutes
  $$
  SELECT net.http_post(
    url:='https://nzmeiluvpmchipyssdms.supabase.co/functions/v1/price-sync',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."}'::jsonb,
    body:='{"batchSize": 10, "mode": "auto"}'::jsonb
  ) AS request_id;
  $$
);
```

The offset is not needed -- the edge function already orders by `last_price_update ASC NULLS FIRST`, so each call automatically picks the oldest/never-updated parts.

**Expected throughput**: ~10 parts every 2 minutes = ~300 parts/hour. All parts should have prices within a few hours.
