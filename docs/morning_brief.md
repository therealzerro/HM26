# Morning Brief — Runbook

**Trigger:** when the operator types `morning brief` or `morning brief for YYYY-MM-DD` in Claude Code.

**Goal:** in one Claude turn, deliver yesterday's validation + today's tiered bet sheet so the operator can place bets without running any SQL themselves.

**Execution model:** Claude runs the 5 SQL queries below via the `mcp__supabase-hitmaster__execute_sql` tool, formats results into the **Output Template** at the bottom, and presents in chat. No file edits unless the operator asks for follow-up changes.

**Date resolution:**
- `morning brief` with no date → use `CURRENT_DATE` for today, `CURRENT_DATE - 1` for yesterday
- `morning brief for 2026-06-10` → use the explicit date for today, derive yesterday by subtracting 1

**Data-model note — slate position (BUG-170, 2026-08-02):**
Slate position comes from `slate_snapshots.top_k_straights_json` only. Two
different fields are both named `rank`; they are not interchangeable:

| field | meaning | range |
|---|---|---|
| `top_k_straights_json[].rank` | **slate position** — equals array ordinality | always 1–6 |
| `daily_intelligence.rank` | top-30 indicator ordering | 1–30, and 31+ for on-slate picks that fell outside the top 30 |

Never derive "pick #1" from `daily_intelligence.rank`. Midday routinely places
its whole slate outside the DI top 30 (8/1 ranks were 31–36; 7/31's pos-6 pick
carried DI rank 21 while pos 1 carried 31), so `MIN(rank)` returns an arbitrary
position. Use `daily_intelligence` for hit flags and signal values, joined on
`(slate_date, mode, scope, combo)` — never for ordering.

---

## Query 1 — Yesterday's Validation

Verifies yesterday's report row is current + reports per-scope hit rate vs baseline.

**OPS-01 (2026-06-11): there are no pg_cron jobs anymore.** `engine_daily_report` is written only by Daily Workflow Step 5 (operator clicks before 8:30am ET, after importing results + input). A stale/missing report row means the workflow hasn't run yet today — not a cron failure.

