-- SEC-05 QW2 — advisor-backed DB hygiene (2026-06-10). All items reversible.
-- Applied to prod 2026-06-10 via MCP apply_migration (sec05_qw2_db_hygiene).

DROP INDEX IF EXISTS public.adaptive_hit_idx;

CREATE INDEX IF NOT EXISTS horizon_blends_import_id_idx ON public.horizon_blends (import_id);
CREATE INDEX IF NOT EXISTS percentile_maps_import_id_idx ON public.percentile_maps (import_id);

DROP POLICY IF EXISTS anon_update_daily_intelligence ON public.daily_intelligence;
DROP POLICY IF EXISTS anon_update_slate_snapshots ON public.slate_snapshots;

REVOKE EXECUTE ON FUNCTION public.calculate_hit_rates() FROM PUBLIC, anon, authenticated;
