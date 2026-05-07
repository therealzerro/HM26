-- Emergency fix for missing hash column in slate_snapshots table
-- This addresses the "column slate_snapshots.hash does not exist" error

-- First, check if the hash column exists
DO $$
BEGIN
  -- Add hash column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'hash'
  ) THEN
    ALTER TABLE public.slate_snapshots ADD COLUMN hash text NOT NULL DEFAULT '';
    RAISE NOTICE 'Added hash column to slate_snapshots table';
  ELSE
    RAISE NOTICE 'Hash column already exists in slate_snapshots table';
  END IF;

  -- Add snapshot_hash column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'snapshot_hash'
  ) THEN
    ALTER TABLE public.slate_snapshots ADD COLUMN snapshot_hash text NOT NULL DEFAULT '';
    RAISE NOTICE 'Added snapshot_hash column to slate_snapshots table';
  ELSE
    RAISE NOTICE 'Snapshot_hash column already exists in slate_snapshots table';
  END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS slate_snapshots_hash_idx ON public.slate_snapshots(hash);
CREATE INDEX IF NOT EXISTS slate_snapshots_snapshot_hash_idx ON public.slate_snapshots(snapshot_hash);

-- Update existing records to have proper hash values if they're empty
UPDATE public.slate_snapshots 
SET hash = COALESCE(snapshot_hash, id::text, 'default_hash_' || extract(epoch from now())::text)
WHERE hash = '' OR hash IS NULL;

UPDATE public.slate_snapshots 
SET snapshot_hash = COALESCE(hash, id::text, 'default_snapshot_hash_' || extract(epoch from now())::text)
WHERE snapshot_hash = '' OR snapshot_hash IS NULL;

-- Recreate the view to ensure it includes all columns
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

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Final verification
DO $$
BEGIN
  -- Verify hash column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'hash'
  ) THEN
    RAISE EXCEPTION 'FATAL: hash column still missing from slate_snapshots table after fix attempt';
  END IF;
  
  -- Verify snapshot_hash column exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'snapshot_hash'
  ) THEN
    RAISE EXCEPTION 'FATAL: snapshot_hash column still missing from slate_snapshots table after fix attempt';
  END IF;
  
  RAISE NOTICE 'SUCCESS: Hash columns verified and fixed in slate_snapshots table';
END $$;