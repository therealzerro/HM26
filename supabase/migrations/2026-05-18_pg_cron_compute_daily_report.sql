-- 2026-05-18: pg_cron + pg_net enabled, compute-daily-report scheduled nightly.
-- Audit-follow-up Order 2 from docs/self_tuning_audit_2026-05-18.md §7.
--
-- After this migration:
--   • pg_cron 1.6.4 + pg_net 0.19.5 installed
--   • Vault secret 'cron_anon_key' holds anon JWT used by cron HTTP calls
--   • Cron job 'compute-daily-report-nightly' fires at 08:00 UTC daily
--     (= 04:00 EDT during DST, 03:00 EST in winter)
--   • Each fire computes the prior ET day's report via the
--     compute-daily-report edge function

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: if the secret already exists, vault.create_secret raises.
-- Use a DO block so re-applying this migration doesn't blow up.
DO $$
BEGIN
  PERFORM vault.create_secret(
    -- The anon JWT comes from app .env / EXPO_PUBLIC_SUPABASE_ANON_KEY.
    -- This is the public anon key, not the service role key. It satisfies
    -- the edge function's verify_jwt check; the function itself reads its
    -- own service_role_key from Deno.env for the privileged DB writes.
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRnYWdhcmh3cWJkY3dvcWhwYXBpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc4NjM4NDYsImV4cCI6MjA3MzQzOTg0Nn0.n78k9_hxxk8EjYpvzPaHxeiEMueZy_ZSkE4zsq2gmXM',
    'cron_anon_key',
    'Anon JWT used by pg_cron to call edge functions via pg_net'
  );
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'vault secret cron_anon_key already exists, skipping';
END $$;

-- Idempotency: unschedule existing job with this name if present, then re-create.
SELECT cron.unschedule('compute-daily-report-nightly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compute-daily-report-nightly');

SELECT cron.schedule(
  'compute-daily-report-nightly',
  '0 8 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/compute-daily-report',
    headers := jsonb_build_object(
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'date', to_char((now() AT TIME ZONE 'America/New_York' - INTERVAL '1 day')::date, 'YYYY-MM-DD')
    )
  ) AS request_id;
  $$
);

-- Verification queries:
--   SELECT * FROM cron.job WHERE jobname = 'compute-daily-report-nightly';
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
--   SELECT slate_date, scope, picks_count, hits_count, rate FROM engine_daily_report
--     ORDER BY slate_date DESC LIMIT 9;
