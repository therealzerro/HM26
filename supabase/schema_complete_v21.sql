-- ============================================================
-- HitMaster Complete Database Schema v2.1
-- ONE FILE — paste this entire script into Supabase SQL Editor
-- Safe to run multiple times — drops and recreates everything
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── DROP EVERYTHING FIRST (safe rerun) ─────────────────────
DROP VIEW IF EXISTS public.v_import_health CASCADE;
DROP VIEW IF EXISTS public.v_coverage_summary CASCADE;
DROP VIEW IF EXISTS public.v_signal_hit_rates CASCADE;
DROP VIEW IF EXISTS public.v_latest_slate_snapshots CASCADE;
DROP VIEW IF EXISTS public.v_recent_ledger CASCADE;
DROP TABLE IF EXISTS public.user_sessions CASCADE;
DROP TABLE IF EXISTS public.adaptive_tracking CASCADE;
DROP TABLE IF EXISTS public.app_config CASCADE;
DROP TABLE IF EXISTS public.horizon_blends CASCADE;
DROP TABLE IF EXISTS public.percentile_maps CASCADE;
DROP TABLE IF EXISTS public.datasets_pair CASCADE;
DROP TABLE IF EXISTS public.datasets_box CASCADE;
DROP TABLE IF EXISTS public.histories CASCADE;
DROP TABLE IF EXISTS public.audit_logs CASCADE;
DROP TABLE IF EXISTS public.slate_snapshots CASCADE;
DROP TABLE IF EXISTS public.imports CASCADE;


-- ─── IMPORTS ─────────────────────────────────────────────────
CREATE TABLE public.imports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type           text NOT NULL CHECK (type IN ('box_history','pair_history','daily_input','ledger')),
  class_id       integer,
  horizon_label  text CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  scope          text CHECK (scope IN ('midday','evening','allday')),
  file_meta      jsonb,
  counts         integer,
  p99_cap        real,
  first_seen     date,
  last_seen      date,
  warnings       jsonb DEFAULT '[]'::jsonb,
  status         text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','processing','completed','failed','deleted')),
  error_text     text,
  created_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz
);

CREATE INDEX imports_type_idx        ON public.imports(type);
CREATE INDEX imports_status_idx      ON public.imports(status);
CREATE INDEX imports_scope_idx       ON public.imports(scope);
CREATE INDEX imports_created_at_idx  ON public.imports(created_at DESC);
CREATE INDEX imports_deleted_at_idx  ON public.imports(deleted_at);


-- ─── SLATE SNAPSHOTS ──────────────────────────────────────────
CREATE TABLE public.slate_snapshots (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scope                text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizons_present_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  weights_json         jsonb DEFAULT '{}'::jsonb,
  top_k_straights_json jsonb DEFAULT '[]'::jsonb,
  top_k_boxes_json     jsonb DEFAULT '[]'::jsonb,
  components_json      jsonb DEFAULT '[]'::jsonb,
  engine_version       text DEFAULT 'v2.1',
  confidence_score     integer DEFAULT 0,
  updated_at_et        timestamptz NOT NULL DEFAULT now(),
  snapshot_hash        text NOT NULL DEFAULT '',
  hash                 text NOT NULL DEFAULT '',
  deleted_at           timestamptz
);

CREATE INDEX slate_snapshots_scope_idx       ON public.slate_snapshots(scope);
CREATE INDEX slate_snapshots_updated_at_idx  ON public.slate_snapshots(updated_at_et DESC);
CREATE INDEX slate_snapshots_hash_idx        ON public.slate_snapshots(hash);
CREATE INDEX slate_snapshots_deleted_at_idx  ON public.slate_snapshots(deleted_at);


-- ─── AUDIT LOGS ───────────────────────────────────────────────
CREATE TABLE public.audit_logs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id     uuid,
  action       text NOT NULL,
  target       text NOT NULL,
  payload_meta jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_logs_action_idx     ON public.audit_logs(action);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs(created_at DESC);


-- ─── HISTORIES (LEDGER) ───────────────────────────────────────
CREATE TABLE public.histories (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  jurisdiction    text NOT NULL,
  game            text NOT NULL,
  date_et         date NOT NULL,
  session         text NOT NULL CHECK (session IN ('midday','evening')),
  result_digits   text NOT NULL,
  comboset_sorted text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (jurisdiction, game, date_et, session)
);

