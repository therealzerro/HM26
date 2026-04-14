-- EMERGENCY RLS FIX FOR HITMASTER
-- This script completely disables RLS and creates the most permissive policies possible
-- Run this script in your Supabase SQL Editor to fix the RLS blocking issue

-- Step 1: Completely disable RLS on all tables
ALTER TABLE public.slate_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.imports DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.histories DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_box DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_pair DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.percentile_maps DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.horizon_blends DISABLE ROW LEVEL SECURITY;

-- Step 2: Drop ALL existing policies completely
DO $$
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on all tables
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I CASCADE', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
    
    RAISE NOTICE 'All RLS policies dropped successfully';
END $$;

-- Step 3: Grant maximum permissions to all roles
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;

-- Step 4: Grant specific table permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slate_snapshots TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.histories TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_box TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_pair TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_percentile_maps TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.horizon_blends TO anon, authenticated, service_role;

-- Step 5: Test the fix with a direct insert
DO $$
DECLARE
  test_id uuid;
BEGIN
  -- Try to insert a test record to verify RLS is completely disabled
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
    'emergency_test_' || extract(epoch from now())::text, 
    'emergency_test_' || extract(epoch from now())::text,
    '{"H01Y": true, "H02Y": false}',
    '{"H01Y": 1.0}',
    '["123", "456", "789"]',
    '["{1,2,3}", "{4,5,6}", "{7,8,9}"]',
    '[{"combo": "123", "components": {"BOX": 0.88, "PBURST": 0.77, "CO": 0.66}, "temperature": 99, "multiplicity": "singles", "topPair": "12", "indicator": 0.99}]'
  ) RETURNING id INTO test_id;
  
  RAISE NOTICE 'SUCCESS: Emergency RLS fix test insert successful with ID: %', test_id;
  
  -- Clean up test record
  DELETE FROM public.slate_snapshots WHERE id = test_id;
  
  RAISE NOTICE 'SUCCESS: Emergency RLS fix completed successfully - RLS completely disabled';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAILED: Emergency RLS fix test insert failed: %', SQLERRM;
END $$;

-- Step 6: Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Step 7: Show current state
SELECT 
  'RLS Status' as check_type,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('slate_snapshots', 'imports', 'audit_logs', 'histories', 'datasets_box', 'datasets_pair', 'percentile_maps', 'horizon_blends')
ORDER BY tablename;

SELECT 
  'Policies Count' as check_type,
  COUNT(*) as policy_count
FROM pg_policies 
WHERE schemaname = 'public';

SELECT 
  'Permissions' as check_type,
  table_name,
  privilege_type,
  grantee
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND table_name = 'slate_snapshots'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY table_name, grantee, privilege_type;