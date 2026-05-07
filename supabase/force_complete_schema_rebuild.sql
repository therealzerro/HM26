-- EMERGENCY COMPLETE SCHEMA REBUILD
-- This will completely rebuild the database schema to fix all column issues

-- First, drop everything to ensure clean state
DROP VIEW IF EXISTS public.v_latest_slate_snapshots CASCADE;
DROP VIEW IF EXISTS public.v_recent_ledger CASCADE;
DROP TABLE IF EXISTS public.horizon_blends CASCADE;
DROP TABLE IF EXISTS public.percentile_maps CASCADE;
DROP TABLE IF EXISTS public.datasets_pair CASCADE;
DROP TABLE IF EXISTS public.datasets_box CASCADE;
DROP TABLE IF EXISTS public.histories CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.slate_snapshots CASCADE;
DROP TABLE IF EXISTS public.imports CASCADE;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Recreate imports table
CREATE TABLE public.imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('box_history','pair_history','daily_input','ledger')),
  class_id integer,
  horizon_label text CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  scope text CHECK (scope IN ('midday','evening','allday')),
  file_meta jsonb,
  counts integer,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed','deleted')),
  error_text text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

-- Recreate slate_snapshots table with ALL required columns
CREATE TABLE public.slate_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizons_present_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights_json jsonb DEFAULT '{}'::jsonb,
  top_k_straights_json jsonb DEFAULT '[]'::jsonb,
  top_k_boxes_json jsonb DEFAULT '[]'::jsonb,
  components_json jsonb DEFAULT '[]'::jsonb,
  updated_at_et timestamptz NOT NULL DEFAULT now(),
  snapshot_hash text NOT NULL DEFAULT '',
  hash text NOT NULL DEFAULT '',
  deleted_at timestamptz
);

-- Recreate all other tables
CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  action text NOT NULL,
  target text NOT NULL,
  payload_meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.histories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction text NOT NULL,
  game text NOT NULL,
  date_et date NOT NULL,
  session text NOT NULL CHECK (session IN ('midday','evening')),
  result_digits text NOT NULL,
  comboset_sorted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, game, date_et, session)
);

CREATE TABLE public.datasets_box (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id integer NOT NULL DEFAULT 1,
  scope text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizon_label text NOT NULL CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  key text NOT NULL,
  key_box text NOT NULL,
  ds_raw integer NOT NULL DEFAULT 0,
  ds_normalized real NOT NULL DEFAULT 0,
  times_drawn integer NOT NULL DEFAULT 0,
  last_seen date,
  import_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (class_id, scope, horizon_label, key)
);

CREATE TABLE public.datasets_pair (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id integer NOT NULL CHECK (class_id >= 2 AND class_id <= 11),
  scope text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizon_label text NOT NULL CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  key text NOT NULL,
  key_pair text NOT NULL,
  ds_raw integer NOT NULL DEFAULT 0,
  ds_normalized real NOT NULL DEFAULT 0,
  times_drawn integer NOT NULL DEFAULT 0,
  last_seen date,
  import_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (class_id, scope, horizon_label, key)
);

CREATE TABLE public.percentile_maps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id integer NOT NULL,
  scope text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizon_label text NOT NULL CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  p99_cap real NOT NULL,
  percentile_map jsonb NOT NULL,
  import_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (class_id, scope, horizon_label)
);

CREATE TABLE public.horizon_blends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id integer NOT NULL,
  scope text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  available_horizons jsonb NOT NULL,
  weights jsonb NOT NULL,
  import_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (class_id, scope)
);

-- Create all indexes
CREATE INDEX imports_type_idx ON public.imports(type);
CREATE INDEX imports_status_idx ON public.imports(status);
CREATE INDEX imports_created_at_idx ON public.imports(created_at DESC);
CREATE INDEX imports_deleted_at_idx ON public.imports(deleted_at);

CREATE INDEX slate_snapshots_scope_idx ON public.slate_snapshots(scope);
CREATE INDEX slate_snapshots_updated_at_idx ON public.slate_snapshots(updated_at_et DESC);
CREATE INDEX slate_snapshots_hash_idx ON public.slate_snapshots(hash);
CREATE INDEX slate_snapshots_snapshot_hash_idx ON public.slate_snapshots(snapshot_hash);
CREATE INDEX slate_snapshots_deleted_at_idx ON public.slate_snapshots(deleted_at);

CREATE INDEX audit_logs_action_idx ON public.audit_logs(action);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs(created_at DESC);

CREATE INDEX histories_jur_game_date_idx ON public.histories(jurisdiction, game, date_et DESC);

CREATE INDEX datasets_box_class_scope_horizon_idx ON public.datasets_box(class_id, scope, horizon_label);
CREATE INDEX datasets_box_key_idx ON public.datasets_box(key);
CREATE INDEX datasets_box_key_box_idx ON public.datasets_box(key_box);
CREATE INDEX datasets_box_scope_horizon_idx ON public.datasets_box(scope, horizon_label);
CREATE INDEX datasets_box_import_id_idx ON public.datasets_box(import_id);
CREATE INDEX datasets_box_deleted_at_idx ON public.datasets_box(deleted_at);

