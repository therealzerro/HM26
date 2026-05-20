-- =============================================================
-- Top States by ZK6 Verified Hits — Last 30 Days
-- Generated: 2026-05-20 | READ-ONLY analysis
-- Source: public.adaptive_tracking (canonical verified-hit table)
-- =============================================================
--
-- Filter logic mirrors the consumer "track-record" screen
-- (app/track-record.tsx) and Home "matches today" pill
-- (app/(tabs)/index.tsx):
--
--   1.  slate_date in last 30 days
--   2.  matched_state IS NOT NULL          -- only verified-against-draw rows
--   3.  hit_box = true OR hit_straight = true
--   4.  mode IN ('balanced','conservative','aggressive')
--                                          -- excludes diagnostic / sweep modes
--   5.  scope ↔ matched_session gate (lib scopeMatchesSession):
--         scope='allday'  → any session
--         scope='midday'  → matched_session='midday'  only
--         scope='evening' → matched_session='evening' only
--   6.  Dedupe key: (slate_date, scope, combo, matched_state)
--       → multi-state matches (e.g. 916 hits both WI and ME,NH,VT)
--         each count as their own match; multi-mode hits collapse.
--
-- ZK6 scope: adaptive_tracking is the K6 slate trail. ZK30 has
-- its own jurisdiction-specific tables and is not represented in
-- this stream, so no extra ZK30 exclusion filter is required.
-- =============================================================

-- ---------------------------------------------------------------
-- TASK 2 · TOP 10 STATES (canonical ordering)
-- Tie-break: total_matches DESC, straight DESC, latest_hit DESC
-- ---------------------------------------------------------------
WITH last30 AS (
  SELECT slate_date, scope, combo, matched_state, matched_session,
         hit_box, hit_straight
  FROM adaptive_tracking
  WHERE slate_date >= (CURRENT_DATE - INTERVAL '30 days')
    AND matched_state IS NOT NULL
    AND (hit_box = true OR hit_straight = true)
    AND mode IN ('balanced','conservative','aggressive')
),
scope_filtered AS (
  SELECT * FROM last30
  WHERE  (scope = 'allday')
      OR (scope = 'midday'  AND lower(matched_session) = 'midday')
      OR (scope = 'evening' AND lower(matched_session) = 'evening')
),
deduped AS (
  SELECT slate_date, scope, combo, matched_state,
         BOOL_OR(hit_straight) AS any_straight,
         BOOL_OR(hit_box)      AS any_box
  FROM scope_filtered
  GROUP BY slate_date, scope, combo, matched_state
)
SELECT
  matched_state                                                       AS state,
  COUNT(*)                                                            AS total_matches,
  SUM(CASE WHEN any_straight                  THEN 1 ELSE 0 END)::int AS straight,
  SUM(CASE WHEN any_straight=false AND any_box THEN 1 ELSE 0 END)::int AS box_only,
  to_char(MIN(slate_date), 'FMMM-DD')                                 AS first_hit,
  to_char(MAX(slate_date), 'FMMM-DD')                                 AS latest_hit
FROM deduped
GROUP BY matched_state
ORDER BY total_matches DESC, straight DESC, latest_hit DESC
LIMIT 10;


-- ---------------------------------------------------------------
-- TASK 3 · COMBINED SECONDARY ANALYSIS (3a + 3b + 3c)
-- For the same canonical top-10 set:
--   slate attribution (midday/allday/evening)
--   draw time-of-day distribution (matched_session)
--   momentum: last 7d vs prior 23d
-- ---------------------------------------------------------------
WITH last30 AS (
  SELECT slate_date, scope, combo, matched_state, matched_session,
         hit_box, hit_straight
  FROM adaptive_tracking
  WHERE slate_date >= (CURRENT_DATE - INTERVAL '30 days')
    AND matched_state IS NOT NULL
    AND (hit_box = true OR hit_straight = true)
    AND mode IN ('balanced','conservative','aggressive')
),
scope_filtered AS (
  SELECT * FROM last30
  WHERE  (scope = 'allday')
      OR (scope = 'midday'  AND lower(matched_session) = 'midday')
      OR (scope = 'evening' AND lower(matched_session) = 'evening')
),
deduped AS (
  SELECT slate_date, scope, combo, matched_state, matched_session,
         BOOL_OR(hit_straight) AS any_straight,
         BOOL_OR(hit_box)      AS any_box
  FROM scope_filtered
  GROUP BY slate_date, scope, combo, matched_state, matched_session
),
state_summary AS (
  SELECT matched_state,
         COUNT(*)                                          AS total,
         SUM(CASE WHEN any_straight THEN 1 ELSE 0 END)     AS straight_n,
         MAX(slate_date)                                   AS last_date
  FROM deduped GROUP BY matched_state
),
top10 AS (
  SELECT matched_state FROM state_summary
  ORDER BY total DESC, straight_n DESC, last_date DESC
  LIMIT 10
)
SELECT
  d.matched_state                                                     AS state,
  SUM(CASE WHEN d.scope='midday'  THEN 1 ELSE 0 END)::int             AS midday_slate,
  SUM(CASE WHEN d.scope='allday'  THEN 1 ELSE 0 END)::int             AS allday_slate,
  SUM(CASE WHEN d.scope='evening' THEN 1 ELSE 0 END)::int             AS evening_slate,
  SUM(CASE WHEN lower(d.matched_session)='midday'  THEN 1 ELSE 0 END)::int AS midday_draw,
  SUM(CASE WHEN lower(d.matched_session)='evening' THEN 1 ELSE 0 END)::int AS evening_draw,
  SUM(CASE WHEN d.slate_date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS last7,
  SUM(CASE WHEN d.slate_date <  CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::int AS prior23,
  ROUND((SUM(CASE WHEN d.slate_date >= CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::numeric / 7.0 )::numeric, 2) AS last7_pd,
  ROUND((SUM(CASE WHEN d.slate_date <  CURRENT_DATE - INTERVAL '7 days' THEN 1 ELSE 0 END)::numeric / 23.0)::numeric, 2) AS prior23_pd,
  COUNT(*)                                                            AS total
FROM deduped d
JOIN top10 t ON t.matched_state = d.matched_state
GROUP BY d.matched_state
ORDER BY total DESC, state;
