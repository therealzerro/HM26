# Pre-Flight Validation — Tomorrow's Slates

Operator dashboard for verifying tomorrow's slates after generation. Tuned for
2026-06-10 ships (ENG-MIDDAY/EVENING/ALLDAY-REORDER + TIEBREAK, ENG-STATE-DATA-05,
ENG-SLATE-METRICS-06, CONFIG-15 evening CO=0). Generic enough to reuse for
future days — search/replace `'2026-06-10'` with the target date.

**Usage:** run these in the order listed. Stop at the first FAIL. Each query is
self-contained and copy-pasteable.

---

## 1. Quick-glance dashboard (the 30-second view)

Run this single query first. Paints the entire picture of tomorrow's slates.

```sql
-- 1A. Single-query summary of tomorrow's slates
SELECT
  scope,
  (top_k_straights_json -> 0 ->> 'combo')        AS pick1,
  (top_k_straights_json -> 0 ->> 'tag')          AS pick1_tag,
  (top_k_straights_json -> 0 ->> 'drawsSince')   AS pick1_ds,
  (top_k_straights_json -> 0 ->> 'recentStateHits14d') AS pick1_hits14d,
  (horizons_present_json ->> '_recent7dMatchRatePct')  AS rate_7d,
  (horizons_present_json ->> '_recent30dMatchRatePct') AS rate_30d,
  (horizons_present_json ->> '_engineVersion')   AS engine_version,
  updated_at_et
FROM slate_snapshots
WHERE slate_date = '2026-06-10' AND deleted_at IS NULL
ORDER BY scope;
```

**Expected output shape (3 rows, one per scope):**

| scope | pick1 | pick1_tag | pick1_ds | pick1_hits14d | rate_7d | rate_30d | engine_version | updated_at |
|---|---|---|---|---|---|---|---|---|
| allday | 3-digit | `overdue` | ≥ 1 | ≥ 0 | ~100 | ~93 | zk6-v2 | recent |
| evening | 3-digit | `overdue` | ≥ 1 | ≥ 0 | **watch** | ~83 | zk6-v2 | recent |
| midday | 3-digit | `overdue` | ≥ 1 | ≥ 0 | ~86 | ~79 | zk6-v2 | recent |

**Red flags:**
- Any `pick1_tag` ≠ `'overdue'` → reorder sort didn't fire. Check edge fn version.
- Any `rate_7d` or `rate_30d` is NULL → ENG-SLATE-METRICS-06 fetch failed.
- `engine_version` doesn't match latest → cron didn't pick up the latest deploy.
- < 3 rows → one or more scopes failed to generate.
- `updated_at_et` ≠ this morning → cron didn't fire. Manually regenerate.

---

## 2. Critical pre-bet checks (MUST PASS)

### 2A. All 3 slates exist and have 6 picks each

```sql
SELECT
  scope,
  jsonb_array_length(top_k_straights_json) AS pick_count,
  CASE WHEN jsonb_array_length(top_k_straights_json) = 6 THEN 'PASS' ELSE 'FAIL' END AS status
FROM slate_snapshots
WHERE slate_date = '2026-06-10' AND deleted_at IS NULL
ORDER BY scope;
```

**Pass:** 3 rows, all `pick_count = 6`, all `status = PASS`.

### 2B. Reorder sort applied (pick #1 has highest draws_since in slate)

```sql
WITH ranked AS (
  SELECT
    scope,
    (p.value ->> 'combo') AS combo,
    (p.value ->> 'drawsSince')::int AS ds,
    (p.value ->> 'rank')::int AS rank
  FROM slate_snapshots s,
       LATERAL jsonb_array_elements(s.top_k_straights_json) p
  WHERE s.slate_date = '2026-06-10' AND s.deleted_at IS NULL
),
pick1_vs_max AS (
  SELECT
    scope,
    MAX(ds) FILTER (WHERE rank = 1) AS pick1_ds,
    MAX(ds) AS max_ds_in_slate
  FROM ranked
  GROUP BY scope
)
SELECT
  scope,
  pick1_ds,
  max_ds_in_slate,
  CASE WHEN pick1_ds = max_ds_in_slate THEN 'PASS' ELSE 'FAIL — reorder not applied' END AS status
FROM pick1_vs_max
ORDER BY scope;
```

**Pass:** All 3 rows show `pick1_ds = max_ds_in_slate` and status `PASS`.

### 2C. CONFIG-15 still live (evening CO = 0)

```sql
SELECT
  key,
  value,
  CASE WHEN value::jsonb ->> 'CO' = '0' THEN 'PASS' ELSE 'FAIL — CO not zero' END AS status
FROM app_config
WHERE key = 'engine_weights_balanced_evening';
```

