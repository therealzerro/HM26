-- ARCH-06 closure — pg_cron schedule for compute-slate-zk30
--
-- Closes the v1.0 build gap flagged in step 7: slate generation had no
-- automated trigger. Operator was regenerating manually via the admin
-- ZK30 scope buttons each morning.
--
-- Schedule: '0 13 * * 1-6' (Mon-Sat at 13:00 UTC).
--   EDT (Mar-Nov): 13:00 UTC = 09:00 ET — matches ARCH-06 spec exactly.
--   EST (Nov-Mar): 13:00 UTC = 08:00 ET — one hour earlier; acceptable
--                                          (still well before any draw).
--   No Sunday — ARCH-06 spec ("Mon-Sat only, no Sunday draws").
--
-- Body: { weightsKey: 'balanced', targetDate: <today_in_ET> }
--   - weightsKey 'balanced' is the only preset in ZK30 v1.0
--   - targetDate = today's ET date — engine computes today's slate
--
-- pg_cron + pg_net + vault secret pattern mirrors:
--   2026_05_25_zk30_hit_detection_cron.sql (step 6)
--   2026-05-18_pg_cron_compute_daily_report.sql (ZK6 template)
--
-- The `cron_anon_key` vault secret created by the ZK6 cron migration is
-- reused (no need to re-create). Idempotent: re-applying unschedules
-- and reschedules the job.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Idempotency: unschedule existing job with this name if present, then re-create.
SELECT cron.unschedule('compute-slate-zk30-daily')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compute-slate-zk30-daily');

SELECT cron.schedule(
  'compute-slate-zk30-daily',
  '0 13 * * 1-6',
  $$
  SELECT net.http_post(
    url := 'https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/compute-slate-zk30',
    headers := jsonb_build_object(
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object(
      'weightsKey', 'balanced',
      'targetDate', to_char((now() AT TIME ZONE 'America/New_York')::date, 'YYYY-MM-DD')
    )
  ) AS request_id;
  $$
);

-- Audit-log row.
INSERT INTO audit_logs (action, target, payload_meta)
VALUES (
  'arch_migration_applied',
  'arch-06-zk30-slate-gen-cron',
  jsonb_build_object(
    'arch_id', 'ARCH-06',
    'sub_step', 'closure',
    'jobname', 'compute-slate-zk30-daily',
    'schedule', '0 13 * * 1-6 (UTC) = 09:00 ET EDT / 08:00 ET EST, Mon-Sat',
    'fn', 'compute-slate-zk30',
    'body_targetDate_expr', '(now() AT TIME ZONE ''America/New_York'')::date',
    'closes_gap', 'step 7 operator-runbook gap — slate-gen was manual-only'
  )
);

-- Verification queries:
--   SELECT jobname, schedule, active FROM cron.job
--     WHERE jobname LIKE '%zk30%' ORDER BY jobname;
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
--   SELECT slate_date, snapshot_hash, jurisdiction, scope, mode, updated_at_et
--     FROM slate_snapshots_zk30 ORDER BY updated_at_et DESC LIMIT 5;
