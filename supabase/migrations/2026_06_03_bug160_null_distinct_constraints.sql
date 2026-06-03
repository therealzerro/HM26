-- BUG-160 fix: switch unique constraints on datasets_box + datasets_pair
-- to NULLS NOT DISTINCT (PG15+) so the upsert resolver actually merges
-- rows whose jurisdiction column is NULL on both sides.
--
-- Background: Postgres default UNIQUE semantics treat NULL ≠ NULL, so
-- on_conflict=merge-duplicates silently INSERTed duplicate rows for
-- (class_id=1, jurisdiction IS NULL, same key). This was the technical
-- root cause of DATA-01 (2026-06-03): the 5/22 box-history rows didn't
-- merge with the 6/3 re-import, producing 1,220 rows per (scope ×
-- horizon) where 220 were expected.
--
-- After this change: any re-import of the same (class, scope, horizon, key,
-- NULL jurisdiction) row will MERGE not duplicate. Combined with the
-- ImportWizardView key-sort fix (same commit), every box re-import is
-- structurally safe regardless of file shape.
--
-- Verified 0 NULL-jurisdiction dupes exist before applying.
-- Applied 2026-06-03 via Supabase MCP apply_migration. See MASTER_AUDIT.md → BUG-160.

BEGIN;

ALTER TABLE public.datasets_box
  DROP CONSTRAINT datasets_box_unique;
ALTER TABLE public.datasets_box
  ADD CONSTRAINT datasets_box_unique
    UNIQUE NULLS NOT DISTINCT (class_id, scope, horizon_label, key, jurisdiction);

ALTER TABLE public.datasets_pair
  DROP CONSTRAINT datasets_pair_unique;
ALTER TABLE public.datasets_pair
  ADD CONSTRAINT datasets_pair_unique
    UNIQUE NULLS NOT DISTINCT (class_id, scope, horizon_label, key, jurisdiction);

COMMIT;