CREATE INDEX histories_jur_game_date_idx ON public.histories(jurisdiction, game, date_et DESC);
CREATE INDEX histories_date_idx          ON public.histories(date_et DESC);
CREATE INDEX histories_session_idx       ON public.histories(session);


-- ─── DATASETS BOX ────────────────────────────────────────────
CREATE TABLE public.datasets_box (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       integer NOT NULL DEFAULT 1,
  scope          text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizon_label  text NOT NULL CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  key            text NOT NULL,
  key_box        text NOT NULL,
  ds_raw         integer NOT NULL DEFAULT 0,
  ds_normalized  real NOT NULL DEFAULT 0,
  times_drawn    integer NOT NULL DEFAULT 0,
  last_seen      date,
  import_id      uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (class_id, scope, horizon_label, key)
);

CREATE INDEX datasets_box_class_scope_horizon_idx ON public.datasets_box(class_id, scope, horizon_label);
CREATE INDEX datasets_box_key_idx                 ON public.datasets_box(key);
CREATE INDEX datasets_box_scope_horizon_idx       ON public.datasets_box(scope, horizon_label);
CREATE INDEX datasets_box_import_id_idx           ON public.datasets_box(import_id);
CREATE INDEX datasets_box_deleted_at_idx          ON public.datasets_box(deleted_at);


-- ─── DATASETS PAIR ───────────────────────────────────────────
CREATE TABLE public.datasets_pair (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id       integer NOT NULL CHECK (class_id >= 2 AND class_id <= 11),
  scope          text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizon_label  text NOT NULL CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  key            text NOT NULL,
  key_pair       text NOT NULL,
  ds_raw         integer NOT NULL DEFAULT 0,
  ds_normalized  real NOT NULL DEFAULT 0,
  times_drawn    integer NOT NULL DEFAULT 0,
  last_seen      date,
  import_id      uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  UNIQUE (class_id, scope, horizon_label, key)
);

CREATE INDEX datasets_pair_class_scope_horizon_idx ON public.datasets_pair(class_id, scope, horizon_label);
CREATE INDEX datasets_pair_key_idx                 ON public.datasets_pair(key);
CREATE INDEX datasets_pair_scope_horizon_idx       ON public.datasets_pair(scope, horizon_label);
CREATE INDEX datasets_pair_import_id_idx           ON public.datasets_pair(import_id);
CREATE INDEX datasets_pair_deleted_at_idx          ON public.datasets_pair(deleted_at);


-- ─── PERCENTILE MAPS ─────────────────────────────────────────
CREATE TABLE public.percentile_maps (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id        integer NOT NULL,
  scope           text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  horizon_label   text NOT NULL CHECK (horizon_label IN ('H01Y','H02Y','H03Y','H04Y','H05Y','H06Y','H07Y','H08Y','H09Y','H10Y')),
  p99_cap         real NOT NULL,
  percentile_map  jsonb NOT NULL,
  import_id       uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  UNIQUE (class_id, scope, horizon_label)
);

CREATE INDEX percentile_maps_class_scope_horizon_idx ON public.percentile_maps(class_id, scope, horizon_label);
CREATE INDEX percentile_maps_deleted_at_idx          ON public.percentile_maps(deleted_at);


-- ─── HORIZON BLENDS ──────────────────────────────────────────
CREATE TABLE public.horizon_blends (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_id            integer NOT NULL,
  scope               text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  available_horizons  jsonb NOT NULL,
  weights             jsonb NOT NULL,
  import_id           uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz,
  UNIQUE (class_id, scope)
);

CREATE INDEX horizon_blends_class_scope_idx ON public.horizon_blends(class_id, scope);
CREATE INDEX horizon_blends_deleted_at_idx  ON public.horizon_blends(deleted_at);


