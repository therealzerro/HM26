-- Fix RLS Security Policies for HitMaster
-- This script fixes the row-level security policy issues
-- Run this script in your Supabase SQL Editor to fix the RLS policies

-- First, disable RLS temporarily to clean up
ALTER TABLE public.slate_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.histories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_box DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_pair DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.percentile_maps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.horizon_blends DISABLE ROW LEVEL SECURITY;

-- Drop all existing policies (including any with different names)
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on all tables
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN ('slate_snapshots', 'imports', 'audit_logs', 'histories', 'datasets_box', 'datasets_pair', 'percentile_maps', 'horizon_blends')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
END $$;

-- Create new permissive policies that work with both authenticated and anonymous users
-- These policies allow all operations for all users (anon and authenticated)
CREATE POLICY "hitmaster_allow_all_slate_snapshots" ON public.slate_snapshots
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_imports" ON public.imports
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_audit_logs" ON public.audit_logs
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_histories" ON public.histories
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_datasets_box" ON public.datasets_box
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_datasets_pair" ON public.datasets_pair
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_percentile_maps" ON public.percentile_maps
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

CREATE POLICY "hitmaster_allow_all_horizon_blends" ON public.horizon_blends
  FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Re-enable RLS with the new policies
ALTER TABLE public.slate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_pair ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.percentile_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horizon_blends ENABLE ROW LEVEL SECURITY;

-- Grant comprehensive permissions to both anon and authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Grant specific permissions for views
GRANT SELECT ON public.v_latest_slate_snapshots TO anon, authenticated;
GRANT SELECT ON public.v_recent_ledger TO anon, authenticated;

-- Test the fix by inserting a test record
DO $$
DECLARE
  test_id uuid;
BEGIN
  -- Try to insert a test record to verify RLS is working (using valid scope)
  INSERT INTO public.slate_snapshots (
    scope, 
    snapshot_hash, 
    hash, 
    horizons_present_json,
    weights_json,
    top_k_straights_json,
    top_k_boxes_json,
    components_json
  ) VALUES (
    'midday', 
    'rls_test_hash_' || extract(epoch from now())::text, 
    'rls_test_hash_' || extract(epoch from now())::text,
    '{"H01Y": true, "H02Y": false}',
    '{"H01Y": 1.0}',
    '[{"combo": "999", "indicator": 0.99, "box": 0.88, "pburst": 0.77, "co": 0.66, "bestOrder": "straight", "multiplicity": "singles", "topPair": "99"}]',
    '[{"combo": "99", "indicator": 0.88, "box": 0.77, "pburst": 0.66, "co": 0.55}]',
    '[{"combo": "999", "components": {"BOX": 0.88, "PBURST": 0.77, "CO": 0.66}, "temperature": 99, "multiplicity": "singles", "topPair": "99", "indicator": 0.99}]'
  ) RETURNING id INTO test_id;
  
  RAISE NOTICE 'SUCCESS: RLS test insert successful with ID: %', test_id;
  
  -- Clean up test record
  DELETE FROM public.slate_snapshots WHERE id = test_id;
  
  RAISE NOTICE 'SUCCESS: RLS policies fixed and tested successfully';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAILED: RLS test insert failed: %', SQLERRM;
END $$;

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Final verification - show current policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE schemaname = 'public' 
ORDER BY tablename, policyname;

-- Show table permissions
SELECT 
  table_schema,
  table_name,
  privilege_type,
  grantee
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND grantee IN ('anon', 'authenticated')
ORDER BY table_name, grantee, privilege_type;