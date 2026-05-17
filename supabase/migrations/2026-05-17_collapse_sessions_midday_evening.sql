-- BUG-148 (2026-05-17): collapse histories.session to two buckets.
--
-- Background
--   The parser previously emitted 4 session values (midday/evening/morning/
--   night). DE Play 3 Night IS Delaware's evening draw, just labeled "Night"
--   in source feeds, and the parser preserved that literal. The hit-detection
--   edge function's evening filter required session === 'evening', so DE Play
--   3 Night and similar (CT/ID/VA Night-labeled draws) silently missed every
--   hit on an evening-scope slate.
--
--   The 5/16 evening snapshot held a #2 pick of 912 and DE Night drew 912 —
--   a 6/6 straight that wasn't credited. See MASTER_AUDIT BUG-148.
--
-- Change
--   1. Widen unique index to include result_digits so 4-draw states (TX, GA,
--      DC, TN) keep both their genuine evening AND night draws as two rows
--      with session='evening' after the collapse.
--   2. Backfill morning→midday and night→evening. Pre-flight count showed
--      zero same-digit collisions (40 morning, 99 night, 0 dedupe deletes).
--   3. Tighten CHECK to ('midday','evening') only — the parser already
--      enforces this from now on; the constraint is the belt-and-suspenders.

BEGIN;

ALTER TABLE histories DROP CONSTRAINT histories_session_check;
-- histories_unique was a UNIQUE CONSTRAINT (not a bare index) — must drop
-- via ALTER TABLE, not DROP INDEX.
ALTER TABLE histories DROP CONSTRAINT histories_unique;
CREATE UNIQUE INDEX histories_unique
  ON histories (jurisdiction, game, date_et, session, result_digits);

UPDATE histories SET session = 'midday'  WHERE session = 'morning';
UPDATE histories SET session = 'evening' WHERE session = 'night';

ALTER TABLE histories ADD CONSTRAINT histories_session_check
  CHECK (session = ANY (ARRAY['midday'::text, 'evening'::text]));

COMMIT;
