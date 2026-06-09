-- ENG-CFG-LEGACY cleanup (2026-06-09)
-- DELETE 13 app_config keys that have ZERO references in any *.ts / *.tsx /
-- *.sql file in the repo (verified 2026-06-09 by exhaustive grep). These are
-- remnants from older engine generations and credit/payment scaffolding
-- abandoned during the brand-voice / pricing pivot.
--
-- Keys retained (even when stale-looking) because they still have references:
--   • engine_preset, active_weight_preset's living cousin → engine_preset only
--   • burst_signal_on, drawing_confidence_on → still read by some surfaces
--   • app_version, zk6_version → version display
--   • auto_gen_slates, evening_gen_time, morning_gen_time → schedule UI
--   • pressure_bonus_weight → admin EngineConfigView read path
--
-- This DELETE is a no-op for engine math (none of the deleted keys are read
-- by engines/zk6.ts, lib/engineCore.ts, or supabase/functions/compute-slate-*).
-- Safety: BEGIN/COMMIT so all-or-nothing.

BEGIN;

DELETE FROM app_config WHERE key IN (
  'active_weight_preset',           -- superseded by engine_preset (zero refs)
  'auto_generate_slates',            -- typo'd dup of auto_gen_slates (zero refs)
  'burst_signal_enabled',            -- superseded by burst_signal_on (zero refs)
  'drawing_confidence_enabled',      -- superseded by drawing_confidence_on (zero refs)
  'evening_generation_time',         -- superseded by evening_gen_time (zero refs)
  'exclude_recent_hits',             -- cooldown handled via recent_hit_cooldown (zero refs)
  'free_regen_credits',              -- abandoned pricing scaffold (zero refs)
  'morning_generation_time',         -- superseded by morning_gen_time (zero refs)
  'plus_regen_credits',              -- abandoned pricing scaffold (zero refs)
  'pro_regen_credits',               -- abandoned pricing scaffold (zero refs)
  'recent_hit_exclusion_window',     -- superseded by recent_hit_window (also zero refs but deleted next)
  'recent_hit_window',               -- not read by engine (zero refs)
  'zk6_engine_version'               -- superseded by zk6_version (zero refs)
);

COMMIT;

-- Verification:
--   SELECT key, value, updated_at FROM app_config ORDER BY key;
--   Expected: 54 rows (down from 67).
