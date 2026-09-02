-- ENH-FUNNEL follow-up (2026-09-02): Meta "Approximate earnings" daily export (Professional
-- dashboard → Monetization → Earnings → export). Service-role only, like the other funnel tables.
CREATE TABLE IF NOT EXISTS fb_earnings_daily (
  earn_date DATE PRIMARY KEY,
  total_usd NUMERIC(10,4) NOT NULL DEFAULT 0,               -- "Primary" column
  content_monetization_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  stars_usd NUMERIC(10,4) NOT NULL DEFAULT 0,
  subscriptions_usd NUMERIC(10,4) NOT NULL DEFAULT 0,        -- NET of Meta's cut (2.49 → 1.74, 0.99 → 0.69)
  imported_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE fb_earnings_daily ENABLE ROW LEVEL SECURITY;
-- Audit-trail rows for earnings imports.
ALTER TABLE subscriber_import_history DROP CONSTRAINT IF EXISTS subscriber_import_history_import_type_check;
ALTER TABLE subscriber_import_history ADD CONSTRAINT subscriber_import_history_import_type_check
  CHECK (import_type IN ('subscriber_emails', 'group_insights', 'manual', 'snapshot', 'earnings'));
