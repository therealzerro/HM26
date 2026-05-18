-- 2026-05-18: pg_cron schedules generate-weight-proposal edge fn weekly.
-- Weight Proposal System Phase C (Option B path from audit follow-up).
-- Reference: docs/weight_proposal_system.md
--
-- The edge function runs G1 + G2 + G5 only (sample size, AUC, per-scope).
-- G3 (backtest) and G4 (divergence) are deliberately skipped because they
-- require the engine codebase which isn't ported to Deno. Proposals from
-- this scheduled run carry g3_status='skipped_edge' so the admin UI flags
-- them as "backtest not validated". Operators who want full G3 evidence
-- should run `npm run autotune:propose -- --manual` before approving
-- high-stakes proposals.
--
-- After this migration:
--   • Cron job 'generate-weight-proposal-weekly' fires Sunday at 09:00 UTC
--     (= 05:00 EDT during DST, 04:00 EST in winter)
--   • Each fire writes a weight_proposal_generated OR weight_proposal_blocked
--     audit_logs row carrying full gate results + apply_ops + revert_ops

-- Idempotency: unschedule existing job with this name if present, then re-create.
SELECT cron.unschedule('generate-weight-proposal-weekly')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generate-weight-proposal-weekly');

SELECT cron.schedule(
  'generate-weight-proposal-weekly',
  '0 9 * * 0',  -- Sunday 09:00 UTC = 05:00 EDT / 04:00 EST
  $$
  SELECT net.http_post(
    url := 'https://tgagarhwqbdcwoqhpapi.supabase.co/functions/v1/generate-weight-proposal',
    headers := jsonb_build_object(
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'cron_anon_key'),
      'Content-Type', 'application/json'
    ),
    body := jsonb_build_object()
  ) AS request_id;
  $$
);

-- Verification queries:
--   SELECT * FROM cron.job WHERE jobname = 'generate-weight-proposal-weekly';
--   SELECT id, status_code, content::text AS body, created
--     FROM net._http_response ORDER BY created DESC LIMIT 5;
--   SELECT id, action, created_at, payload_meta->>'gate_that_blocked' AS gate
--     FROM audit_logs
--     WHERE action IN ('weight_proposal_generated','weight_proposal_blocked')
--     ORDER BY created_at DESC LIMIT 5;
