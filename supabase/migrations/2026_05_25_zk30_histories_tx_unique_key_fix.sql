-- ARCH-06 Step 3a.0 — histories_tx unique-key correction
--
-- Step 1 deployed UNIQUE (date_et, session, result_digits, fireball). The
-- step 3 importer needs idempotent upserts keyed on the natural TX-domain
-- truth — exactly one Pick 3 draw per (date, session) — so the unique key
-- is narrowed to (date_et, session). This also matches the PostgREST
-- on_conflict spec needed by the importer; the prior 4-tuple would have
-- triggered the BUG-149 failure mode ("no unique or exclusion constraint
-- matching the ON CONFLICT specification").
--
-- Safe to run pre-import: histories_tx is empty (verified). Operator
-- corrections to result_digits or fireball after first import must go
-- through PATCH on the row, not through re-INSERT.

ALTER TABLE histories_tx
  DROP CONSTRAINT histories_tx_date_et_session_result_digits_fireball_key;

ALTER TABLE histories_tx
  ADD CONSTRAINT histories_tx_date_et_session_key UNIQUE (date_et, session);

-- No redundant non-unique index on (date_et, session) exists today:
--   idx_histories_tx_date    is on (date_et DESC)
--   idx_histories_tx_session is on (session, date_et DESC)
-- Both serve distinct query patterns; both kept.

INSERT INTO audit_logs (action, target, payload_meta)
VALUES (
  'arch_migration_applied',
  'arch-06-zk30-histories-tx-unique-key',
  jsonb_build_object(
    'arch_id', 'ARCH-06',
    'sub_step', '3a.0',
    'before', 'UNIQUE (date_et, session, result_digits, fireball)',
    'after',  'UNIQUE (date_et, session)',
    'rationale', 'natural TX-domain key; matches importer on_conflict spec'
  )
);
