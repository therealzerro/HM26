-- COVERAGE-STALENESS-FIX (2026-06-24)
--
-- v_coverage_summary.latest_imported was MAX(datasets_*.created_at). The admin
-- import wizard (components/admin/ImportWizardView.tsx) writes box/pair coverage
-- via a pure upsert (Prefer: resolution=merge-duplicates) whose row payload omits
-- created_at, so ON CONFLICT DO UPDATE refreshes ds_raw/times_drawn but leaves
-- created_at frozen at the last delete+reinsert (the 2026-06-03 DATA-01 reset).
-- Net effect: the Coverage Matrix staleness badge showed every slice as 21+ days
-- stale even immediately after a successful re-import (false positive). The data
-- WAS fresh (engine reads ds_raw/times_drawn, not created_at).
--
-- Fix: source latest_imported from the imports log, which records a real timestamp
-- on every import (type, class_id, scope, horizon_label, created_at). COALESCE to
-- created_at so any slice lacking an import record keeps its prior reading. The
-- column set/order is unchanged, so CoverageMatrixView + any other reader is
-- unaffected.

CREATE OR REPLACE VIEW v_coverage_summary AS
 SELECT 'box'::text AS data_type,
    b.class_id,
    b.scope,
    b.horizon_label,
    count(*) AS row_count,
    max(b.last_seen) AS latest_seen,
    max(b.updated_at) AS last_updated,
    COALESCE(
      ( SELECT max(i.created_at) FROM imports i
         WHERE i.type = 'box_history' AND i.status = 'completed' AND i.deleted_at IS NULL
           AND i.class_id = b.class_id AND i.scope = b.scope AND i.horizon_label = b.horizon_label ),
      max(b.created_at)
    ) AS latest_imported
   FROM datasets_box b
  WHERE b.deleted_at IS NULL
  GROUP BY b.class_id, b.scope, b.horizon_label
UNION ALL
 SELECT 'pair'::text AS data_type,
    p.class_id,
    p.scope,
    p.horizon_label,
    count(*) AS row_count,
    max(p.last_seen) AS latest_seen,
    max(p.updated_at) AS last_updated,
    COALESCE(
      ( SELECT max(i.created_at) FROM imports i
         WHERE i.type = 'pair_history' AND i.status = 'completed' AND i.deleted_at IS NULL
           AND i.class_id = p.class_id AND i.scope = p.scope AND i.horizon_label = p.horizon_label ),
      max(p.created_at)
    ) AS latest_imported
   FROM datasets_pair p
  WHERE p.deleted_at IS NULL
  GROUP BY p.class_id, p.scope, p.horizon_label
  ORDER BY 1, 2, 3, 4;
