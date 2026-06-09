-- BUG-EDR-01 fix (2026-06-09)
-- engine_daily_report chronically under-counted hits because the 08:00 UTC
-- cron called compute-daily-report directly, reading whatever state of
-- daily_intelligence.hit_box/hit_straight existed at that moment. Hit
-- detection (run-hit-detection edge fn) was NOT triggered first by the cron
-- — so any hits that landed later in the day (when the operator ran the
-- Daily Workflow) never propagated back to engine_daily_report unless they
-- manually re-triggered Step 5.
--
-- Concrete example (2026-05-30 allday): canonical daily_intelligence shows
-- 4 any-hits; engine_daily_report.5/30 frozen at hits_count=2 (its 4am ET
-- snapshot), never refreshed.
--
-- Fix: split into TWO sequential cron jobs.
--   • 07:30 UTC — run-hit-detection for yesterday ET (gives 30 min headroom
--     for the edge fn to flag hits across all jurisdictions + scopes)
--   • 08:00 UTC — compute-daily-report for yesterday ET (now reads fresh
--     hit_box / hit_straight columns)
--
-- The existing 08:00 UTC job is replaced in-place via unschedule+schedule
-- (same name, same idempotency guard). The 07:30 UTC job is new.
--
-- vault.cron_anon_key reused from 2026-05-18_pg_cron_compute_daily_report.sql.

-- Idempotency: drop existing 'compute-daily-report-nightly' if present
SELECT cron.unschedule('compute-daily-report-nightly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'compute-daily-report-nightly');

-- Idempotency: drop existing 'run-hit-detection-nightly' if present (re-run safety)
SELECT cron.unschedule('run-hit-detection-nightly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'run-hit-detection-nightly');

-- 07:30 UTC: run-hit-detection for yesterday ET.
-- Fires 30 min before compute-daily-report so daily_intelligence has fresh
-- hit_box / hit_straight values to aggregate.
SELECT cron.schedule(
  'run-hit-detection-nightly',
  '30 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/run-hit-detection',
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

-- 08:00 UTC: compute-daily-report for yesterday ET (unchanged body, re-scheduled).
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

-- Verification:
--   SELECT jobname, schedule FROM cron.job WHERE jobname LIKE '%nightly%' ORDER BY schedule;
--   SELECT * FROM net._http_response ORDER BY created DESC LIMIT 5;
--   After 08:30 UTC tomorrow, compare:
--     SELECT slate_date, scope, hits_count FROM engine_daily_report WHERE slate_date = CURRENT_DATE - 1;
--     SELECT slate_date, scope, COUNT(*) FILTER (WHERE on_slate AND (hit_box OR hit_straight))
--       FROM daily_intelligence WHERE slate_date = CURRENT_DATE - 1 GROUP BY slate_date, scope;
--   Numbers should match.