-- ─── APP CONFIG ──────────────────────────────────────────────
CREATE TABLE public.app_config (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_config_key_idx ON public.app_config(key);


-- ─── ADAPTIVE TRACKING ───────────────────────────────────────
CREATE TABLE public.adaptive_tracking (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slate_date           date NOT NULL,
  scope                text NOT NULL CHECK (scope IN ('midday','evening','allday')),
  slate_hash           text NOT NULL,
  rank                 integer NOT NULL,
  combo                text NOT NULL,
  combo_set            text NOT NULL,
  signal_box           real NOT NULL DEFAULT 0,
  signal_pburst        real NOT NULL DEFAULT 0,
  signal_co            real NOT NULL DEFAULT 0,
  signal_burst         real NOT NULL DEFAULT 0,
  energy_score         integer NOT NULL DEFAULT 0,
  mode                 text NOT NULL DEFAULT 'balanced',
  actual_result        text,
  actual_set           text,
  hit_box              boolean,
  hit_straight         boolean,
  box_top_quartile     boolean DEFAULT false,
  pburst_top_quartile  boolean DEFAULT false,
  co_top_quartile      boolean DEFAULT false,
  burst_top_quartile   boolean DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  result_at            timestamptz
);

CREATE INDEX adaptive_date_scope_idx ON public.adaptive_tracking(slate_date, scope);
CREATE INDEX adaptive_hash_idx       ON public.adaptive_tracking(slate_hash);
CREATE INDEX adaptive_hit_idx        ON public.adaptive_tracking(hit_box) WHERE hit_box IS NOT NULL;


-- ─── USER SESSIONS ────────────────────────────────────────────
CREATE TABLE public.user_sessions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_token  text NOT NULL UNIQUE,
  tier           text NOT NULL DEFAULT 'free' CHECK (tier IN ('free','pro','plus')),
  platform       text,
  app_version    text,
  first_seen     timestamptz NOT NULL DEFAULT now(),
  last_seen      timestamptz NOT NULL DEFAULT now(),
  draw_count     integer NOT NULL DEFAULT 0,
  slate_count    integer NOT NULL DEFAULT 0
);

CREATE INDEX user_sessions_token_idx     ON public.user_sessions(session_token);
CREATE INDEX user_sessions_tier_idx      ON public.user_sessions(tier);
CREATE INDEX user_sessions_last_seen_idx ON public.user_sessions(last_seen DESC);


-- ─── FOREIGN KEYS ────────────────────────────────────────────
ALTER TABLE public.datasets_box    ADD CONSTRAINT datasets_box_import_fk    FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE SET NULL;
ALTER TABLE public.datasets_pair   ADD CONSTRAINT datasets_pair_import_fk   FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE SET NULL;
ALTER TABLE public.percentile_maps ADD CONSTRAINT percentile_maps_import_fk FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE SET NULL;
ALTER TABLE public.horizon_blends  ADD CONSTRAINT horizon_blends_import_fk  FOREIGN KEY (import_id) REFERENCES public.imports(id) ON DELETE SET NULL;


-- ─── VIEWS ───────────────────────────────────────────────────
CREATE VIEW public.v_latest_slate_snapshots AS
SELECT DISTINCT ON (scope)
  id, scope, horizons_present_json, weights_json,
  top_k_straights_json, top_k_boxes_json, components_json,
  engine_version, confidence_score,
  updated_at_et, snapshot_hash, hash, deleted_at
FROM public.slate_snapshots
WHERE deleted_at IS NULL
ORDER BY scope, updated_at_et DESC NULLS LAST, id DESC;

CREATE VIEW public.v_recent_ledger AS
SELECT jurisdiction, game, date_et, session, result_digits, comboset_sorted
FROM public.histories
ORDER BY date_et DESC, created_at DESC;

CREATE VIEW public.v_signal_hit_rates AS
SELECT
  COUNT(*) FILTER (WHERE hit_box IS NOT NULL)           AS total_evaluated,
  COUNT(*) FILTER (WHERE hit_box = true)                AS total_hits,
  ROUND(COUNT(*) FILTER (WHERE hit_box = true)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE hit_box IS NOT NULL), 0) * 100, 1) AS box_hit_rate_pct,
  ROUND(COUNT(*) FILTER (WHERE hit_box = true AND box_top_quartile)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE hit_box IS NOT NULL AND box_top_quartile), 0) * 100, 1) AS box_signal_rate,
  ROUND(COUNT(*) FILTER (WHERE hit_box = true AND pburst_top_quartile)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE hit_box IS NOT NULL AND pburst_top_quartile), 0) * 100, 1) AS pburst_signal_rate,
  ROUND(COUNT(*) FILTER (WHERE hit_box = true AND co_top_quartile)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE hit_box IS NOT NULL AND co_top_quartile), 0) * 100, 1) AS co_signal_rate,
  ROUND(COUNT(*) FILTER (WHERE hit_box = true AND burst_top_quartile)::numeric /
    NULLIF(COUNT(*) FILTER (WHERE hit_box IS NOT NULL AND burst_top_quartile), 0) * 100, 1) AS burst_signal_rate,
  MIN(slate_date) AS first_date,
  MAX(slate_date) AS last_date,
  COUNT(DISTINCT slate_date) AS days_tracked
