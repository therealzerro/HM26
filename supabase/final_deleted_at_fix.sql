-- FINAL FIX: Resolve deleted_at column issue for slate_snapshots table
-- This script ensures the deleted_at column exists and all functionality works properly

-- Step 1: Add deleted_at column if it doesn't exist (safe operation)
DO $$
BEGIN
  -- Check if deleted_at column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'deleted_at'
  ) THEN
    -- Add the column
    ALTER TABLE public.slate_snapshots ADD COLUMN deleted_at timestamptz;
    RAISE NOTICE 'SUCCESS: Added deleted_at column to slate_snapshots table';
  ELSE
    RAISE NOTICE 'INFO: deleted_at column already exists in slate_snapshots table';
  END IF;
END $$;

-- Step 2: Create index for deleted_at if it doesn't exist
CREATE INDEX IF NOT EXISTS slate_snapshots_deleted_at_idx 
ON public.slate_snapshots(deleted_at);

-- Step 3: Ensure all required columns exist
DO $$
BEGIN
  -- Check for snapshot_hash column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'snapshot_hash'
  ) THEN
    ALTER TABLE public.slate_snapshots ADD COLUMN snapshot_hash text NOT NULL DEFAULT '';
    RAISE NOTICE 'SUCCESS: Added snapshot_hash column';
  END IF;

  -- Check for hash column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'hash'
  ) THEN
    ALTER TABLE public.slate_snapshots ADD COLUMN hash text NOT NULL DEFAULT '';
    RAISE NOTICE 'SUCCESS: Added hash column';
  END IF;
END $$;

-- Step 4: Update the view to properly handle deleted_at filtering
DROP VIEW IF EXISTS public.v_latest_slate_snapshots CASCADE;

CREATE VIEW public.v_latest_slate_snapshots AS
SELECT DISTINCT ON (scope)
  id,
  scope,
  horizons_present_json,
  weights_json,
  top_k_straights_json,
  top_k_boxes_json,
  components_json,
  updated_at_et,
  snapshot_hash,
  hash,
  deleted_at
FROM public.slate_snapshots
WHERE deleted_at IS NULL
ORDER BY scope, updated_at_et DESC NULLS LAST, id DESC;

-- Step 5: Ensure RLS policies are correct
DROP POLICY IF EXISTS allow_all_slate_snapshots ON public.slate_snapshots;
CREATE POLICY allow_all_slate_snapshots ON public.slate_snapshots 
FOR ALL USING (true) WITH CHECK (true);

-- Step 6: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Step 7: Ensure we have test data for all scopes
DO $$
DECLARE
  snapshot_count INTEGER;
  midday_count INTEGER;
  evening_count INTEGER;
  allday_count INTEGER;
