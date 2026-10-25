-- SEC-05 residual (2026-10-25): ZK30 tables were still anon/public-writable.
-- Applied live via MCP apply_migration the same day (operator: "execute 1-4").
-- Client code only READS these tables (app/(tabs)/zk30.tsx, components/zk30/*);
-- every write goes through compute-slate-zk30 / run-hit-detection-zk30, which
-- use SUPABASE_SERVICE_ROLE_KEY (RLS-immune). The app has no Supabase Auth, so
-- the `authenticated` policies were dead weight too. SELECT stays public.
DROP POLICY IF EXISTS at_zk30_insert_anon ON public.adaptive_tracking_zk30;
DROP POLICY IF EXISTS at_zk30_insert_authenticated ON public.adaptive_tracking_zk30;
DROP POLICY IF EXISTS at_zk30_update_authenticated ON public.adaptive_tracking_zk30;
DROP POLICY IF EXISTS di_zk30_update_anon ON public.daily_intelligence_zk30;
DROP POLICY IF EXISTS di_zk30_update_authenticated ON public.daily_intelligence_zk30;
DROP POLICY IF EXISTS allow_all ON public.slate_snapshots_zk30;
CREATE POLICY ss_zk30_select_public ON public.slate_snapshots_zk30 FOR SELECT TO public USING (true);
-- Rollback (NOT recommended):
-- CREATE POLICY at_zk30_insert_anon ON public.adaptive_tracking_zk30 FOR INSERT TO anon WITH CHECK (true);
-- CREATE POLICY at_zk30_insert_authenticated ON public.adaptive_tracking_zk30 FOR INSERT TO authenticated WITH CHECK (true);
-- CREATE POLICY at_zk30_update_authenticated ON public.adaptive_tracking_zk30 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- CREATE POLICY di_zk30_update_anon ON public.daily_intelligence_zk30 FOR UPDATE TO anon USING (true) WITH CHECK (true);
-- CREATE POLICY di_zk30_update_authenticated ON public.daily_intelligence_zk30 FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
-- DROP POLICY ss_zk30_select_public ON public.slate_snapshots_zk30;
-- CREATE POLICY allow_all ON public.slate_snapshots_zk30 FOR ALL TO public USING (true) WITH CHECK (true);
