-- ARCH-06 step 6.2 — pg_cron schedule for run-hit-detection-zk30
--
-- Cron: '30 3 * * *' = 03:30 UTC. In EDT (Mar–Nov) this lands at 23:30 ET;
-- in EST (Nov–Mar) it lands at 22:30 ET. Both are post-Night draw (~22:00 ET).
-- Acceptable for v1.0; revisit if Morning-session hit visibility needs to
-- surface same-day.
--
-- Body: { date: <today_in_ET> } — the day whose 4 sessions just completed
-- and whose slate (generated at 09:00 ET) is now being scored.
--
-- pg_cron + pg_net + vault secret pattern mirrors
-- 2026-05-18_pg_cron_compute_daily_report.sql. The `cron_anon_key` vault
-- secret created by that earlier migration is reused (no need to re-create).
--
-- Idempotent: re-applying this migration unschedules+reschedules the job.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: unschedule existing job with this name if present, then re-create.
SELECT cron.unschedule('run-hit-detection-zk30-nightly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-hit-detection-zk30-nightly');

SELECT cron.schedule(
  'run-hit-detection-zk30-nightly',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/run-hit-detection-zk30',
    headers := jsonb_build_object(
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'date', to_char((now() AT TIME ZONE 'America/New_York')::date, 'YYYY-MM-DD')
    )
  ) AS request_id;
  $$
);

-- Audit-log row.
INSERT INTO audit_logs (action, target, payload_meta)
VALUES (
  'arch_migration_applied',
  'arch-06-zk30-hit-detection-cron',
  jsonb_build_object(
    'arch_id', 'ARCH-06',
    'sub_step', '6.2',
    'jobname', 'run-hit-detection-zk30-nightly',
    'schedule', '30 3 * * * (UTC) = 23:30 ET EDT / 22:30 ET EST',
    'fn', 'run-hit-detection-zk30',
    'body_date_expr', '(now() AT TIME ZONE ''America/New_York'')::date'
  )
);

-- Verification queries:
--   SELECT * FROM cron.job WHERE jobname = 'run-hit-detection-zk30-nightly';
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
--   SELECT date, scope, hits_found, run_source FROM hit_detection_runs
--     WHERE run_source = 'edge-zk30' ORDER BY run_at DESC LIMIT 5;
