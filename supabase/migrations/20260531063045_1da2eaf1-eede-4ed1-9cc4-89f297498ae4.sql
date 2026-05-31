UPDATE public.auto_pipeline_queue
SET status = 'pending'
WHERE status = 'processing' AND created_at < now() - interval '10 minutes';