```sql
-- BUG-170: slate order comes from the snapshot, NOT daily_intelligence.rank.
-- daily_intelligence is joined only for hit flags, on (date, mode, scope, combo).
WITH slate_picks AS (
  SELECT
    s.scope,
    (p.value ->> 'rank')::int AS slate_pos,   -- == array ordinality, always 1..6
    (p.value ->> 'combo')     AS combo
  FROM slate_snapshots s,
       LATERAL jsonb_array_elements(s.top_k_straights_json) p
  WHERE s.slate_date = (CURRENT_DATE - INTERVAL '1 day')
    AND s.deleted_at IS NULL
    AND s.mode = 'balanced'
),
pick_outcomes AS (
  SELECT
    sp.scope, sp.slate_pos, sp.combo,
    COALESCE(di.hit_box OR di.hit_straight, false) AS is_hit
  FROM slate_picks sp
  LEFT JOIN daily_intelligence di
    ON di.slate_date = (CURRENT_DATE - INTERVAL '1 day')
   AND di.mode  = 'balanced'
   AND di.scope = sp.scope
   AND di.combo = sp.combo
),
yesterday_perf AS (
  SELECT
    scope,
    COUNT(*)         AS slate_picks,
    SUM(is_hit::int) AS pick_hits,
    MAX(is_hit::int) AS slate_had_hit,
    MAX(combo) FILTER (WHERE slate_pos = 1) AS pick1_combo,
    CASE WHEN bool_or(is_hit AND slate_pos = 1) THEN 'HIT' ELSE 'MISS' END AS pick1_outcome,
    -- which positions actually carried the day (feeds the position-inversion work)
    COALESCE(
      STRING_AGG(slate_pos::text || ':' || combo, ', ' ORDER BY slate_pos)
        FILTER (WHERE is_hit),
      '—'
    ) AS hit_positions
  FROM pick_outcomes
  GROUP BY scope
),
report_row AS (
  SELECT scope, hits_count, straights_count, boxes_count, rate, updated_at
  FROM engine_daily_report
  WHERE slate_date = (CURRENT_DATE - INTERVAL '1 day')
),
baselines AS (
  -- 7d / 30d slate match rates, from snapshots × histories.
  -- BUG-171: the old version derived these from daily_intelligence.on_slate.
  -- DI is missing 16 slate-days since 2026-04-18 (including a contiguous
  -- 07-01→07-08 block); those days dropped out of the DENOMINATOR entirely, so
  -- a "30d" rate was silently computed over as few as 24 days. Snapshots and
  -- histories are both complete. This also matches how lib/brief/computeBrief.ts
  -- rolls its windows, so the SQL brief and the in-app Brief tab now agree.
  SELECT
    scope,
    COUNT(*) FILTER (WHERE d_back <= 7)  AS days_7d,
    COUNT(*) FILTER (WHERE d_back <= 30) AS days_30d,
    ROUND(100.0 * COUNT(*) FILTER (WHERE d_back <= 7  AND slate_had_hit = 1)
          / NULLIF(COUNT(*) FILTER (WHERE d_back <= 7),  0)::numeric, 1) AS rate_7d_pct,
    ROUND(100.0 * COUNT(*) FILTER (WHERE d_back <= 30 AND slate_had_hit = 1)
          / NULLIF(COUNT(*) FILTER (WHERE d_back <= 30), 0)::numeric, 1) AS rate_30d_pct
  FROM (
    SELECT
      s.scope,
      s.slate_date,
      (CURRENT_DATE - s.slate_date) AS d_back,
      MAX(CASE WHEN EXISTS (
            SELECT 1 FROM histories h
            WHERE h.date_et          = s.slate_date
              AND h.comboset_sorted  = (p.value ->> 'comboSet')
              -- allday matches ANY draw that day; midday/evening are strict
              AND (s.scope = 'allday' OR h.session = s.scope)
          ) THEN 1 ELSE 0 END) AS slate_had_hit
    FROM slate_snapshots s,
         LATERAL jsonb_array_elements(s.top_k_straights_json) p
    WHERE s.deleted_at IS NULL AND s.mode = 'balanced'
      AND s.slate_date >= CURRENT_DATE - INTERVAL '30 days'
      AND s.slate_date <  CURRENT_DATE
      -- drop days this scope was fully dark (Sunday closures) so they can't
      -- count as misses
      AND EXISTS (
        SELECT 1 FROM histories h2
        WHERE h2.date_et = s.slate_date
          AND (s.scope = 'allday' OR h2.session = s.scope)
      )
    GROUP BY s.scope, s.slate_date
  ) per_slate
  GROUP BY scope
)
SELECT
  y.scope,
  y.slate_picks,
  y.pick_hits,
  y.slate_had_hit AS slate_hit_yn,
  y.pick1_combo,
  y.pick1_outcome,
  y.hit_positions,
  r.hits_count AS report_hits,
  r.updated_at AS report_updated_at,
  b.rate_7d_pct,
  b.days_7d,
  b.rate_30d_pct,
  b.days_30d,
  CASE
    -- calendar-based, not a 12h age window: the workflow runs ~5-6am ET, so an
    -- age window cried stale on every good run from ~5pm ET onward (BUG-169
    -- fixed this in computeBrief.ts; the runbook kept the old semantics)
    WHEN r.updated_at IS NULL
      OR (r.updated_at AT TIME ZONE 'America/New_York')::date
         <> (NOW() AT TIME ZONE 'America/New_York')::date
      THEN 'REPORT STALE — Daily Workflow Step 5 has not run yet today'
    WHEN y.slate_had_hit = 1
      THEN 'OK'
    ELSE 'SLATE MISSED (no pick hit)'
  END AS status
FROM yesterday_perf y
LEFT JOIN report_row r USING (scope)
LEFT JOIN baselines b USING (scope)
ORDER BY y.scope;
```

