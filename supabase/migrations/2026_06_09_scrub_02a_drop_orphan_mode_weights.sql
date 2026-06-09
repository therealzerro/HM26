-- SCRUB-02-A (2026-06-09): finishes SCRUB-01 (2026-05-27).
--
-- SCRUB-01 stopped the production engine from READING aggressive/conservative
-- weight rows but left them in app_config "for rollback safety until
-- 2026-06-03". That date passed 6 days ago.
--
-- Empirical verification (2026-06-09):
--   SELECT mode, COUNT(*) FROM daily_intelligence GROUP BY mode;
--     -> balanced: 4582 rows (since 2026-04-19)
--     -> aggressive: 0, conservative: 0
--   SELECT mode, COUNT(*) FROM slate_snapshots WHERE deleted_at IS NULL GROUP BY mode;
--     -> balanced: 156 rows (since 2026-04-18)
--     -> aggressive: 0, conservative: 0
--
-- These 8 rows are pure orphans. Production reads only:
--   * engine_weights_balanced (global fallback)
--   * engine_weights_balanced_${scope} (per-scope override)
--
-- Note: CONFIG-15 earlier today (CO 20->0 on evening) updated
-- engine_weights_aggressive_evening + engine_weights_conservative_evening
-- alongside engine_weights_balanced_evening. The two non-balanced UPDATEs
-- were wasted work — those rows had been orphan since SCRUB-01.

DELETE FROM app_config WHERE key IN (
  'engine_weights_aggressive',           -- global, orphan since SCRUB-01
  'engine_weights_conservative',         -- global, orphan since SCRUB-01
  'engine_weights_aggressive_allday',    -- per-scope, orphan since SCRUB-01
  'engine_weights_aggressive_midday',    -- per-scope, orphan since SCRUB-01
  'engine_weights_aggressive_evening',   -- per-scope, also wastefully updated in CONFIG-15
  'engine_weights_conservative_allday',  -- per-scope, orphan since SCRUB-01
  'engine_weights_conservative_midday',  -- per-scope, orphan since SCRUB-01
  'engine_weights_conservative_evening'  -- per-scope, also wastefully updated in CONFIG-15
);

-- Verification:
--   SELECT COUNT(*) FROM app_config;  -- expected: 46 (was 54)
--   SELECT COUNT(*) FROM app_config WHERE key LIKE 'engine_weights_%';
--     -- expected: 4 (engine_weights_balanced + balanced_allday/midday/evening)