**Pass:** `CO = 0` in the value JSON, status `PASS`.

### 2D. Picks are NOT identical to yesterday's (data freshness)

```sql
SELECT
  today.scope,
  jsonb_path_query_array(today.top_k_straights_json, '$[*].combo') AS picks_today,
  jsonb_path_query_array(yest.top_k_straights_json,  '$[*].combo') AS picks_yest,
  CASE
    WHEN jsonb_path_query_array(today.top_k_straights_json, '$[*].combo')
       = jsonb_path_query_array(yest.top_k_straights_json,  '$[*].combo')
    THEN 'FAIL — identical to yesterday'
    ELSE 'PASS'
  END AS status
FROM slate_snapshots today
JOIN slate_snapshots yest
  ON yest.scope = today.scope
 AND yest.slate_date = today.slate_date - INTERVAL '1 day'
 AND yest.deleted_at IS NULL
WHERE today.slate_date = '2026-06-10' AND today.deleted_at IS NULL
ORDER BY today.scope;
```

**Pass:** All 3 rows status `PASS`. Identical picks would mean data didn't refresh.

---

## 3. New-feature verification (today's ships)

### 3A. ENG-STATE-DATA-05 — per-pick metadata populated

```sql
SELECT
  scope,
  (p.value ->> 'rank')::int AS pos,
  (p.value ->> 'combo')     AS combo,
  (p.value ->> 'tag')       AS tag,
  (p.value ->> 'recentStateHits14d')::int AS hits14d,
  jsonb_array_length(p.value -> 'topJurisdictions') AS top_states_count
FROM slate_snapshots s,
     LATERAL jsonb_array_elements(s.top_k_straights_json) p
WHERE s.slate_date = '2026-06-10' AND s.deleted_at IS NULL
ORDER BY scope, pos;
```

**Pass criteria:**
- Every row has a non-null `tag` value (`overdue`/`strong`/`depth`)
- `pos=1` rows all have `tag = 'overdue'`
- `pos=2-3` rows have `tag = 'strong'`
- `pos=4-6` rows have `tag = 'depth'`
- `hits14d` is a non-negative integer (can be 0 for unusual combos)
- `top_states_count` is 0-5 (usually 3-5 for combos with hit history)

### 3B. ENG-SLATE-METRICS-06 — slate-level rates present

```sql
SELECT
  scope,
  (horizons_present_json ->> '_recent7dMatchRatePct')::numeric  AS rate_7d_pct,
  (horizons_present_json ->> '_slates7dCount')::int             AS slates_7d,
  (horizons_present_json ->> '_recent30dMatchRatePct')::numeric AS rate_30d_pct,
  (horizons_present_json ->> '_slates30dCount')::int            AS slates_30d
FROM slate_snapshots
WHERE slate_date = '2026-06-10' AND deleted_at IS NULL
ORDER BY scope;
```

**Pass:** All 3 rows have non-null rates, `slates_30d` ≥ 20 (enough data), `slates_7d` ≥ 5.

### 3C. Top jurisdictions look real (not all the same combo)

```sql
SELECT
  scope,
  (p.value ->> 'rank')::int   AS pos,
  (p.value ->> 'combo')        AS combo,
  (p.value -> 'topJurisdictions') AS top_states
FROM slate_snapshots s,
     LATERAL jsonb_array_elements(s.top_k_straights_json) p
WHERE s.slate_date = '2026-06-10' AND s.deleted_at IS NULL
  AND (p.value ->> 'rank')::int = 1
ORDER BY scope;
```

**Eye-check:** each pick's `top_states` should be an array of `{state, hits}` objects, with `state` values being recognizable US state codes (TX, FL, GA, NJ, etc.) plus some Canadian (ON, QC) and multi-state (`ME,NH,VT`, `W.Canada`).

---

## 4. Regression watch — evening specifically

### 4A. Evening 7d match rate trajectory

```sql
-- Compare today's reported 7d rate with what it should be based on the last 7 days
WITH per_slate AS (
  SELECT scope, slate_date, MAX((hit_box OR hit_straight)::int) AS had_hit
  FROM daily_intelligence
  WHERE on_slate AND mode='balanced'
    AND scope='evening'
    AND slate_date >= (CURRENT_DATE - INTERVAL '7 days')
    AND slate_date <  CURRENT_DATE
  GROUP BY scope, slate_date
),
actual AS (
  SELECT
    ROUND(100.0 * SUM(had_hit) / COUNT(*)::numeric, 1) AS actual_7d_pct,
    COUNT(*) AS n
  FROM per_slate
),
reported AS (
  SELECT
    (horizons_present_json ->> '_recent7dMatchRatePct')::numeric AS reported_7d_pct
  FROM slate_snapshots
  WHERE slate_date = '2026-06-10' AND scope='evening' AND deleted_at IS NULL
)
SELECT
  actual.actual_7d_pct,
  reported.reported_7d_pct,
  actual.n AS slates_in_window,
  CASE
    WHEN ABS(actual.actual_7d_pct - reported.reported_7d_pct) < 1.0 THEN 'PASS — agrees within 1pp'
    ELSE 'INVESTIGATE — disagreement'
  END AS status
FROM actual, reported;
```