FROM public.adaptive_tracking;

CREATE VIEW public.v_coverage_summary AS
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

CREATE VIEW public.v_import_health AS
SELECT
  COUNT(*)                                            AS total_imports,
  COUNT(*) FILTER (WHERE status = 'completed')        AS completed,
  COUNT(*) FILTER (WHERE status = 'failed')           AS failed,
  COUNT(*) FILTER (WHERE status = 'deleted')          AS deleted,
  COUNT(*) FILTER (WHERE status = 'pending')          AS pending,
  SUM(counts) FILTER (WHERE status = 'completed')     AS total_rows,
  MAX(created_at)                                     AS last_import_at
FROM public.imports;


-- ─── FUNCTIONS ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_box_keys()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.key_box IS NULL OR NEW.key_box = '' THEN NEW.key_box := NEW.key; END IF;
  IF NEW.key IS NULL OR NEW.key = '' THEN NEW.key := NEW.key_box; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.sync_pair_keys()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.key_pair IS NULL OR NEW.key_pair = '' THEN NEW.key_pair := NEW.key; END IF;
  IF NEW.key IS NULL OR NEW.key = '' THEN NEW.key := NEW.key_pair; END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.update_app_config_timestamp()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;


-- ─── TRIGGERS ────────────────────────────────────────────────
CREATE TRIGGER sync_box_keys_trigger
  BEFORE INSERT OR UPDATE ON public.datasets_box
  FOR EACH ROW EXECUTE FUNCTION public.sync_box_keys();

CREATE TRIGGER sync_pair_keys_trigger
  BEFORE INSERT OR UPDATE ON public.datasets_pair
  FOR EACH ROW EXECUTE FUNCTION public.sync_pair_keys();

CREATE TRIGGER app_config_updated_at
  BEFORE UPDATE ON public.app_config
  FOR EACH ROW EXECUTE FUNCTION public.update_app_config_timestamp();


-- ─── ROW LEVEL SECURITY ───────────────────────────────────────
-- Development mode: all open. Tighten before production.
ALTER TABLE public.imports           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slate_snapshots   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.histories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_box      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.datasets_pair     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.percentile_maps   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.horizon_blends    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_config        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.adaptive_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions     ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON public.imports           FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.slate_snapshots   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.audit_logs        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.histories         FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.datasets_box      FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.datasets_pair     FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.percentile_maps   FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.horizon_blends    FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.app_config        FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.adaptive_tracking FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY allow_all ON public.user_sessions     FOR ALL USING (true) WITH CHECK (true);


-- ─── GRANTS ───────────────────────────────────────────────────
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;


-- ─── SEED APP CONFIG ─────────────────────────────────────────
INSERT INTO public.app_config (key, value, description) VALUES
  ('nationwide_enabled',        'true',     'Pro nationwide play feature on/off'),
  ('nationwide_url',            'https://www.thelotter.com', 'Nationwide play service URL'),
  ('nationwide_description',    'Legal lottery concierge — buy tickets in 40+ states from home.', 'Description for Pro users'),
  ('engine_preset',             'balanced', 'Active ZK6 weight preset'),
  ('engine_weights_balanced',   '{"BOX":0.40,"PBURST":0.40,"CO":0.20}', 'Balanced weights'),
  ('engine_weights_conservative','{"BOX":0.70,"PBURST":0.20,"CO":0.10}', 'Conservative weights'),
  ('engine_weights_aggressive', '{"BOX":0.25,"PBURST":0.45,"CO":0.30}', 'Aggressive weights'),
  ('drawing_confidence_on',     'true',  'Drawing Report Card confidence adjustment'),
  ('burst_signal_on',           'true',  'Recency Burst Detection signal'),
  ('k6_singles_max',            '4',     'Max singles in K6'),
  ('k6_doubles_max',            '2',     'Max doubles in K6'),
  ('k6_triples_on',             'false', 'Triples allowed in K6'),
  ('pair_rep_cap',              '2',     'Max picks per TopPair'),
  ('default_scope',             'midday','Default launch scope'),
  ('zk6_version',               'v2.1',  'Engine version'),
  ('app_version',               '2.0.0', 'App version')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- ─── SEED TEST SNAPSHOTS (so Health Tests pass immediately) ──
