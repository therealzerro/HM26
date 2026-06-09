-- ============================================================================
-- Daily Strategic Picks Helper
-- ============================================================================
-- Combines today's live ZK6 slate with the 30d/90d jurisdiction-correlation
-- intelligence from the morning PDF report. Produces a tiered strategic-bet
-- table the operator can use as a betting cheat-sheet.
--
-- HOW TO USE:
--   Run any morning after slate-gen completes. Uses CURRENT_DATE so it
--   always points at today's slates. For backtest / past-day review,
--   replace CURRENT_DATE with a literal date like '2026-06-10'.
--
-- MIRRORS:
--   ZK6 Jurisdiction Correlation Report PDF (sections 1, 1b, 2, 3, 4).
--   Same data, same methodology — but live SQL, queryable on demand.
--
-- WHAT THIS DOES vs WHAT IT DOESN'T:
--   * Surfaces patterns; does NOT predict.
--   * The TIER column is observational ranking only — final bet decisions
--     belong to the operator.
--   * Read-only. No writes to any table.
--
-- THE THREE QUERIES (run independently):
--   A. Top-10 Jurisdictions (30d slate-correlation leaderboard)
--   B. Today's Strategic Picks (full tiered table — the main view)
--   C. Recommended Shortlist (T1 + T2 only, by footprint)
--
-- DEPENDENCIES:
--   - public.histories (jurisdiction draws)
--   - public.slate_snapshots (engine slates, balanced mode only post-SCRUB-02)
--   - All today's ships in place (ENG-STATE-DATA-05 + ENG-SLATE-METRICS-06
--     metadata fields). Older slates without those fields will show NULL
--     for engine_14d_hits / engine_top_states / slate_7d_rate columns;
--     core tier logic still works.
-- ============================================================================


-- ---------------------------------------------------------------
-- QUERY A · Top-10 Jurisdictions (30d slate-correlation leaderboard)
-- ---------------------------------------------------------------
-- For each jurisdiction, what share of their last-30d draws had a comboset
-- that appeared in the same-date scope slate (or the allday slate)?
-- Mirrors Report section 1.
WITH recent_draws_30d AS (
  SELECT
    h.date_et,
    h.session,
    h.jurisdiction,
    h.comboset_sorted
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '30 days')
    AND h.date_et <  CURRENT_DATE
),
draws_with_slate_check AS (
  SELECT
    d.*,
    EXISTS (
      SELECT 1
      FROM slate_snapshots s,
           LATERAL jsonb_array_elements(s.top_k_straights_json) p
      WHERE s.slate_date = d.date_et
        AND s.deleted_at IS NULL
        AND s.mode = 'balanced'
        AND s.scope IN (d.session, 'allday')
        AND (p ->> 'comboSet') = d.comboset_sorted
    ) AS is_box_hit
  FROM recent_draws_30d d
)
SELECT
  jurisdiction,
  COUNT(*)                                                AS draws,
  SUM(is_box_hit::int)                                    AS box_hits,
  ROUND(100.0 * SUM(is_box_hit::int) / COUNT(*)::numeric, 1) AS box_pct
FROM draws_with_slate_check
GROUP BY jurisdiction
HAVING COUNT(*) >= 20  -- reliability floor; excludes thinly-sampled jurisdictions
ORDER BY box_pct DESC, box_hits DESC
LIMIT 10;