**Pass:** `actual_7d_pct ≈ reported_7d_pct`. Disagreement would mean the metric compute is broken.

### 4B. If evening 7d < 75%, escalate

```sql
-- Decision criterion: if evening 7d match rate is < 75%, partial CONFIG-15 revert
SELECT
  scope,
  (horizons_present_json ->> '_recent7dMatchRatePct')::numeric AS rate_7d,
  CASE
    WHEN scope='evening' AND (horizons_present_json ->> '_recent7dMatchRatePct')::numeric < 75
      THEN 'ESCALATE — consider partial CONFIG-15 revert (evening CO 0 → 10)'
    WHEN scope='evening' AND (horizons_present_json ->> '_recent7dMatchRatePct')::numeric < 60
      THEN 'CRITICAL — full CONFIG-15 revert (evening CO back to 20 or 13.5)'
    ELSE 'OK'
  END AS action
FROM slate_snapshots
WHERE slate_date = '2026-06-10' AND scope='evening' AND deleted_at IS NULL;
```

Decision tree:
- ≥ 75% → no action, CONFIG-15 holding
- 60-75% → partial revert: `UPDATE app_config SET value='{"BOX":47,"PBURST":27,"CO":10,"DGC":16}' WHERE key='engine_weights_balanced_evening'`
- < 60% → full revert: `UPDATE app_config SET value='{"BOX":45,"PBURST":25,"CO":20,"DGC":10}' WHERE key='engine_weights_balanced_evening'`

---

## 5. Cron health (BUG-EDR-01 fix verification)

### 5A. Both nightly jobs fired

```sql
-- Last 24h of cron job runs (pg_cron + pg_net)
SELECT
  request_id,
  created AS started_at,
  status_code,
  CASE
    WHEN status_code BETWEEN 200 AND 299 THEN 'PASS'
    ELSE 'FAIL — investigate'
  END AS status
FROM net._http_response
WHERE created >= NOW() - INTERVAL '24 hours'
ORDER BY created DESC
LIMIT 10;
```

**Expected:** at least 2 rows with `status_code = 200` from 07:30 UTC and 08:00 UTC today.

### 5B. engine_daily_report has fresh data

```sql
SELECT
  slate_date,
  scope,
  hits_count,
  rate,
  updated_at,
  CASE
    WHEN updated_at >= NOW() - INTERVAL '12 hours' THEN 'PASS — fresh'
    ELSE 'STALE — cron may not have fired'
  END AS status
FROM engine_daily_report
WHERE slate_date = CURRENT_DATE - 1
ORDER BY scope;
```

**Pass:** 3 rows (one per scope) for yesterday, all `updated_at` within last 12 hours.

### 5C. engine_daily_report matches daily_intelligence (no BUG-EDR-01 regression)

```sql
WITH report AS (
  SELECT slate_date, scope, hits_count AS report_hits
  FROM engine_daily_report
  WHERE slate_date = CURRENT_DATE - 1
),
canonical AS (
  SELECT
    slate_date,
    scope,
    SUM((hit_box OR hit_straight)::int) AS canonical_hits
  FROM daily_intelligence
  WHERE on_slate AND mode='balanced' AND slate_date = CURRENT_DATE - 1
  GROUP BY slate_date, scope
)
SELECT
  r.scope,
  r.report_hits,
  c.canonical_hits,
  CASE
    WHEN ABS(r.report_hits - c.canonical_hits) <= 1 THEN 'PASS'
    ELSE 'FAIL — report under-counting'
  END AS status
FROM report r
JOIN canonical c USING (scope, slate_date);
```

**Pass:** Each scope's `report_hits ≈ canonical_hits` (within ±1 for rounding).

---

## 6. Full pick set inspection (for the curious operator)