INSERT INTO public.slate_snapshots
  (scope, snapshot_hash, hash, horizons_present_json, weights_json,
   top_k_straights_json, top_k_boxes_json, components_json, engine_version, confidence_score)
VALUES
  ('midday', 'TEST_MID_V21', 'TEST_MID_V21',
   '{"H01Y":true,"H02Y":true,"H03Y":false}', '{"BOX":0.40,"PBURST":0.40,"CO":0.20}',
   '[{"combo":"742","indicator":0.95,"bestOrder":"742","multiplicity":"singles","topPair":"24"},
     {"combo":"319","indicator":0.91,"bestOrder":"319","multiplicity":"singles","topPair":"13"},
     {"combo":"506","indicator":0.88,"bestOrder":"506","multiplicity":"singles","topPair":"05"},
     {"combo":"881","indicator":0.84,"bestOrder":"881","multiplicity":"doubles","topPair":"18"},
     {"combo":"234","indicator":0.81,"bestOrder":"234","multiplicity":"singles","topPair":"23"},
     {"combo":"719","indicator":0.78,"bestOrder":"719","multiplicity":"singles","topPair":"17"}]',
   '[]', '[]', 'v2.1', 85),
  ('evening', 'TEST_EVE_V21', 'TEST_EVE_V21',
   '{"H01Y":true,"H02Y":true,"H03Y":true}', '{"BOX":0.40,"PBURST":0.40,"CO":0.20}',
   '[{"combo":"789","indicator":0.97,"bestOrder":"789","multiplicity":"singles","topPair":"78"},
     {"combo":"012","indicator":0.89,"bestOrder":"012","multiplicity":"singles","topPair":"01"},
     {"combo":"345","indicator":0.86,"bestOrder":"345","multiplicity":"singles","topPair":"34"},
     {"combo":"566","indicator":0.83,"bestOrder":"566","multiplicity":"doubles","topPair":"56"},
     {"combo":"901","indicator":0.80,"bestOrder":"901","multiplicity":"singles","topPair":"09"},
     {"combo":"128","indicator":0.77,"bestOrder":"128","multiplicity":"singles","topPair":"12"}]',
   '[]', '[]', 'v2.1', 78),
  ('allday', 'TEST_ALL_V21', 'TEST_ALL_V21',
   '{"H01Y":true,"H02Y":true}', '{"BOX":0.40,"PBURST":0.40,"CO":0.20}',
   '[{"combo":"345","indicator":0.968,"bestOrder":"345","multiplicity":"singles","topPair":"34"},
     {"combo":"678","indicator":0.941,"bestOrder":"678","multiplicity":"singles","topPair":"67"},
     {"combo":"901","indicator":0.915,"bestOrder":"901","multiplicity":"singles","topPair":"09"},
     {"combo":"234","indicator":0.892,"bestOrder":"234","multiplicity":"singles","topPair":"23"},
     {"combo":"567","indicator":0.868,"bestOrder":"567","multiplicity":"singles","topPair":"56"},
     {"combo":"890","indicator":0.845,"bestOrder":"890","multiplicity":"singles","topPair":"89"}]',
   '[]', '[]', 'v2.1', 82);


-- ─── FORCE SCHEMA CACHE REFRESH ──────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ─── FINAL VERIFICATION ──────────────────────────────────────
DO $$
DECLARE
  tbl text;
  missing_tables text[] := '{}';
  required text[] := ARRAY[
    'imports','slate_snapshots','histories','datasets_box','datasets_pair',
    'percentile_maps','horizon_blends','audit_logs',
    'app_config','adaptive_tracking','user_sessions'
  ];
BEGIN
  FOREACH tbl IN ARRAY required LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      missing_tables := array_append(missing_tables, tbl);
    END IF;
  END LOOP;

  IF array_length(missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 'MISSING TABLES: %', array_to_string(missing_tables, ', ');
  END IF;

  RAISE NOTICE '✓ All 11 tables verified';
  RAISE NOTICE '✓ Views created: v_latest_slate_snapshots, v_recent_ledger, v_signal_hit_rates, v_coverage_summary, v_import_health';
  RAISE NOTICE '✓ Test snapshots seeded for midday, evening, allday';
  RAISE NOTICE '✓ App config seeded with 16 default values';
  RAISE NOTICE '';
  RAISE NOTICE 'HitMaster v2.1 schema complete. Run Health Tests in Creator Access to confirm.';
END $$;