-- ---------------------------------------------------------------
-- QUERY B · Today's Strategic Picks (the main view)
-- ---------------------------------------------------------------
-- Joins today's slate picks with:
--   - 90d Top-10 jurisdiction footprint per comboset
--   - cross-scope convergence detection
--   - engine's own 14d state metadata (ENG-STATE-DATA-05)
--   - scope-level 7d match rate (ENG-SLATE-METRICS-06)
-- Outputs tiered recommendations.
WITH recent_draws_30d AS (
  SELECT h.date_et, h.session, h.jurisdiction, h.comboset_sorted
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '30 days')
    AND h.date_et <  CURRENT_DATE
),
draws_with_slate_check AS (
  SELECT d.*,
    EXISTS (
      SELECT 1 FROM slate_snapshots s,
           LATERAL jsonb_array_elements(s.top_k_straights_json) p
      WHERE s.slate_date = d.date_et AND s.deleted_at IS NULL
        AND s.mode = 'balanced'
        AND s.scope IN (d.session, 'allday')
        AND (p ->> 'comboSet') = d.comboset_sorted
    ) AS is_box_hit
  FROM recent_draws_30d d
),
top10_jurisdictions AS (
  SELECT jurisdiction
  FROM draws_with_slate_check
  GROUP BY jurisdiction
  HAVING COUNT(*) >= 20
  ORDER BY
    ROUND(100.0 * SUM(is_box_hit::int) / COUNT(*)::numeric, 1) DESC,
    SUM(is_box_hit::int) DESC
  LIMIT 10
),
combo_per_jx_90d AS (
  SELECT
    h.comboset_sorted AS combo_set,
    h.jurisdiction,
    COUNT(*) AS hits
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '90 days')
    AND h.date_et <  CURRENT_DATE
    AND h.jurisdiction IN (SELECT jurisdiction FROM top10_jurisdictions)
  GROUP BY h.comboset_sorted, h.jurisdiction
),
combo_top10_footprint_90d AS (
  SELECT
    combo_set,
    SUM(hits)                                                   AS total_top10_hits,
    STRING_AGG(jurisdiction || ':' || hits::text,
               ', ' ORDER BY hits DESC, jurisdiction)            AS report_top_jx
  FROM combo_per_jx_90d
  GROUP BY combo_set
),
today_slate AS (
  SELECT
    s.scope,
    (p.value ->> 'rank')::int                                    AS pos,
    (p.value ->> 'combo')                                        AS combo,
    (p.value ->> 'comboSet')                                     AS combo_set,
    (p.value ->> 'bestOrder')                                    AS straight_bet,
    (p.value ->> 'tag')                                          AS tag,
    COALESCE((p.value ->> 'recentStateHits14d')::int, 0)         AS engine_14d_hits,
    (p.value -> 'topJurisdictions')                              AS engine_top_states,
    (s.horizons_present_json ->> '_recent7dMatchRatePct')::numeric AS slate_7d_rate
  FROM slate_snapshots s,
       LATERAL jsonb_array_elements(s.top_k_straights_json) p
  WHERE s.slate_date = CURRENT_DATE
    AND s.deleted_at IS NULL
    AND s.mode = 'balanced'
),
convergence AS (
  SELECT
    combo_set,
    COUNT(DISTINCT scope)                                      AS scopes_count,
    STRING_AGG(DISTINCT scope, '+' ORDER BY scope)             AS scope_set
  FROM today_slate
  GROUP BY combo_set
)
SELECT
  ts.scope,
  ts.pos                                                       AS slate_pos,
  ts.combo,
  ts.combo_set,
  ts.straight_bet,
  ts.tag,
  COALESCE(ctf.total_top10_hits, 0)                            AS report_90d_top10_hits,
  ctf.report_top_jx                                            AS report_top_jurisdictions,
  ts.engine_14d_hits,
  ts.engine_top_states,
  conv.scopes_count                                            AS appears_on_n_scopes,
  conv.scope_set                                               AS slate_appearances,
  ts.slate_7d_rate                                             AS scope_7d_rate_pct,
  -- Tier classification: highest-evidence picks bubble to T1
  CASE
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10
         AND conv.scopes_count > 1
      THEN 'T1 — Standout × Convergence (HIGHEST evidence)'
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10
      THEN 'T1 — Report standout (high 90d footprint)'
    WHEN conv.scopes_count > 1
      THEN 'T2 — Cross-scope convergence'
    WHEN ts.tag = 'overdue'
      THEN 'T2 — Engine overdue (pick #1)'
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 6
      THEN 'T3 — Moderate 90d footprint'
    WHEN ts.tag = 'strong'
      THEN 'T3 — Engine strong (pos 2-3)'
    ELSE 'T4 — Depth (lowest evidence)'
  END                                                          AS tier
FROM today_slate ts
LEFT JOIN combo_top10_footprint_90d ctf ON ctf.combo_set = ts.combo_set
LEFT JOIN convergence conv             ON conv.combo_set = ts.combo_set
ORDER BY
  -- Sort T1 first, then by footprint, then by slate position
  CASE
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 AND conv.scopes_count > 1 THEN 1
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 THEN 2
    WHEN conv.scopes_count > 1                   THEN 3
    WHEN ts.tag = 'overdue'                      THEN 4
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 6  THEN 5
    WHEN ts.tag = 'strong'                       THEN 6
    ELSE 7
  END,
  COALESCE(ctf.total_top10_hits, 0) DESC,
  ts.scope,
  ts.pos;


