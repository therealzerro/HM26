-- ARCH-06 step 4.1 — slate_snapshots_zk30
--
-- Mirrors public.slate_snapshots (the ZK6 table) verbatim, with v1.0 lock-ins:
--   • jurisdiction NOT NULL DEFAULT 'TX' + CHECK = 'TX'   (single-state v1.0)
--   • scope        NOT NULL DEFAULT 'allday' + CHECK = 'allday'
--   • mode         NOT NULL DEFAULT 'balanced'             (single mode v1.0)
--   • engine_version DEFAULT 'v1.0'                        (not 'v2.1')
--   • slate_date     NOT NULL                              (ZK30 always carries a date)
--
-- All other column shapes preserved identically so ZK6's snapshot-consuming
-- code paths (admin tooling, share/export logic) can be parameterized over
-- jurisdiction without per-table branching.
--
-- RLS pattern: allow_all + anon CRUD grants, matching histories_tx.

CREATE TABLE slate_snapshots_zk30 (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  jurisdiction TEXT NOT NULL DEFAULT 'TX'
    CHECK (jurisdiction = 'TX'),
  scope TEXT NOT NULL DEFAULT 'allday'
    CHECK (scope = 'allday'),
  mode TEXT NOT NULL DEFAULT 'balanced'
    CHECK (mode IN ('balanced', 'conservative', 'aggressive')),
  engine_version TEXT DEFAULT 'v1.0',

  slate_date DATE NOT NULL,

  horizons_present_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  weights_json          JSONB         DEFAULT '{}'::jsonb,
  top_k_straights_json  JSONB         DEFAULT '[]'::jsonb,
  top_k_boxes_json      JSONB         DEFAULT '[]'::jsonb,
  components_json       JSONB         DEFAULT '[]'::jsonb,

  confidence_score INTEGER DEFAULT 0,

  -- Both columns kept for ZK6 parity. ZK6 writes the same value to both
  -- (snapshot_hash + hash) — `hash` is legacy from a pre-rename. Either one
  -- can be used for dedup; consumers should prefer snapshot_hash.
  snapshot_hash TEXT NOT NULL DEFAULT '',
  hash          TEXT NOT NULL DEFAULT '',

  admin_published BOOLEAN DEFAULT false,
  published_at    TIMESTAMPTZ,

  updated_at_et TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Latest TX slate per (date, mode); soft-deletes excluded.
CREATE INDEX idx_ss_zk30_date_mode ON slate_snapshots_zk30
  (slate_date DESC, mode)
  WHERE deleted_at IS NULL;

-- Dedup / regen idempotency lookup.
CREATE INDEX idx_ss_zk30_hash ON slate_snapshots_zk30 (snapshot_hash);

-- Active-published lookup (Today screen, share surface).
CREATE INDEX idx_ss_zk30_published ON slate_snapshots_zk30
  (slate_date DESC)
  WHERE admin_published = true AND deleted_at IS NULL;

ALTER TABLE slate_snapshots_zk30 ENABLE ROW LEVEL SECURITY;

CREATE POLICY allow_all ON slate_snapshots_zk30
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON TABLE slate_snapshots_zk30 TO anon, authenticated;
GRANT ALL ON TABLE slate_snapshots_zk30 TO service_role;

INSERT INTO audit_logs (action, target, payload_meta)
VALUES (
  'arch_migration_applied',
  'arch-06-zk30-slate-snapshots',
  jsonb_build_object(
    'arch_id', 'ARCH-06',
    'sub_step', '4.1',
    'table', 'slate_snapshots_zk30',
    'mirrors', 'slate_snapshots',
    'locks', jsonb_build_array(
      'jurisdiction NOT NULL DEFAULT TX CHECK',
      'scope NOT NULL DEFAULT allday CHECK',
      'mode NOT NULL DEFAULT balanced',
      'engine_version DEFAULT v1.0',
      'slate_date NOT NULL'
    )
  )
);