**Interpret:**
- `pick1_combo` / `pick1_outcome` are **slate position 1**, read from the snapshot — see the data-model note above. `pick1_outcome = HIT` → reorder sort working as designed
- `hit_positions` lists `pos:combo` for every pick that matched. This is the feed for the midday position-inversion work — check whether hits keep landing at positions 3–6
- `report_hits < pick_hits` AND report row fresh → Step 5 mis-aggregating (BUG-EDR lineage) — investigate
- `report_updated_at` not on today's ET calendar date, or row missing → workflow not yet run today; the brief's hit numbers come from `daily_intelligence` and remain valid, but remind the operator to click Daily Workflow
- Per-scope `rate_7d_pct` vs `rate_30d_pct`: if 7d trails 30d by > 10pp, scope is regressing
- `days_7d` / `days_30d` are the actual denominators. They should read 7 and 30; anything lower means missing snapshots or a scope-dark stretch, and the rate is over a shorter window than its label implies

---

## Query 2 — Today's Slates Pre-Flight

Confirms slates exist for today with all the new metadata fields (ENG-STATE-DATA-05 + ENG-SLATE-METRICS-06).

```sql
SELECT
  scope,
  jsonb_array_length(top_k_straights_json) AS pick_count,
  (top_k_straights_json -> 0 ->> 'combo') AS pick1_combo,
  (top_k_straights_json -> 0 ->> 'tag') AS pick1_tag,
  (top_k_straights_json -> 0 ->> 'bestOrder') AS pick1_straight_order,
  (top_k_straights_json -> 0 ->> 'recentStateHits14d')::int AS pick1_hits14d,
  (horizons_present_json ->> '_recent7dMatchRatePct')::numeric AS slate_7d_pct,
  (horizons_present_json ->> '_recent30dMatchRatePct')::numeric AS slate_30d_pct,
  (horizons_present_json ->> '_engineVersion') AS engine_version,
  updated_at_et,
  CASE
    WHEN jsonb_array_length(top_k_straights_json) != 6 THEN 'FAIL — pick count != 6'
    WHEN (top_k_straights_json -> 0 ->> 'tag') IS NULL THEN 'WARN — pre-v39 slate (no metadata)'
    WHEN (horizons_present_json ->> '_recent7dMatchRatePct') IS NULL THEN 'WARN — no slate match rate (regen needed)'
    WHEN updated_at_et < NOW() - INTERVAL '24 hours' THEN 'FAIL — slate is stale'
    ELSE 'PASS'
  END AS status
FROM slate_snapshots
WHERE slate_date = CURRENT_DATE AND deleted_at IS NULL AND mode = 'balanced'
ORDER BY scope;
```

**Interpret:**
- 3 rows expected (midday, evening, allday)
- All `status = PASS` → safe to proceed to bets
- `WARN — pre-v39 slate` → that scope's slate was generated before ENG-STATE-DATA-05 shipped; remediation = regen that scope
- `FAIL` → don't bet that scope until investigated

---

## Query 3 — Today's Strategic Picks (Full Tiered Table)

Same as Query B of `docs/queries/daily_strategic_picks.sql`. Joins live slate with 30d Top-10 jurisdictions + 90d per-comboset footprint.

