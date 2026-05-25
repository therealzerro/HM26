-- ARCH-06 (formerly ARCH-04) — ZK30 v1.0 Engine: schema for Texas pilot
-- Work-order step 1 of 7. See MASTER_AUDIT.md "ARCH-06" long-form section.
--
-- Three new tables, fully isolated from ZK6 surfaces:
--   • histories_tx              — TX raw draws, 4 sessions preserved + Fireball
--   • daily_intelligence_zk30   — 30-pick slates + 4-match-type hit annotations
--   • adaptive_tracking_zk30    — primary + per-session match rows; AUC foundation
--
-- Existing datasets_box + datasets_pair are reused with jurisdiction='TX'.
--
-- RLS policy choice: each new table mirrors the *actual* current policy shape of
-- its ZK6 analog, captured by querying pg_policies before authoring this file.
--   histories         → allow_all (anon CRUD) → histories_tx same
--   daily_intelligence → anon SELECT+UPDATE only; service_role INSERT/DELETE → daily_intelligence_zk30 same
--   adaptive_tracking → anon SELECT+INSERT+UPDATE; no anon DELETE policy → adaptive_tracking_zk30 same
-- Service role bypasses RLS for Edge Function (compute-slate-zk30) writes regardless.

-- ───────────────────────────────────────────────────────────────────────────
-- histories_tx
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE histories_tx (
  id BIGSERIAL PRIMARY KEY,
  date_et DATE NOT NULL,
  session TEXT NOT NULL CHECK (session IN ('Morning','Day','Evening','Night')),
  result_digits CHAR(3) NOT NULL,
  fireball CHAR(1) NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ,
  UNIQUE (date_et, session, result_digits, fireball)
);

CREATE INDEX idx_histories_tx_date ON histories_tx (date_et DESC);
CREATE INDEX idx_histories_tx_session ON histories_tx (session, date_et DESC);

ALTER TABLE histories_tx ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON histories_tx
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE histories_tx TO anon, authenticated;
GRANT ALL ON TABLE histories_tx TO service_role;
GRANT USAGE, SELECT ON SEQUENCE histories_tx_id_seq TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- daily_intelligence_zk30
-- ───────────────────────────────────────────────────────────────────────────
CREATE TABLE daily_intelligence_zk30 (
  id BIGSERIAL PRIMARY KEY,
  slate_date DATE NOT NULL,
  rank INTEGER NOT NULL,
  combo CHAR(3) NOT NULL,
  combo_set TEXT NOT NULL,
  multiplicity TEXT,
  top_pair CHAR(2),
  signal_box NUMERIC(6,4),
  signal_pburst NUMERIC(6,4),
  signal_co NUMERIC(6,4),
  signal_dgc NUMERIC(6,4),
  energy_score INTEGER,
  draws_since INTEGER,
  times_drawn INTEGER DEFAULT 0,
  best_order CHAR(3),
  on_slate BOOLEAN DEFAULT false,
  hit_straight BOOLEAN DEFAULT false,
  hit_box BOOLEAN DEFAULT false,
  hit_fireball_straight BOOLEAN DEFAULT false,
  hit_fireball_box BOOLEAN DEFAULT false,
  matched_session TEXT,
  matched_result CHAR(3),
  matched_fireball CHAR(1),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (slate_date, rank, combo)
);

CREATE INDEX idx_di_zk30_date ON daily_intelligence_zk30 (slate_date DESC);
CREATE INDEX idx_di_zk30_hits ON daily_intelligence_zk30
  (slate_date, hit_box, hit_straight, hit_fireball_box, hit_fireball_straight);

ALTER TABLE daily_intelligence_zk30 ENABLE ROW LEVEL SECURITY;

-- Mirrors daily_intelligence: anon can SELECT + UPDATE; INSERT/DELETE service_role only.
CREATE POLICY di_zk30_select_public ON daily_intelligence_zk30
  FOR SELECT USING (true);
CREATE POLICY di_zk30_update_anon ON daily_intelligence_zk30
  FOR UPDATE TO anon USING (true) WITH CHECK (true);
CREATE POLICY di_zk30_update_authenticated ON daily_intelligence_zk30
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, UPDATE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE daily_intelligence_zk30 TO anon, authenticated;
GRANT ALL ON TABLE daily_intelligence_zk30 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE daily_intelligence_zk30_id_seq TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- adaptive_tracking_zk30
-- ───────────────────────────────────────────────────────────────────────────
-- No uniqueness constraint: spec is multi-row per pick (one per matched session).
-- Engine code handles idempotency (delete-then-insert per slate_hash on regen).
CREATE TABLE adaptive_tracking_zk30 (
  id BIGSERIAL PRIMARY KEY,
  slate_date DATE NOT NULL,
  slate_hash TEXT NOT NULL,
  rank INTEGER NOT NULL,
  combo CHAR(3) NOT NULL,
  combo_set TEXT NOT NULL,
  signal_box NUMERIC(6,4),
  signal_pburst NUMERIC(6,4),
  signal_co NUMERIC(6,4),
  signal_dgc NUMERIC(6,4),
  energy_score INTEGER,
  box_top_quartile BOOLEAN,
  pburst_top_quartile BOOLEAN,
  co_top_quartile BOOLEAN,
  dgc_top_quartile BOOLEAN,
  dominant_signal TEXT,
  hit_straight BOOLEAN,
  hit_box BOOLEAN,
  hit_fireball_straight BOOLEAN,
  hit_fireball_box BOOLEAN,
  matched_session TEXT,
  matched_result CHAR(3),
  matched_fireball CHAR(1),
  result_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_at_zk30_hash ON adaptive_tracking_zk30 (slate_hash);
CREATE INDEX idx_at_zk30_date ON adaptive_tracking_zk30 (slate_date DESC);

ALTER TABLE adaptive_tracking_zk30 ENABLE ROW LEVEL SECURITY;

-- Mirrors adaptive_tracking: anon SELECT + INSERT + UPDATE; no anon DELETE policy
-- (engine regen path uses service_role for the delete-then-insert idempotency dance).
CREATE POLICY at_zk30_select_public ON adaptive_tracking_zk30
  FOR SELECT USING (true);
CREATE POLICY at_zk30_insert_anon ON adaptive_tracking_zk30
  FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY at_zk30_insert_authenticated ON adaptive_tracking_zk30
  FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY at_zk30_update_authenticated ON adaptive_tracking_zk30
  FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE adaptive_tracking_zk30 TO anon, authenticated;
GRANT ALL ON TABLE adaptive_tracking_zk30 TO service_role;
GRANT USAGE, SELECT ON SEQUENCE adaptive_tracking_zk30_id_seq TO anon, authenticated, service_role;

-- ───────────────────────────────────────────────────────────────────────────
-- Audit trail
-- ───────────────────────────────────────────────────────────────────────────
INSERT INTO audit_logs (action, target, payload_meta)
VALUES (
  'arch_migration_applied',
  'arch-06-zk30-v1-tables',
  jsonb_build_object(
    'arch_id', 'ARCH-06',
    'work_order_step', '1 of 7',
    'tables_created', jsonb_build_array(
      'histories_tx',
      'daily_intelligence_zk30',
      'adaptive_tracking_zk30'
    ),
    'spec_ref', 'MASTER_AUDIT.md ARCH-06'
  )
);
