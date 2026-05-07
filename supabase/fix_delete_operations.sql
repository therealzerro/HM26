-- Fix: Ensure DELETE/UPDATE permissions work for all tables
-- Run this in Supabase SQL Editor if soft/hard delete or Clear Coverage buttons fail

-- 1. Ensure deleted_at columns exist on all tables that need them
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='imports' AND column_name='deleted_at') THEN
    ALTER TABLE public.imports ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='datasets_box' AND column_name='deleted_at') THEN
    ALTER TABLE public.datasets_box ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='datasets_pair' AND column_name='deleted_at') THEN
    ALTER TABLE public.datasets_pair ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='percentile_maps' AND column_name='deleted_at') THEN
    ALTER TABLE public.percentile_maps ADD COLUMN deleted_at timestamptz;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='horizon_blends' AND column_name='deleted_at') THEN
    ALTER TABLE public.horizon_blends ADD COLUMN deleted_at timestamptz;
  END IF;
END $$;

-- 2. Ensure the imports table has a status column with the correct constraint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='imports' AND column_name='status') THEN
    ALTER TABLE public.imports ADD COLUMN status text NOT NULL DEFAULT 'pending';
  END IF;
END $$;

-- 3. Enable RLS with permissive policies on all tables
ALTER TABLE public.imports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_box      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_pair     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.percentile_maps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horizon_blends    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slate_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histories         ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting policies, then create unified allow_all
DO $$ DECLARE pol RECORD; BEGIN
  FOR pol IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

CREATE POLICY allow_all ON public.imports           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.datasets_box      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.datasets_pair     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.percentile_maps   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.horizon_blends    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.audit_logs        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.slate_snapshots   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.histories         FOR ALL USING (true) WITH CHECK (true);

-- 4. Grant all permissions to anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports           TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_box      TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_pair     TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.percentile_maps   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.horizon_blends    TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs        TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slate_snapshots   TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.histories         TO anon, authenticated;

-- 5. Ensure v_coverage_summary view exists and grant select on it
CREATE OR REPLACE VIEW public.v_coverage_summary AS
SELECT 'box' AS data_type, class_id, scope, horizon_label,
       COUNT(*) AS row_count, MAX(last_seen) AS latest_seen, MAX(updated_at) AS last_updated
FROM public.datasets_box WHERE deleted_at IS NULL
GROUP BY class_id, scope, horizon_label
UNION ALL
SELECT 'pair', class_id, scope, horizon_label,
       COUNT(*), MAX(last_seen), MAX(updated_at)
FROM public.datasets_pair WHERE deleted_at IS NULL
GROUP BY class_id, scope, horizon_label
ORDER BY data_type, class_id, scope, horizon_label;

GRANT SELECT ON public.v_coverage_summary TO anon, authenticated;

-- 6. Force PostgREST to reload its schema cache
NOTIFY pgrst, 'reload schema';

-- Verification
SELECT tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('imports','datasets_box','datasets_pair','percentile_maps','horizon_blends')
ORDER BY tablename;