```sql
WITH recent_draws_30d AS (
  SELECT h.date_et, h.session, h.jurisdiction, h.comboset_sorted
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '30 days')
    AND h.date_et < CURRENT_DATE
),
draws_with_slate_check AS (
  SELECT d.*, EXISTS (
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
  SELECT jurisdiction FROM draws_with_slate_check
  GROUP BY jurisdiction HAVING COUNT(*) >= 20
  ORDER BY ROUND(100.0 * SUM(is_box_hit::int) / COUNT(*)::numeric, 1) DESC,
           SUM(is_box_hit::int) DESC LIMIT 10
),
combo_per_jx_90d AS (
  SELECT h.comboset_sorted AS combo_set, h.jurisdiction, COUNT(*) AS hits
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '90 days') AND h.date_et < CURRENT_DATE
    AND h.jurisdiction IN (SELECT jurisdiction FROM top10_jurisdictions)
  GROUP BY h.comboset_sorted, h.jurisdiction
),
combo_top10_footprint_90d AS (
  SELECT combo_set, SUM(hits) AS total_top10_hits,
    STRING_AGG(jurisdiction || ':' || hits::text, ', '
               ORDER BY hits DESC, jurisdiction) AS report_top_jx
  FROM combo_per_jx_90d GROUP BY combo_set
),
today_slate AS (
  SELECT s.scope, (p.value ->> 'rank')::int AS pos,
    (p.value ->> 'combo') AS combo, (p.value ->> 'comboSet') AS combo_set,
    (p.value ->> 'bestOrder') AS straight_bet, (p.value ->> 'tag') AS tag,
    COALESCE((p.value ->> 'recentStateHits14d')::int, 0) AS engine_14d_hits,
    (p.value -> 'topJurisdictions') AS engine_top_states
  FROM slate_snapshots s,
       LATERAL jsonb_array_elements(s.top_k_straights_json) p
  WHERE s.slate_date = CURRENT_DATE AND s.deleted_at IS NULL AND s.mode = 'balanced'
),
convergence AS (
  SELECT combo_set, COUNT(DISTINCT scope) AS scopes_count,
         STRING_AGG(DISTINCT scope, '+' ORDER BY scope) AS scope_set
  FROM today_slate GROUP BY combo_set
)
SELECT
  ts.scope, ts.pos AS slate_pos, ts.combo, ts.combo_set,
  ts.straight_bet, ts.tag,
  COALESCE(ctf.total_top10_hits, 0) AS report_90d_top10_hits,
  ctf.report_top_jx AS report_top_jurisdictions,
  ts.engine_14d_hits, ts.engine_top_states,
  conv.scope_set AS slate_appearances,
  CASE
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 AND conv.scopes_count > 1
      THEN 'T1 — Standout × Convergence'
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10
      THEN 'T1 — Report standout'
    WHEN conv.scopes_count > 1
      THEN 'T2 — Cross-scope convergence'
    WHEN ts.tag = 'overdue'
      THEN 'T2 — Engine overdue'
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 6
      THEN 'T3 — Moderate footprint'
    WHEN ts.tag = 'strong'
      THEN 'T3 — Engine strong'
    ELSE 'T4 — Depth'
  END AS tier
FROM today_slate ts
LEFT JOIN combo_top10_footprint_90d ctf ON ctf.combo_set = ts.combo_set
LEFT JOIN convergence conv             ON conv.combo_set = ts.combo_set
ORDER BY
  CASE
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 AND conv.scopes_count > 1 THEN 1
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 10 THEN 2
    WHEN conv.scopes_count > 1 THEN 3
    WHEN ts.tag = 'overdue' THEN 4
    WHEN COALESCE(ctf.total_top10_hits, 0) >= 6 THEN 5
    WHEN ts.tag = 'strong' THEN 6
    ELSE 7
  END,
  COALESCE(ctf.total_top10_hits, 0) DESC, ts.scope, ts.pos;
```

---

## Query 4 — Top 10 Jurisdictions (30d leaderboard, for context)

Provides the "where" context so the brief can flag bet-state recommendations.

