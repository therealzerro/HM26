-- ENH-FUNNEL follow-up (2026-09-07): the Facebook Group Insights export carries a
-- PII-free DAILY series (Total Members · Posts · Comments · Reactions · Active
-- Members) that until now lived only in docs/growth_checkpoint_*.md. Give it a
-- home so the Funnel dashboard can show the Pro-group headcount (the roster
-- overstates it once members churn) and the engagement pulse in-app.
-- One row per group per day; re-pasting an overlapping export updates in place.
CREATE TABLE IF NOT EXISTS fb_group_daily (
  group_type          TEXT NOT NULL CHECK (group_type IN ('free', 'pro')),
  day                 DATE NOT NULL,
  total_members       INTEGER,                       -- NULL when Insights did not report it (pre-2026-06-10 for Pro)
  pending_members     INTEGER,
  approved_requests   INTEGER,
  declined_requests   INTEGER,
  posts               INTEGER NOT NULL DEFAULT 0,
  comments            INTEGER NOT NULL DEFAULT 0,
  reactions           INTEGER NOT NULL DEFAULT 0,
  active_members      INTEGER NOT NULL DEFAULT 0,
  imported_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_type, day)
);
COMMENT ON TABLE fb_group_daily IS
  'Facebook Group Insights daily series (no PII). Written by subscriber-admin upsert_group_daily from the Sub Import → Insights paste; read by the Funnel dashboard (Pro group headcount + engagement pulse).';
-- Same posture as the other subscriber tables: RLS on, no anon policies — only the
-- service-role edge function reads/writes.
ALTER TABLE fb_group_daily ENABLE ROW LEVEL SECURITY;
