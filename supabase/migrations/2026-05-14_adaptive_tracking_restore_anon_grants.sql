-- 2026-05-14 — restore anon write access on public.adaptive_tracking
--
-- BUG: client-side hit detection (lib/hitDetection.ts:55-127) silently failed
-- against adaptive_tracking with HTTP 401 / SQLSTATE 42501
-- ("permission denied for table adaptive_tracking"). Schema (schema_complete_v21.sql:400,406)
-- defines `allow_all` policy + `GRANT ALL ... TO anon, authenticated` but the
-- live DB had lost the privileges. Edge-function writes still worked because
-- compute-slate-zk6 uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS + grants.
--
-- Impact: hit_box / hit_straight / matched_state were never set on AT primary
-- rows from 5/14 onward. Surfaces reading exclusively from adaptive_tracking
-- (Home todayHits strap, Home TODAY'S HITS cards, Slate Performance) all
-- showed 0 hits even when slate_snapshots + daily_intelligence had the
-- correct annotations. Verification-window 7-day ≥73% gate measurement
-- depended on this table — gate would have read empty.

-- 1. Policy — idempotent recreate
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'adaptive_tracking' AND policyname = 'allow_all'
  ) THEN
    EXECUTE 'CREATE POLICY allow_all ON public.adaptive_tracking FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

ALTER TABLE public.adaptive_tracking ENABLE ROW LEVEL SECURITY;

-- 2. Grants — restore full write access for anon + authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.adaptive_tracking TO anon, authenticated;

-- 3. Backfill 5/14 hits from daily_intelligence (which has them correctly).
--    Two rows: allday rank=1 826 (box hit DC midday 268), allday rank=3 926
--    (straight hit IN midday 926). IDs verified via REST query 5/14.
UPDATE public.adaptive_tracking
SET hit_box         = TRUE,
    hit_straight    = FALSE,
    actual_result   = '268',
    actual_set      = '{2,6,8}',
    matched_state   = 'DC',
    matched_session = 'midday',
    result_at       = NOW()
WHERE id = '849c967d-2c43-4ab8-8125-4fd2215dd884'
  AND hit_box IS NULL;

UPDATE public.adaptive_tracking
SET hit_box         = TRUE,
    hit_straight    = TRUE,
    actual_result   = '926',
    actual_set      = '{2,6,9}',
    matched_state   = 'IN',
    matched_session = 'midday',
    result_at       = NOW()
WHERE id = '04abfbf2-3834-4487-ad63-60e37958e854'
  AND hit_box IS NULL;