```sql
WITH recent_draws_30d AS (
  SELECT h.date_et, h.session, h.jurisdiction, h.comboset_sorted
  FROM histories h
  WHERE h.date_et >= (CURRENT_DATE - INTERVAL '30 days')
    AND h.date_et < CURRENT_DATE
),
draws_with_slate_check AS (
  SELECT d.*, EXISTS (
    SELECT 1 FROM slate_snapshots s,
         LATERAL jsonb_array_elements(s.top_k_straights_json) p
    WHERE s.slate_date = d.date_et AND s.deleted_at IS NULL
      AND s.mode = 'balanced'
      AND s.scope IN (d.session, 'allday')
      AND (p ->> 'comboSet') = d.comboset_sorted
  ) AS is_box_hit
  FROM recent_draws_30d d
)
SELECT jurisdiction, COUNT(*) AS draws, SUM(is_box_hit::int) AS box_hits,
       ROUND(100.0 * SUM(is_box_hit::int) / COUNT(*)::numeric, 1) AS box_pct
FROM draws_with_slate_check
GROUP BY jurisdiction
HAVING COUNT(*) >= 20
ORDER BY box_pct DESC, box_hits DESC
LIMIT 10;
```

---

## Query 5 — Convergence Detection

Picks that appear on multiple scopes' slates — the "convergence" signal.

```sql
SELECT
  (p.value ->> 'comboSet') AS combo_set,
  COUNT(DISTINCT s.scope) AS scopes_count,
  STRING_AGG(DISTINCT s.scope, '+' ORDER BY s.scope) AS scope_set,
  STRING_AGG(s.scope || ':rank' || (p.value ->> 'rank'), ', '
             ORDER BY s.scope) AS detail
FROM slate_snapshots s,
     LATERAL jsonb_array_elements(s.top_k_straights_json) p
WHERE s.slate_date = CURRENT_DATE AND s.deleted_at IS NULL AND s.mode = 'balanced'
GROUP BY (p.value ->> 'comboSet')
HAVING COUNT(DISTINCT s.scope) > 1
ORDER BY COUNT(DISTINCT s.scope) DESC, combo_set;
```

---

## Query 6 — Calibrated Pick Probabilities + Stake Split (CALIB-01, added 2026-06-10)

Run `docs/queries/pick_probabilities.sql` verbatim. It applies the logistic
coefficients in `app_config.pick_prob_calibration` to today's on-slate picks
and returns `p_hit_pct` (calibrated probability of ≥1 box match in scope
today) and `stake_share_pct` (p_hit normalized within scope).

Use it in the brief's allocation section: split each scope's budget by
`stake_share_pct` instead of equal-weighting the tiers. Caveats to repeat in
the brief when relevant:
- CALIB-02 (2026-07-24): the model is fit on on-slate picks (the apply
  population), so `p_hit_pct` is a real per-scope session probability —
  typical levels midday ~15-17%, evening ~19-20%, allday ~33-35%. Trust the
  levels; within-scope pick-to-pick ordering is noise-grade (SIGNAL-INFO-01),
  so don't present small p_hit differences as meaningful.
- If the coefficients are older than ~14 days (check `fitted_at` in the
  app_config row), flag "calibration stale — run `npm run calibrate:picks`,
  review the gate line (test Brier ≤ trivial), then update the app_config row."
- Doubles picks show the stored scope base rate, pre-halved for doubles' 3-of-6
  permutation coverage — not a per-pick estimate.

---

## Output Template

After running the 5 queries (+ Query 6 for allocation), Claude formats and presents this in chat:

