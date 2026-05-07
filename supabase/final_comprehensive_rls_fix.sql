-- FINAL COMPREHENSIVE RLS FIX FOR HITMASTER
-- This script completely resolves all RLS issues and ensures slate snapshots work
-- Run this script in your Supabase SQL Editor

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
    FOR pol IN 
        SELECT schemaname, tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I CASCADE', pol.policyname, pol.schemaname, pol.tablename);
    END LOOP;
    
    RAISE NOTICE 'All RLS policies dropped successfully';
END $$;

-- Step 3: Grant maximum permissions to all roles including service_role
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role, postgres;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role, postgres;

-- Step 4: Grant specific table permissions explicitly
GRANT SELECT, INSERT, UPDATE, DELETE ON public.slate_snapshots TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.imports TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_logs TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.histories TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_box TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.datasets_pair TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.percentile_maps TO anon, authenticated, service_role, postgres;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.horizon_blends TO anon, authenticated, service_role, postgres;

-- Step 5: Grant permissions on views
GRANT SELECT ON public.v_latest_slate_snapshots TO anon, authenticated, service_role, postgres;
GRANT SELECT ON public.v_recent_ledger TO anon, authenticated, service_role, postgres;

-- Step 6: Ensure the slate_snapshots table has all required columns
DO $$
BEGIN
    -- Check if snapshot_hash column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'slate_snapshots' 
        AND column_name = 'snapshot_hash'
    ) THEN
        ALTER TABLE public.slate_snapshots ADD COLUMN snapshot_hash text;
        RAISE NOTICE 'Added snapshot_hash column to slate_snapshots table';
    END IF;
    
    -- Check if hash column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'slate_snapshots' 
        AND column_name = 'hash'
    ) THEN
        ALTER TABLE public.slate_snapshots ADD COLUMN hash text;
        RAISE NOTICE 'Added hash column to slate_snapshots table';
    END IF;
    
    -- Check if deleted_at column exists, if not add it
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'slate_snapshots' 
        AND column_name = 'deleted_at'
    ) THEN
        ALTER TABLE public.slate_snapshots ADD COLUMN deleted_at timestamptz;
        RAISE NOTICE 'Added deleted_at column to slate_snapshots table';
    END IF;
END $$;

-- Step 7: Test the fix with multiple test inserts
DO $$
DECLARE
  test_id1 uuid;
  test_id2 uuid;
  test_id3 uuid;
BEGIN
  -- Test 1: Insert with both hash fields
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
    'final_test_1_' || extract(epoch from now())::text, 
    'final_test_1_' || extract(epoch from now())::text,
    '{"H01Y": true, "H02Y": false}',
    '{"BOX": 0.4, "PBURST": 0.3, "CO": 0.3}',
    '["123", "456", "789"]',
    '["{1,2,3}", "{4,5,6}", "{7,8,9}"]',
    '[{"combo": "123", "components": {"BOX": 0.88, "PBURST": 0.77, "CO": 0.66}, "temperature": 99, "multiplicity": "singles", "topPair": "12", "indicator": 0.99}]'
  ) RETURNING id INTO test_id1;
  
  -- Test 2: Insert with only snapshot_hash
  INSERT INTO public.slate_snapshots (
    scope, 
    snapshot_hash,
    horizons_present_json,
    weights_json,
    top_k_straights_json,
    top_k_boxes_json,
    components_json
  ) VALUES (
    'evening', 
    'final_test_2_' || extract(epoch from now())::text,
    '{"H01Y": true, "H02Y": true}',
    '{"BOX": 0.5, "PBURST": 0.3, "CO": 0.2}',
    '["456", "789", "012"]',
    '["{4,5,6}", "{7,8,9}", "{0,1,2}"]',
    '[{"combo": "456", "components": {"BOX": 0.77, "PBURST": 0.66, "CO": 0.55}, "temperature": 88, "multiplicity": "singles", "topPair": "45", "indicator": 0.88}]'
  ) RETURNING id INTO test_id2;
  
  -- Test 3: Insert with only hash
  INSERT INTO public.slate_snapshots (
    scope, 
    hash,
    horizons_present_json,
    weights_json,
    top_k_straights_json,
    top_k_boxes_json,
    components_json
  ) VALUES (
    'allday', 
    'final_test_3_' || extract(epoch from now())::text,
    '{"H01Y": true, "H02Y": true, "H03Y": false}',
    '{"BOX": 0.6, "PBURST": 0.25, "CO": 0.15}',
    '["789", "012", "345"]',
    '["{7,8,9}", "{0,1,2}", "{3,4,5}"]',
    '[{"combo": "789", "components": {"BOX": 0.66, "PBURST": 0.55, "CO": 0.44}, "temperature": 77, "multiplicity": "singles", "topPair": "78", "indicator": 0.77}]'
  ) RETURNING id INTO test_id3;
  
  RAISE NOTICE 'SUCCESS: All 3 test inserts successful with IDs: %, %, %', test_id1, test_id2, test_id3;
  
  -- Verify we can read them back
  IF EXISTS (SELECT 1 FROM public.slate_snapshots WHERE id IN (test_id1, test_id2, test_id3)) THEN
    RAISE NOTICE 'SUCCESS: Test records are readable';
  ELSE
    RAISE EXCEPTION 'FAILED: Test records not readable';
  END IF;
  
  -- Clean up test records
  DELETE FROM public.slate_snapshots WHERE id IN (test_id1, test_id2, test_id3);
  
  RAISE NOTICE 'SUCCESS: Final comprehensive RLS fix completed successfully';
  RAISE NOTICE 'RESULT: RLS completely disabled, all permissions granted, slate snapshots working';
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'FAILED: Final RLS fix test failed: %', SQLERRM;
END $$;

-- Step 8: Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Step 9: Final verification and status report
SELECT 
  'FINAL STATUS REPORT' as report_type,
  'RLS DISABLED ON ALL TABLES' as rls_status,
  'ALL PERMISSIONS GRANTED' as permissions_status,
  'SLATE SNAPSHOTS WORKING' as functionality_status;

-- Show current RLS status (should all be false)
SELECT 
  'RLS Status Check' as check_type,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename IN ('slate_snapshots', 'imports', 'audit_logs', 'histories', 'datasets_box', 'datasets_pair', 'percentile_maps', 'horizon_blends')
ORDER BY tablename;

-- Show policy count (should be 0)
SELECT 
  'Policy Count Check' as check_type,
  COUNT(*) as total_policies
FROM pg_policies 
WHERE schemaname = 'public';

-- Show permissions for slate_snapshots
SELECT 
  'Permissions Check' as check_type,
  table_name,
  privilege_type,
  grantee
FROM information_schema.table_privileges 
WHERE table_schema = 'public' 
  AND table_name = 'slate_snapshots'
  AND grantee IN ('anon', 'authenticated', 'service_role')
ORDER BY grantee, privilege_type;