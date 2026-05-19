-- Subscriber + funnel reconciliation queries
-- ENH-FUNNEL-2026-05-19 — operator-facing diagnostic SQL
--
-- Run from Supabase SQL editor. These queries are read-only and safe; the
-- pro_subscribers/funnel_daily_snapshots tables are gated by service-role
-- access in app, but the dashboard SQL editor uses service-role by default.

-- ─── 1. Subscriber count vs latest funnel snapshot ───────────────────────────
-- Quick consistency check between the source-of-truth roster and the most
-- recent funnel snapshot's stored active count.
SELECT
  (SELECT COUNT(*) FROM pro_subscribers WHERE status = 'active') AS db_active,
  s.active_pro_subscribers AS snapshot_active,
  (SELECT COUNT(*) FROM pro_subscribers WHERE status = 'active')
    - s.active_pro_subscribers AS variance
FROM funnel_daily_snapshots s
WHERE s.snapshot_date = (SELECT MAX(snapshot_date) FROM funnel_daily_snapshots);

-- ─── 2. Recent conversions (last 14 days) ────────────────────────────────────
SELECT email, date_subscribed,
       CURRENT_DATE - date_subscribed AS days_active,
       acquisition_source, facebook_name
FROM pro_subscribers
WHERE status = 'active'
  AND date_subscribed >= CURRENT_DATE - INTERVAL '14 days'
ORDER BY date_subscribed DESC;

-- ─── 3. Subscribers without facebook_name (need correlation) ─────────────────
-- Operator fills these in manually or via Group Insights correlation.
SELECT email, date_subscribed,
       CURRENT_DATE - date_subscribed AS days_active
FROM pro_subscribers
WHERE status = 'active' AND facebook_name IS NULL
ORDER BY date_subscribed DESC;

-- ─── 4. Pro contributors not yet linked to a subscriber row ──────────────────
SELECT c.facebook_name, c.latest_window_end,
       c.latest_posts_28d + c.latest_comments_28d + c.latest_likes_28d AS activity,
       (SELECT COUNT(*) FROM pro_subscribers
        WHERE facebook_name = c.facebook_name) AS direct_name_matches
FROM fb_group_contributors c
WHERE c.group_type = 'pro'
  AND c.pro_subscriber_id IS NULL
ORDER BY activity DESC;

-- ─── 5. Free → Pro conversion candidates ─────────────────────────────────────
-- Engaged free group members NOT also in Pro contributor list.
SELECT c.facebook_name,
       c.latest_posts_28d, c.latest_comments_28d, c.latest_likes_28d,
       (c.latest_posts_28d * 5 + c.latest_comments_28d * 2 + c.latest_likes_28d) AS engagement_score
FROM fb_group_contributors c
WHERE c.group_type = 'free'
  AND NOT EXISTS (
    SELECT 1 FROM fb_group_contributors p
    WHERE p.facebook_name = c.facebook_name AND p.group_type = 'pro'
  )
ORDER BY engagement_score DESC
LIMIT 30;

-- ─── 6. MRR by month (history) ───────────────────────────────────────────────
SELECT
  DATE_TRUNC('month', date_subscribed)::date AS month,
  COUNT(*) AS conversions,
  ROUND((COUNT(*) * 0.99)::numeric, 2) AS gross_added_mrr
FROM pro_subscribers
WHERE status = 'active'
GROUP BY DATE_TRUNC('month', date_subscribed)
ORDER BY month;

-- ─── 7. Daily new-subscriber count for the trailing 30 days ──────────────────
SELECT date_subscribed AS day, COUNT(*) AS new_subscribers
FROM pro_subscribers
WHERE date_subscribed >= CURRENT_DATE - INTERVAL '30 days'
  AND status = 'active'
GROUP BY date_subscribed
ORDER BY day DESC;

-- ─── 8. Engagement-window overlap suggestions (for manual linking) ───────────
-- For each unlinked pro contributor, show subscribers whose date_subscribed
-- falls inside the contributor's 28-day engagement window. This is a hint,
-- not a definitive match — operator must confirm via the admin UI.
SELECT
  c.id AS contributor_id,
  c.facebook_name AS contributor_name,
  c.latest_window_end,
  s.id AS subscriber_id,
  s.email,
  s.date_subscribed
FROM fb_group_contributors c
JOIN pro_subscribers s
  ON s.facebook_name IS NULL
 AND s.status = 'active'
 AND s.date_subscribed BETWEEN c.latest_window_end - INTERVAL '28 days'
                           AND c.latest_window_end
WHERE c.group_type = 'pro'
  AND c.pro_subscriber_id IS NULL
ORDER BY c.facebook_name, s.date_subscribed DESC;

-- ─── 9. Snapshot drift detection ─────────────────────────────────────────────
-- If a snapshot's active_pro_subscribers diverges from a freshly-computed
-- count, the snapshot is stale — operator should record a new one.
SELECT s.snapshot_date,
       s.active_pro_subscribers AS recorded,
       (SELECT COUNT(*) FROM pro_subscribers
        WHERE status = 'active'
          AND date_subscribed <= s.snapshot_date
          AND (date_churned IS NULL OR date_churned > s.snapshot_date)
       ) AS recomputed,
       s.gross_mrr, s.net_mrr
FROM funnel_daily_snapshots s
ORDER BY s.snapshot_date DESC
LIMIT 30;