```
══════════════════════════════════════════════════════════════════════
MORNING BRIEF — [today_date]
══════════════════════════════════════════════════════════════════════

[1] YESTERDAY'S VALIDATION ([yesterday_date])
──────────────────────────────────────────────────────────────────────
Pre-flight: [PASS / FAIL with details from Query 1.status]

Per-scope performance (pick # = SLATE POSITION, from the snapshot):
  midday   pos1 = [combo] → [HIT/MISS]   pick hits: [n]/6   slate hit: [Y/N]
  evening  pos1 = [combo] → [HIT/MISS]   pick hits: [n]/6   slate hit: [Y/N]
  allday   pos1 = [combo] → [HIT/MISS]   pick hits: [n]/6   slate hit: [Y/N]

Which positions hit (from hit_positions):
  midday   [pos:combo, …]   evening  [pos:combo, …]   allday  [pos:combo, …]

Slate-level rolling rates:
  midday   7d: [X]% (n=[days_7d])  vs  30d: [Y]% (n=[days_30d])   (drift: ±Zpp)
  evening  7d: [X]% (n=[days_7d])  vs  30d: [Y]% (n=[days_30d])   (drift: ±Zpp)   [⚠️ if evening 7d < 75]
  allday   7d: [X]% (n=[days_7d])  vs  30d: [Y]% (n=[days_30d])   (drift: ±Zpp)
  [flag if either n is below its label]

[Reorder validation: how many pos-1 picks hit / 3]
[CONFIG-15 evening check: still holding / regressing — recommendation if regressing]

══════════════════════════════════════════════════════════════════════
[2] TODAY'S SLATES PRE-FLIGHT
──────────────────────────────────────────────────────────────────────
midday   [PASS/FAIL]  pick1=[combo] ([tag])  7d=[pct]  v=[engine]
evening  [PASS/FAIL]  pick1=[combo] ([tag])  7d=[pct]  v=[engine]
allday   [PASS/FAIL]  pick1=[combo] ([tag])  7d=[pct]  v=[engine]

[Any FAILs → next step required (regen instructions)]

══════════════════════════════════════════════════════════════════════
[3] TODAY'S STRATEGIC PICKS (Tier-Ranked)
──────────────────────────────────────────────────────────────────────

🔥 T1 — STANDOUT × CONVERGENCE (highest evidence)
   [no picks if no convergence-standout, say so]
   For each: scope, pos, combo, straight order, 90d hits, top jurisdictions, slate appearances

⭐ T1 — REPORT STANDOUT (90d footprint ≥ 10)
   [for each]: scope, pos, combo, straight, hits, top jurisdictions

✦ T2 — CROSS-SCOPE CONVERGENCE (multi-scope but lower footprint)
   [for each]

✦ T2 — ENGINE OVERDUE (pick #1 by reorder)
   [for each]

T3 and T4: collapsed mention only — "X picks in T3/T4, full table available on request"

══════════════════════════════════════════════════════════════════════
[4] RECOMMENDED ALLOCATION — for budget of $5-7 (default)
──────────────────────────────────────────────────────────────────────
Top-down from T1. **The operator bets each combo across the ENTIRE session
board (all live draws), never per-state** — jurisdiction footprints are
evidence for which combo, not where to place. Frame allocation in units:

  Board economics: [session] board ≈ [N] draws × $0.25 = $[N/4]/unit.
  Payouts per hitting draw: straight 900:1 = $225/unit, box 150:1 = $37.50/unit.
  Win probability = calibrated per-scope session p_hit from Query 6.

  Leg 1 — [T1×Convergence pick]: [n]S + [n]B on the [session] board,
          straight order [straight_order], p(≥1 box in session) = [p_hit]%
  Leg 2 (optional) — [next T1 pick]: [n]B on the [session] board

Converge on 1-2 named legs (operator style: max bet, ride until hit, max
3 days), not a portfolio split. [Scale unit counts to stated budget]

══════════════════════════════════════════════════════════════════════
[5] RED FLAGS / NOTES
──────────────────────────────────────────────────────────────────────
- [any pre-flight FAILs]
- [evening 7d regression > 5pp from baseline → consider partial CONFIG-15 revert]
- [any convergence picks with new state additions]
- [any picks the report flags as "standout" but helper doesn't surface as T1]
- [yesterday's misses worth investigating]

══════════════════════════════════════════════════════════════════════
```

---

## Decision Rules for the Brief Generator