```sql
SELECT
  scope,
  (p.value ->> 'rank')::int AS pos,
  (p.value ->> 'combo')     AS combo,
  (p.value ->> 'bestOrder') AS best_order,
  (p.value ->> 'tag')       AS tag,
  (p.value ->> 'drawsSince')::int AS ds,
  (p.value ->> 'recentStateHits14d')::int AS hits14d,
  (p.value -> 'topJurisdictions') AS top_states,
  (p.value ->> 'energy')::int AS energy,
  (p.value ->> 'multiplicity') AS mult
FROM slate_snapshots s,
     LATERAL jsonb_array_elements(s.top_k_straights_json) p
WHERE s.slate_date = '2026-06-10' AND s.deleted_at IS NULL
ORDER BY scope, pos;
```

Eyeball this for sanity. 18 rows total (3 scopes × 6 picks). Each row has all
the data the engine produced for that pick.

---

## 7. Red-flag queries (run if something looks off)

### 7A. Is the edge fn actually the deployed version?

```sql
-- Recent slates should be created by engine version v2 (zk6-v2)
SELECT
  scope,
  (horizons_present_json ->> '_engineVersion') AS engine_version,
  (horizons_present_json ->> '_source')        AS source,
  updated_at_et
FROM slate_snapshots
WHERE slate_date = '2026-06-10' AND deleted_at IS NULL
ORDER BY scope;
```

`_source = 'edge'` means edge fn produced it. `'live'` means RN engine. Tomorrow's
cron should use `'edge'`.

### 7B. Did SCRUB-02 hold? (no aggressive/conservative writes)

```sql
SELECT mode, COUNT(*) FROM daily_intelligence
WHERE slate_date = '2026-06-10'
GROUP BY mode;
```

**Pass:** only `balanced` rows. If you see `aggressive` or `conservative`, something
regressed.

### 7C. Are the legacy app_config keys still gone? (no SCRUB-02 regression)

```sql
SELECT COUNT(*) AS legacy_orphan_count
FROM app_config
WHERE key IN (
  'engine_weights_aggressive', 'engine_weights_conservative',
  'engine_weights_aggressive_allday', 'engine_weights_aggressive_midday', 'engine_weights_aggressive_evening',
  'engine_weights_conservative_allday', 'engine_weights_conservative_midday', 'engine_weights_conservative_evening'
);
```

**Pass:** `legacy_orphan_count = 0`. If > 0, the SCRUB-02 migration was reverted.

### 7D. Is the today-only block working? (ENG-BLOCK-NARROW-01)

```sql
-- Check if any of today's picks were also a winner yesterday in their session
SELECT
  today.scope,
  (p.value ->> 'combo')   AS pick_today,
  (p.value ->> 'comboSet') AS combo_set,
  EXISTS (
    SELECT 1 FROM histories h
    WHERE h.date_et = CURRENT_DATE - 1
      AND h.session = today.scope  -- only for midday/evening
      AND h.comboset_sorted = (p.value ->> 'comboSet')
  ) AS hit_yesterday_same_session
FROM slate_snapshots today,
     LATERAL jsonb_array_elements(today.top_k_straights_json) p
WHERE today.slate_date = '2026-06-10' AND today.deleted_at IS NULL
  AND today.scope IN ('midday','evening')
ORDER BY today.scope, (p.value ->> 'rank')::int;
```

This shows whether any of today's picks won yesterday in the same session.
After ENG-BLOCK-NARROW-01, this is **allowed** — yesterday-winners can re-pick.
We expect to see some `true` values. If all `false`, that's also fine (just means
the universe naturally produced fresh picks).

### 7E. Quick visual: today's evening picks vs all evening draws yesterday

```sql
SELECT
  '6/10 evening pick' AS source,
  (p.value ->> 'combo')    AS combo,
  (p.value ->> 'comboSet') AS combo_set
FROM slate_snapshots s,
     LATERAL jsonb_array_elements(s.top_k_straights_json) p
WHERE s.slate_date = '2026-06-10' AND s.scope='evening' AND s.deleted_at IS NULL
UNION ALL
SELECT
  '6/9 evening hit  ' AS source,
  result_digits,
  comboset_sorted
FROM histories
WHERE date_et = '2026-06-09' AND session='evening'
ORDER BY source, combo;
```

Eyeballable comparison. Useful sanity check.

---

## Decision matrix for tomorrow's morning

| Section 1 result | Action |
|---|---|
| All 3 scopes show overdue pick #1 + non-null rates | Generate confidence, place bets |
| Pick #1 tag ≠ overdue | Edge fn old version; redeploy `supabase functions deploy compute-slate-zk6` |
| Rates are NULL | State-agg fetch failed; check Supabase status, retry slate gen |
| Evening rate_7d < 75% | Run Section 4B, follow decision tree |
| Section 2 has any FAIL | Don't bet until investigated. Use Section 7 to diagnose |

If everything passes Sections 1-3, you're cleared for tomorrow.