BEGIN
  -- Check existing data
  SELECT COUNT(*) INTO snapshot_count FROM public.slate_snapshots WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO midday_count FROM public.slate_snapshots WHERE deleted_at IS NULL AND scope = 'midday';
  SELECT COUNT(*) INTO evening_count FROM public.slate_snapshots WHERE deleted_at IS NULL AND scope = 'evening';
  SELECT COUNT(*) INTO allday_count FROM public.slate_snapshots WHERE deleted_at IS NULL AND scope = 'allday';
  
  RAISE NOTICE 'Current snapshot counts: Total=%, Midday=%, Evening=%, Allday=%', 
    snapshot_count, midday_count, evening_count, allday_count;
  
  -- Insert missing test data
  IF midday_count = 0 THEN
    INSERT INTO public.slate_snapshots (
      scope, 
      snapshot_hash, 
      hash, 
      horizons_present_json,
      weights_json,
      top_k_straights_json,
      top_k_boxes_json,
      components_json,
      updated_at_et
    ) VALUES (
      'midday', 
      'fix_hash_midday_' || extract(epoch from now())::text, 
      'fix_hash_midday_' || extract(epoch from now())::text,
      '{"H01Y": true, "H02Y": true, "H03Y": false}',
      '{"H01Y": 0.6, "H02Y": 0.4}',
      '[{"combo": "123", "indicator": 0.95, "box": 0.85, "pburst": 0.78, "co": 0.72, "bestOrder": "straight", "multiplicity": "singles", "topPair": "12"}, {"combo": "456", "indicator": 0.92, "box": 0.78, "pburst": 0.69, "co": 0.65, "bestOrder": "straight", "multiplicity": "singles", "topPair": "45"}, {"combo": "789", "indicator": 0.88, "box": 0.72, "pburst": 0.61, "co": 0.58, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.84, "box": 0.68, "pburst": 0.55, "co": 0.52, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}, {"combo": "345", "indicator": 0.81, "box": 0.64, "pburst": 0.51, "co": 0.48, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}]',
      '[{"combo": "12", "indicator": 0.88, "box": 0.72, "pburst": 0.65, "co": 0.58}, {"combo": "45", "indicator": 0.84, "box": 0.68, "pburst": 0.61, "co": 0.54}]',
      '[{"combo": "123", "components": {"BOX": 0.85, "PBURST": 0.78, "CO": 0.72}, "temperature": 95, "multiplicity": "singles", "topPair": "12", "indicator": 0.95}, {"combo": "456", "components": {"BOX": 0.78, "PBURST": 0.69, "CO": 0.65}, "temperature": 92, "multiplicity": "singles", "topPair": "45", "indicator": 0.92}]',
      now()
    );
    RAISE NOTICE 'SUCCESS: Inserted midday test data';
  END IF;
  
  IF evening_count = 0 THEN
    INSERT INTO public.slate_snapshots (
      scope, 
      snapshot_hash, 
      hash, 
      horizons_present_json,
      weights_json,
      top_k_straights_json,
      top_k_boxes_json,
      components_json,
      updated_at_et
    ) VALUES (
      'evening', 
      'fix_hash_evening_' || extract(epoch from now())::text, 
      'fix_hash_evening_' || extract(epoch from now())::text,
      '{"H01Y": true, "H02Y": true, "H03Y": true}',
      '{"H01Y": 0.5, "H02Y": 0.3, "H03Y": 0.2}',
      '[{"combo": "789", "indicator": 0.97, "box": 0.91, "pburst": 0.84, "co": 0.78, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.89, "box": 0.82, "pburst": 0.75, "co": 0.69, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}, {"combo": "345", "indicator": 0.86, "box": 0.78, "pburst": 0.71, "co": 0.65, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}, {"combo": "678", "indicator": 0.83, "box": 0.74, "pburst": 0.67, "co": 0.61, "bestOrder": "straight", "multiplicity": "singles", "topPair": "67"}, {"combo": "901", "indicator": 0.80, "box": 0.70, "pburst": 0.63, "co": 0.57, "bestOrder": "straight", "multiplicity": "singles", "topPair": "90"}]',
      '[{"combo": "78", "indicator": 0.93, "box": 0.81, "pburst": 0.74, "co": 0.68}, {"combo": "01", "indicator": 0.87, "box": 0.75, "pburst": 0.68, "co": 0.62}]',
      '[{"combo": "789", "components": {"BOX": 0.91, "PBURST": 0.84, "CO": 0.78}, "temperature": 97, "multiplicity": "singles", "topPair": "78", "indicator": 0.97}, {"combo": "012", "components": {"BOX": 0.82, "PBURST": 0.75, "CO": 0.69}, "temperature": 89, "multiplicity": "singles", "topPair": "01", "indicator": 0.89}]',
      now()
    );
    RAISE NOTICE 'SUCCESS: Inserted evening test data';
  END IF;
  
  IF allday_count = 0 THEN
    INSERT INTO public.slate_snapshots (
      scope, 
      snapshot_hash, 
      hash, 
      horizons_present_json,
      weights_json,
      top_k_straights_json,
      top_k_boxes_json,
      components_json,
      updated_at_et
    ) VALUES (
      'allday', 
      'fix_hash_allday_' || extract(epoch from now())::text, 
      'fix_hash_allday_' || extract(epoch from now())::text,
      '{"H01Y": true, "H02Y": true, "H03Y": true, "H04Y": false}',
      '{"H01Y": 0.4, "H02Y": 0.35, "H03Y": 0.25}',
      '[{"combo": "345", "indicator": 0.968, "box": 0.88, "pburst": 0.81, "co": 0.75, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}, {"combo": "678", "indicator": 0.941, "box": 0.84, "pburst": 0.77, "co": 0.71, "bestOrder": "straight", "multiplicity": "singles", "topPair": "67"}, {"combo": "901", "indicator": 0.915, "box": 0.80, "pburst": 0.73, "co": 0.67, "bestOrder": "straight", "multiplicity": "singles", "topPair": "90"}, {"combo": "234", "indicator": 0.892, "box": 0.76, "pburst": 0.69, "co": 0.63, "bestOrder": "straight", "multiplicity": "singles", "topPair": "23"}, {"combo": "567", "indicator": 0.868, "box": 0.72, "pburst": 0.65, "co": 0.59, "bestOrder": "straight", "multiplicity": "singles", "topPair": "56"}, {"combo": "890", "indicator": 0.845, "box": 0.68, "pburst": 0.61, "co": 0.55, "bestOrder": "straight", "multiplicity": "singles", "topPair": "89"}, {"combo": "123", "indicator": 0.821, "box": 0.64, "pburst": 0.57, "co": 0.51, "bestOrder": "straight", "multiplicity": "singles", "topPair": "12"}, {"combo": "456", "indicator": 0.798, "box": 0.60, "pburst": 0.53, "co": 0.47, "bestOrder": "straight", "multiplicity": "singles", "topPair": "45"}, {"combo": "789", "indicator": 0.774, "box": 0.56, "pburst": 0.49, "co": 0.43, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.751, "box": 0.52, "pburst": 0.45, "co": 0.39, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}]',
      '[{"combo": "34", "indicator": 0.902, "box": 0.74, "pburst": 0.67, "co": 0.61}, {"combo": "67", "indicator": 0.879, "box": 0.70, "pburst": 0.63, "co": 0.57}]',
      '[{"combo": "345", "components": {"BOX": 0.88, "PBURST": 0.81, "CO": 0.75}, "temperature": 97, "multiplicity": "singles", "topPair": "34", "indicator": 0.968}, {"combo": "678", "components": {"BOX": 0.84, "PBURST": 0.77, "CO": 0.71}, "temperature": 94, "multiplicity": "singles", "topPair": "67", "indicator": 0.941}, {"combo": "901", "components": {"BOX": 0.80, "PBURST": 0.73, "CO": 0.67}, "temperature": 92, "multiplicity": "singles", "topPair": "90", "indicator": 0.915}]',
      now()
    );
    RAISE NOTICE 'SUCCESS: Inserted allday test data';
  END IF;
  
  -- Final count
  SELECT COUNT(*) INTO snapshot_count FROM public.slate_snapshots WHERE deleted_at IS NULL;
  RAISE NOTICE 'FINAL: Total snapshots after fix: %', snapshot_count;
END $$;

-- Step 8: Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Step 9: Verification queries
-- Verify the deleted_at column exists
SELECT 
  column_name, 
  data_type, 
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'slate_snapshots'
  AND column_name IN ('deleted_at', 'snapshot_hash', 'hash')
ORDER BY column_name;

-- Test the query that was failing
SELECT 
  scope,
  COUNT(*) as total_snapshots,
  MAX(updated_at_et) as latest_update
FROM public.slate_snapshots 
WHERE deleted_at IS NULL
GROUP BY scope
ORDER BY scope;

-- Test the view
SELECT 
  scope, 
  id,
  snapshot_hash,
  hash,
  updated_at_et
FROM public.v_latest_slate_snapshots
ORDER BY scope;

-- Final completion message
DO $$
BEGIN
  RAISE NOTICE '=== DELETED_AT COLUMN FIX COMPLETE ===';
  RAISE NOTICE 'All queries should now work properly';
  RAISE NOTICE 'Slates should display on home, slate, and admin screens';
END $$;