### When budget isn't specified
Default to **$5-7** allocation. Operator can say "morning brief budget $X" to override.

### When yesterday's data is incomplete
- If Query 1 returns stale/missing `report_updated_at` (Daily Workflow not yet run today):
  - Yesterday Validation stays valid (hits read from `daily_intelligence`), but check whether yesterday's results have been imported (`histories` for yesterday); if not, hit flags are also incomplete — say so
  - Add red flag: "Daily Workflow hasn't run yet today — import results + click it before 8:30am ET (OPS-01: no background jobs will do this for you)"

### When today's slates aren't ready
- If Query 2 returns 0 rows for any scope:
  - Add red flag: "Today's [scope] slate not generated — trigger Daily Workflow Step 1 first"
  - Skip Strategic Picks for that scope; show for the ones that exist

### When no T1 picks exist
- If Query 3 returns nothing in T1:
  - Lead with T2 in the Recommended Allocation
  - Add note: "No T1 picks today — all bets are T2-evidence (engine signal only, no historical jurisdiction footprint)"

### When the brief date is a Sunday
Several states don't draw on Sundays (source: Lottery Post schedule panel, captured 2026-07-26 — `assets/Screen Shot 2026-07-26 at 4.04.57 PM.png`):
- **Fully dark**: TX (all 4 draws), WV, PR (PR not ingested anyway)
- **Midday-dark, evening live**: TN (Morning + Midday off), SC (Midday off), AR (Midday off)
- Net ingested-board impact: **midday −6 draws** (TN×2, TX×2, SC, AR), **evening −3 draws** (TX×2, WV), allday −9.

Apply:
1. Section 4 board economics must use the Sunday-reduced draw counts — fewer draws lowers both the unit cost and the true session p(≥1 hit) below the Q6 fitted p_hit (which averages across all days).
2. Discount T1 jurisdiction-footprint evidence resting mainly on that session's dark states (especially TX — a 4-draw contributor; TN/SC/AR for midday legs).
3. Monday's Yesterday Validation: judge Sunday sessions against the smaller board before flagging a 0-hit day.

### When evening 7d match rate < 75%
- Add red flag in Section 5: "Evening 7d match rate is [X]% (vs 30d baseline [Y]%) — CONFIG-15 may need partial revert (CO 0 → 10). Run: `UPDATE app_config SET value='{...with CO=10...}' WHERE key='engine_weights_balanced_evening';`"

### When the operator asks for follow-up
- "Show me the full T3/T4 picks" → expand Section 3
- "What were yesterday's misses?" → drill into Query 1 details
- "Compare with the PDF report" → load `assets/zk6_jurisdiction_correlation_[date].pdf` and cross-check

---

---

## Step 6 — Generate the PDF (after presenting brief in chat)

After running the 5 queries and presenting the chat output, Claude must
also generate the styled PDF for archival / sharing:

```bash
set -a; source .env; set +a; npx tsx scripts/generate-jurisdiction-report.ts [date]
```

- `[date]` is the same `today` that the brief used (CURRENT_DATE or operator-supplied)
- Script writes `assets/zk6_jurisdiction_correlation_<date>.pdf` (~64KB)
- Matches the style of historical PDFs in `assets/`
- Includes Top-10 jurisdictions + per-scope split + today's picks + watch list + takeaways
- Independent of the chat brief — PDF can be committed to git for archival

When operator says "generate the PDF" or "give me the PDF" without other context:
- Generate for `CURRENT_DATE` and confirm path
- If yesterday's date needed: explicit "PDF for YYYY-MM-DD"

## Validation Checklist (run when modifying this runbook)

1. All 5 queries execute against today's data without error
2. Output template matches actual data shape
3. Red flag triggers fire correctly (test with stale data)
4. Decision rules cover all scopes-out-of-sync cases

The runbook has been validated against `2026-06-09` data prior to commit. See validation output in the original commit message.
