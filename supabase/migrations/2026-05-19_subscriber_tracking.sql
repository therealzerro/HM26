-- ENH-FUNNEL-2026-05-19: Pro Subscriber Tracking + Funnel Intelligence
--
-- Five new tables for source-of-truth subscriber data, engagement tracking
-- from Facebook Group Insights, and daily funnel snapshots with MRR.
--
-- Security model: All tables have RLS enabled with NO policies for anon/auth.
-- Access is exclusively via the subscriber-admin Edge Function using the
-- service-role key, gated by the ADMIN_OPS_KEY header. This is because the
-- app uses anon-key direct REST and has no Supabase Auth / profiles table,
-- so admin-role RLS predicates would not function. The Edge Function pattern
-- keeps email PII out of the bundled anon-key surface.

-- ─── pro_subscribers ─────────────────────────────────────────────────────────
CREATE TABLE pro_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  email TEXT UNIQUE NOT NULL,
  facebook_name TEXT,

  date_subscribed DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'churned', 'comped', 'paused', 'unknown')),
  date_churned DATE,
  status_changed_at TIMESTAMPTZ DEFAULT NOW(),

  acquisition_source TEXT CHECK (
    acquisition_source IN (
      'reel', 'cross_post', 'free_group_organic',
      'direct_referral', 'word_of_mouth', 'unknown'
    )
  ),
  acquisition_notes TEXT,

  monthly_price_usd NUMERIC(6,2) DEFAULT 0.99,

  ios_migration_invited_at TIMESTAMPTZ,
  ios_migration_completed_at TIMESTAMPTZ,
  ios_user_id UUID,

  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  CONSTRAINT churn_requires_date
    CHECK ((status = 'churned' AND date_churned IS NOT NULL)
        OR (status != 'churned'))
);

CREATE INDEX idx_pro_subscribers_status ON pro_subscribers(status);
CREATE INDEX idx_pro_subscribers_subscribed ON pro_subscribers(date_subscribed DESC);
CREATE INDEX idx_pro_subscribers_email ON pro_subscribers(email);

ALTER TABLE pro_subscribers ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies. Service role bypasses RLS; anon is denied.

-- ─── fb_group_contributors ───────────────────────────────────────────────────
CREATE TABLE fb_group_contributors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  facebook_name TEXT NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('free', 'pro')),

  latest_posts_28d INTEGER DEFAULT 0,
  latest_comments_28d INTEGER DEFAULT 0,
  latest_likes_28d INTEGER DEFAULT 0,
  latest_window_end DATE,

  first_seen_at DATE NOT NULL DEFAULT CURRENT_DATE,
  last_seen_at DATE NOT NULL DEFAULT CURRENT_DATE,

  pro_subscriber_id UUID REFERENCES pro_subscribers(id) ON DELETE SET NULL,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(facebook_name, group_type)
);

CREATE INDEX idx_contributors_group ON fb_group_contributors(group_type);
CREATE INDEX idx_contributors_subscriber ON fb_group_contributors(pro_subscriber_id);

ALTER TABLE fb_group_contributors ENABLE ROW LEVEL SECURITY;

-- ─── fb_engagement_snapshots ─────────────────────────────────────────────────
CREATE TABLE fb_engagement_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contributor_id UUID NOT NULL REFERENCES fb_group_contributors(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL,
  group_type TEXT NOT NULL CHECK (group_type IN ('free', 'pro')),

  posts INTEGER NOT NULL DEFAULT 0,
  comments INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,

  engagement_score INTEGER GENERATED ALWAYS AS (
    (posts * 5) + (comments * 2) + likes
  ) STORED,

  imported_from_filename TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(contributor_id, snapshot_date)
);

CREATE INDEX idx_engagement_snap_date ON fb_engagement_snapshots(snapshot_date DESC);

ALTER TABLE fb_engagement_snapshots ENABLE ROW LEVEL SECURITY;

-- ─── funnel_daily_snapshots ──────────────────────────────────────────────────
CREATE TABLE funnel_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date DATE NOT NULL UNIQUE,

  page_followers INTEGER NOT NULL,
  free_group_members INTEGER NOT NULL,
  active_pro_subscribers INTEGER NOT NULL,

  conversion_rate NUMERIC(5,4) GENERATED ALWAYS AS (
    CASE
      WHEN free_group_members > 0
      THEN active_pro_subscribers::numeric / free_group_members::numeric
      ELSE 0
    END
  ) STORED,

  gross_mrr NUMERIC(10,2) GENERATED ALWAYS AS (
    active_pro_subscribers * 0.99
  ) STORED,

  net_mrr NUMERIC(10,2) GENERATED ALWAYS AS (
    active_pro_subscribers * 0.99 * 0.70
  ) STORED,

  reel_views_today INTEGER,
  content_interactions_today INTEGER,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_funnel_snap_date ON funnel_daily_snapshots(snapshot_date DESC);

ALTER TABLE funnel_daily_snapshots ENABLE ROW LEVEL SECURITY;

-- ─── subscriber_import_history ───────────────────────────────────────────────
CREATE TABLE subscriber_import_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  import_type TEXT NOT NULL CHECK (
    import_type IN ('subscriber_emails', 'group_insights', 'manual', 'snapshot')
  ),
  source_filename TEXT,
  import_date DATE NOT NULL,

  records_processed INTEGER NOT NULL,
  records_created INTEGER NOT NULL,
  records_updated INTEGER NOT NULL,
  records_skipped INTEGER NOT NULL,

  warnings JSONB,
  errors JSONB,

  imported_at TIMESTAMPTZ DEFAULT NOW(),
  imported_by_actor TEXT DEFAULT 'operator'
);

CREATE INDEX idx_import_history_date ON subscriber_import_history(import_date DESC);

ALTER TABLE subscriber_import_history ENABLE ROW LEVEL SECURITY;

-- ─── updated_at trigger ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pro_subscribers_updated_at
  BEFORE UPDATE ON pro_subscribers
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

CREATE TRIGGER trg_fb_contributors_updated_at
  BEFORE UPDATE ON fb_group_contributors
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