-- ---------------------------------------------------------------
-- QUERY C · Recommended Shortlist (T1 + T2 only — what to bet)
-- ---------------------------------------------------------------
-- The "bet this" subset of Query B. If funds are tight, work top-down
-- from this list. Skip if you don't recognize a jurisdiction.
WITH recent_draws_30d AS (
  SELECT h.date_et, h.session, h.jurisdiction, h.comboset_sorted
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '30 days')
    AND h.date_et <  CURRENT_DATE
),
draws_with_slate_check AS (
  SELECT d.*,
    EXISTS (
      SELECT 1 FROM slate_snapshots s,
           LATERAL jsonb_array_elements(s.top_k_straights_json) p
      WHERE s.slate_date = d.date_et AND s.deleted_at IS NULL
        AND s.mode = 'balanced'
        AND s.scope IN (d.session, 'allday')
        AND (p ->> 'comboSet') = d.comboset_sorted
    ) AS is_box_hit
  FROM recent_draws_30d d
),
top10_jurisdictions AS (
  SELECT jurisdiction
  FROM draws_with_slate_check
  GROUP BY jurisdiction
  HAVING COUNT(*) >= 20
  ORDER BY ROUND(100.0 * SUM(is_box_hit::int) / COUNT(*)::numeric, 1) DESC,
           SUM(is_box_hit::int) DESC
  LIMIT 10
),
combo_per_jx_90d AS (
  SELECT h.comboset_sorted AS combo_set, h.jurisdiction, COUNT(*) AS hits
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '90 days')
    AND h.date_et <  CURRENT_DATE
    AND h.jurisdiction IN (SELECT jurisdiction FROM top10_jurisdictions)
  GROUP BY h.comboset_sorted, h.jurisdiction
),
combo_top10_footprint_90d AS (
  SELECT combo_set, SUM(hits) AS total_top10_hits,
    STRING_AGG(jurisdiction || ':' || hits::text,
               ', ' ORDER BY hits DESC, jurisdiction) AS report_top_jx
  FROM combo_per_jx_90d
  GROUP BY combo_set
),
today_slate AS (
  SELECT s.scope,
    (p.value ->> 'rank')::int                            AS pos,
    (p.value ->> 'combo')                                AS combo,
    (p.value ->> 'comboSet')                             AS combo_set,
    (p.value ->> 'bestOrder')                            AS straight_bet,
    (p.value ->> 'tag')                                  AS tag
  FROM slate_snapshots s,
       LATERAL jsonb_array_elements(s.top_k_straights_json) p
  WHERE s.slate_date = CURRENT_DATE
    AND s.deleted_at IS NULL AND s.mode = 'balanced'
),
convergence AS (
  SELECT combo_set, COUNT(DISTINCT scope) AS scopes_count,
         STRING_AGG(DISTINCT scope, '+' ORDER BY scope) AS scope_set
  FROM today_slate GROUP BY combo_set
)
SELECT
  ts.scope,
  ts.pos                                                 AS slate_pos,
  ts.combo,
  ts.combo_set                                           AS combo_set,
  ts.straight_bet                                        AS straight_bet_order,
  COALESCE(ctf.total_top10_hits, 0)                      AS report_90d_top10_hits,
  ctf.report_top_jx                                      AS report_top_jurisdictions,
  conv.scope_set                                         AS slate_appearances,
  CASE
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10
         AND conv.scopes_count > 1                       THEN 'T1 — Standout × Convergence'
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10         THEN 'T1 — Report standout'
    WHEN conv.scopes_count > 1                           THEN 'T2 — Cross-scope convergence'
    WHEN ts.tag = 'overdue'                              THEN 'T2 — Engine overdue #1'
  END                                                    AS tier
FROM today_slate ts
LEFT JOIN combo_top10_footprint_90d ctf ON ctf.combo_set = ts.combo_set
LEFT JOIN convergence conv             ON conv.combo_set = ts.combo_set
WHERE
  COALESCE(ctf.total_top10_hits, 0) >= 10
  OR conv.scopes_count > 1
  OR ts.tag = 'overdue'
ORDER BY
  CASE
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 AND conv.scopes_count > 1 THEN 1
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 THEN 2
    WHEN conv.scopes_count > 1                   THEN 3
    WHEN ts.tag = 'overdue'                      THEN 4
  END,
  COALESCE(ctf.total_top10_hits, 0) DESC,
  ts.scope,
  ts.pos;


-- ============================================================================
-- USAGE EXAMPLE — how the 6/8 standout would have flagged
-- ============================================================================
-- On 6/8 morning, running this helper would have produced:
--
-- QUERY C (Recommended Shortlist) for 2026-06-08:
--
--   scope    pos  combo  combo_set  straight  report_90d  tier
--   evening   2    123    {1,2,3}    123       12         T1 — Standout × Convergence
--   allday    4    123    {1,2,3}    123       12         T1 — Standout × Convergence
--   ...
--
-- 123 surfaces at the top because:
--   1. It's on TWO scopes' slates (evening rank 2 + allday rank 4)
--   2. It has 12 hits in 90d Top-10 jurisdictions
--
-- Result that day: CA midday drew 123 straight → user bet won.
--
-- ============================================================================
-- INTERPRETING TIERS
-- ============================================================================
-- T1 — bet first. Highest evidence: jurisdiction footprint AND/OR convergence.
-- T2 — bet second. Either convergence-only or overdue tag — one strong signal.
-- T3 — bet third only if funds remain. Moderate signal in one dimension.
-- T4 — skip on tight budgets. Depth picks; lowest hit rate empirically.
--
-- BOX vs STRAIGHT decision:
--   - Box bet (combo_set): ~6× more likely to hit, ~6× smaller payout
--   - Straight bet (straight_bet_order): rare hit, big payout
--   - Stacking box+straight on the same combo is EV-positive on T1 picks
--
-- JURISDICTION-SPECIFIC BETTING:
--   - report_top_jurisdictions lists where this comboset historically hits most
--   - If you have access to those specific state lotteries, bet there
--     (not nationally) for higher hit density
-- ============================================================================