CREATE INDEX datasets_pair_class_scope_horizon_idx ON public.datasets_pair(class_id, scope, horizon_label);
CREATE INDEX datasets_pair_key_idx ON public.datasets_pair(key);
CREATE INDEX datasets_pair_key_pair_idx ON public.datasets_pair(key_pair);
CREATE INDEX datasets_pair_scope_horizon_idx ON public.datasets_pair(scope, horizon_label);
CREATE INDEX datasets_pair_import_id_idx ON public.datasets_pair(import_id);
CREATE INDEX datasets_pair_deleted_at_idx ON public.datasets_pair(deleted_at);

CREATE INDEX percentile_maps_class_scope_horizon_idx ON public.percentile_maps(class_id, scope, horizon_label);
CREATE INDEX percentile_maps_import_id_idx ON public.percentile_maps(import_id);
CREATE INDEX percentile_maps_deleted_at_idx ON public.percentile_maps(deleted_at);

CREATE INDEX horizon_blends_class_scope_idx ON public.horizon_blends(class_id, scope);
CREATE INDEX horizon_blends_import_id_idx ON public.horizon_blends(import_id);
CREATE INDEX horizon_blends_deleted_at_idx ON public.horizon_blends(deleted_at);

-- Add foreign key constraints
ALTER TABLE public.datasets_box
  ADD CONSTRAINT datasets_box_import_fk FOREIGN KEY (import_id)
  REFERENCES public.imports(id) ON DELETE SET NULL;

ALTER TABLE public.datasets_pair
  ADD CONSTRAINT datasets_pair_import_fk FOREIGN KEY (import_id)
  REFERENCES public.imports(id) ON DELETE SET NULL;

ALTER TABLE public.percentile_maps
  ADD CONSTRAINT percentile_maps_import_fk FOREIGN KEY (import_id)
  REFERENCES public.imports(id) ON DELETE SET NULL;

ALTER TABLE public.horizon_blends
  ADD CONSTRAINT horizon_blends_import_fk FOREIGN KEY (import_id)
  REFERENCES public.imports(id) ON DELETE SET NULL;

-- Create views
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

CREATE VIEW public.v_recent_ledger AS
SELECT
  jurisdiction,
  game,
  date_et,
  session,
  result_digits,
  comboset_sorted
FROM public.histories
ORDER BY date_et DESC, created_at DESC;

-- Create functions for key synchronization
CREATE OR REPLACE FUNCTION public.sync_box_keys() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.key_box IS NULL OR NEW.key_box = '' THEN
    NEW.key_box := NEW.key;
  END IF;
  IF NEW.key IS NULL OR NEW.key = '' THEN
    NEW.key := NEW.key_box;
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_pair_keys() 
RETURNS trigger 
LANGUAGE plpgsql 
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.key_pair IS NULL OR NEW.key_pair = '' THEN
    NEW.key_pair := NEW.key;
  END IF;
  IF NEW.key IS NULL OR NEW.key = '' THEN
    NEW.key := NEW.key_pair;
  END IF;
  RETURN NEW;
END $$;

-- Create triggers
CREATE TRIGGER sync_box_keys_trigger 
  BEFORE INSERT OR UPDATE ON public.datasets_box
  FOR EACH ROW EXECUTE FUNCTION public.sync_box_keys();

CREATE TRIGGER sync_pair_keys_trigger 
  BEFORE INSERT OR UPDATE ON public.datasets_pair
  FOR EACH ROW EXECUTE FUNCTION public.sync_pair_keys();

-- Enable RLS on all tables
ALTER TABLE public.imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slate_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_box ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_pair ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.percentile_maps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horizon_blends ENABLE ROW LEVEL SECURITY;

-- Create RLS policies - Allow all operations for all users
CREATE POLICY allow_all_imports ON public.imports FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_slate_snapshots ON public.slate_snapshots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_audit_logs ON public.audit_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_histories ON public.histories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_datasets_box ON public.datasets_box FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_datasets_pair ON public.datasets_pair FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_percentile_maps ON public.percentile_maps FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all_horizon_blends ON public.horizon_blends FOR ALL USING (true) WITH CHECK (true);

-- Grant necessary permissions
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Insert test data for all scopes
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

-- Force schema cache refresh
NOTIFY pgrst, 'reload schema';

-- Final verification
DO $$
BEGIN
  -- Verify all required columns exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'snapshot_hash'
  ) THEN
    RAISE EXCEPTION 'FATAL: snapshot_hash column missing from slate_snapshots table';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'hash'
  ) THEN
    RAISE EXCEPTION 'FATAL: hash column missing from slate_snapshots table';
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'slate_snapshots' 
    AND column_name = 'deleted_at'
  ) THEN
    RAISE EXCEPTION 'FATAL: deleted_at column missing from slate_snapshots table';
  END IF;
  
  RAISE NOTICE 'SUCCESS: Complete schema rebuild finished. All required columns verified and test data inserted.';
END $$;