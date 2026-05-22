-- BUG: Coverage Matrix Box/Pair staleness alert was reading `last_updated`
-- (MAX(updated_at)), which the rebuild scripts refresh on every ds_raw
-- PATCH. That gave a false "0d fresh" reading after `npm run
-- rebuild:datasets -- --apply` even though the underlying CSV-imported
-- data (times_drawn, key, key_box) had not been re-imported.
--
-- Fix: add `latest_imported` = MAX(created_at) to v_coverage_summary.
-- created_at on datasets_box / datasets_pair rows reflects the actual
-- import insert event (rebuilds only PATCH, they do not re-insert).
--
-- Keep `last_updated` for backwards compat / engine-side diagnostics;
-- the React Coverage Matrix view now reads `latest_imported` for the
-- operator-facing staleness alert.

CREATE OR REPLACE VIEW v_coverage_summary AS
  SELECT 'box'::text AS data_type,
    datasets_box.class_id,
    datasets_box.scope,
    datasets_box.horizon_label,
    count(*) AS row_count,
    max(datasets_box.last_seen) AS latest_seen,
    max(datasets_box.updated_at) AS last_updated,
    max(datasets_box.created_at) AS latest_imported
  FROM datasets_box
  WHERE datasets_box.deleted_at IS NULL
  GROUP BY datasets_box.class_id, datasets_box.scope, datasets_box.horizon_label
UNION ALL
  SELECT 'pair'::text AS data_type,
    datasets_pair.class_id,
    datasets_pair.scope,
    datasets_pair.horizon_label,
    count(*) AS row_count,
    max(datasets_pair.last_seen) AS latest_seen,
    max(datasets_pair.updated_at) AS last_updated,
    max(datasets_pair.created_at) AS latest_imported
  FROM datasets_pair
  WHERE datasets_pair.deleted_at IS NULL
  GROUP BY datasets_pair.class_id, datasets_pair.scope, datasets_pair.horizon_label
  ORDER BY 1, 2, 3, 4;
