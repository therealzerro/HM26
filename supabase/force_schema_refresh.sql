-- Force schema refresh and fix RLS issues
-- This script should be run after the main schema.sql

-- First, ensure all permissions are granted
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Add deleted_at column if it doesn't exist
ALTER TABLE public.slate_snapshots 
ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- Create index for deleted_at if it doesn't exist
CREATE INDEX IF NOT EXISTS slate_snapshots_deleted_at_idx 
ON public.slate_snapshots(deleted_at);

-- Update the view to include deleted_at and filter out deleted records
DROP VIEW IF EXISTS public.v_latest_slate_snapshots;

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

-- Verify data exists and insert if needed
DO $
DECLARE
  snapshot_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO snapshot_count FROM public.slate_snapshots WHERE deleted_at IS NULL;
  
  IF snapshot_count = 0 THEN
    RAISE NOTICE 'WARNING: No slate snapshots found. Inserting comprehensive test data...';
    
    -- Insert comprehensive test data
    INSERT INTO public.slate_snapshots (
      scope, 
      snapshot_hash, 
      hash, 
      horizons_present_json,
      weights_json,
      top_k_straights_json,
      top_k_boxes_json,
      components_json
    ) VALUES 
    (
      'midday', 
      'test_hash_midday_001', 
      'test_hash_midday_001',
      '{"H01Y": true, "H02Y": true, "H03Y": false}',
      '{"H01Y": 0.6, "H02Y": 0.4}',
      '[{"combo": "123", "indicator": 0.95, "box": 0.85, "pburst": 0.78, "co": 0.72, "bestOrder": "straight", "multiplicity": "singles", "topPair": "12"}, {"combo": "456", "indicator": 0.92, "box": 0.78, "pburst": 0.69, "co": 0.65, "bestOrder": "straight", "multiplicity": "singles", "topPair": "45"}, {"combo": "789", "indicator": 0.88, "box": 0.72, "pburst": 0.61, "co": 0.58, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.84, "box": 0.68, "pburst": 0.55, "co": 0.52, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}, {"combo": "345", "indicator": 0.81, "box": 0.64, "pburst": 0.51, "co": 0.48, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}]',
      '[{"combo": "12", "indicator": 0.88, "box": 0.72, "pburst": 0.65, "co": 0.58}, {"combo": "45", "indicator": 0.84, "box": 0.68, "pburst": 0.61, "co": 0.54}]',
      '[{"combo": "123", "components": {"BOX": 0.85, "PBURST": 0.78, "CO": 0.72}, "temperature": 95, "multiplicity": "singles", "topPair": "12", "indicator": 0.95}, {"combo": "456", "components": {"BOX": 0.78, "PBURST": 0.69, "CO": 0.65}, "temperature": 92, "multiplicity": "singles", "topPair": "45", "indicator": 0.92}]'
    ),
    (
      'evening', 
      'test_hash_evening_001', 
      'test_hash_evening_001',
      '{"H01Y": true, "H02Y": true, "H03Y": true}',
      '{"H01Y": 0.5, "H02Y": 0.3, "H03Y": 0.2}',
      '[{"combo": "789", "indicator": 0.97, "box": 0.91, "pburst": 0.84, "co": 0.78, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.89, "box": 0.82, "pburst": 0.75, "co": 0.69, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}, {"combo": "345", "indicator": 0.86, "box": 0.78, "pburst": 0.71, "co": 0.65, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}, {"combo": "678", "indicator": 0.83, "box": 0.74, "pburst": 0.67, "co": 0.61, "bestOrder": "straight", "multiplicity": "singles", "topPair": "67"}, {"combo": "901", "indicator": 0.80, "box": 0.70, "pburst": 0.63, "co": 0.57, "bestOrder": "straight", "multiplicity": "singles", "topPair": "90"}]',
      '[{"combo": "78", "indicator": 0.93, "box": 0.81, "pburst": 0.74, "co": 0.68}, {"combo": "01", "indicator": 0.87, "box": 0.75, "pburst": 0.68, "co": 0.62}]',
      '[{"combo": "789", "components": {"BOX": 0.91, "PBURST": 0.84, "CO": 0.78}, "temperature": 97, "multiplicity": "singles", "topPair": "78", "indicator": 0.97}, {"combo": "012", "components": {"BOX": 0.82, "PBURST": 0.75, "CO": 0.69}, "temperature": 89, "multiplicity": "singles", "topPair": "01", "indicator": 0.89}]'
    ),
    (
      'allday', 
      'test_hash_allday_001', 
      'test_hash_allday_001',
      '{"H01Y": true, "H02Y": true, "H03Y": true, "H04Y": false}',
      '{"H01Y": 0.4, "H02Y": 0.35, "H03Y": 0.25}',
      '[{"combo": "345", "indicator": 0.968, "box": 0.88, "pburst": 0.81, "co": 0.75, "bestOrder": "straight", "multiplicity": "singles", "topPair": "34"}, {"combo": "678", "indicator": 0.941, "box": 0.84, "pburst": 0.77, "co": 0.71, "bestOrder": "straight", "multiplicity": "singles", "topPair": "67"}, {"combo": "901", "indicator": 0.915, "box": 0.80, "pburst": 0.73, "co": 0.67, "bestOrder": "straight", "multiplicity": "singles", "topPair": "90"}, {"combo": "234", "indicator": 0.892, "box": 0.76, "pburst": 0.69, "co": 0.63, "bestOrder": "straight", "multiplicity": "singles", "topPair": "23"}, {"combo": "567", "indicator": 0.868, "box": 0.72, "pburst": 0.65, "co": 0.59, "bestOrder": "straight", "multiplicity": "singles", "topPair": "56"}, {"combo": "890", "indicator": 0.845, "box": 0.68, "pburst": 0.61, "co": 0.55, "bestOrder": "straight", "multiplicity": "singles", "topPair": "89"}, {"combo": "123", "indicator": 0.821, "box": 0.64, "pburst": 0.57, "co": 0.51, "bestOrder": "straight", "multiplicity": "singles", "topPair": "12"}, {"combo": "456", "indicator": 0.798, "box": 0.60, "pburst": 0.53, "co": 0.47, "bestOrder": "straight", "multiplicity": "singles", "topPair": "45"}, {"combo": "789", "indicator": 0.774, "box": 0.56, "pburst": 0.49, "co": 0.43, "bestOrder": "straight", "multiplicity": "singles", "topPair": "78"}, {"combo": "012", "indicator": 0.751, "box": 0.52, "pburst": 0.45, "co": 0.39, "bestOrder": "straight", "multiplicity": "singles", "topPair": "01"}]',
      '[{"combo": "34", "indicator": 0.902, "box": 0.74, "pburst": 0.67, "co": 0.61}, {"combo": "67", "indicator": 0.879, "box": 0.70, "pburst": 0.63, "co": 0.57}]',
      '[{"combo": "345", "components": {"BOX": 0.88, "PBURST": 0.81, "CO": 0.75}, "temperature": 97, "multiplicity": "singles", "topPair": "34", "indicator": 0.968}, {"combo": "678", "components": {"BOX": 0.84, "PBURST": 0.77, "CO": 0.71}, "temperature": 94, "multiplicity": "singles", "topPair": "67", "indicator": 0.941}, {"combo": "901", "components": {"BOX": 0.80, "PBURST": 0.73, "CO": 0.67}, "temperature": 92, "multiplicity": "singles", "topPair": "90", "indicator": 0.915}]'
    );
    
    GET DIAGNOSTICS snapshot_count = ROW_COUNT;
    RAISE NOTICE 'SUCCESS: Inserted % test snapshots', snapshot_count;
  ELSE
    RAISE NOTICE 'SUCCESS: Found % existing slate snapshots in database', snapshot_count;
  END IF;
END $;

-- Force PostgREST to reload schema
NOTIFY pgrst, 'reload schema';

-- Verify the fix worked
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND table_name = 'slate_snapshots'
  AND column_name = 'deleted_at';

-- Test query that was failing
SELECT COUNT(*) as total_snapshots
FROM public.slate_snapshots 
WHERE deleted_at IS NULL;

-- Show sample data
SELECT scope, snapshot_hash, updated_at_et
FROM public.slate_snapshots 
WHERE deleted_at IS NULL
ORDER BY updated_at_et DESC;