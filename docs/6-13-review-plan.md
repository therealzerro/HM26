# 6/13 Engine Review — Execution Plan

**Locked 2026-06-06. Review date: 2026-06-13.**

This plan is **binding** — thresholds, queries, and actions are pre-decided to prevent goalpost-moving when the data is in.

If you read this on 6/13 and feel the urge to adjust a threshold "because n=7 is small," **don't**. Risk 5 below is why.

---

## Mission

Determine whether CONFIG-13 (evening WARMING) and CONFIG-14 (allday CO=0) shipped 2026-06-06 are producing live-data lift. Three outcomes per change: **RATIFY** (keep), **REVERT** (rollback), or **QUEUE FOLLOW-UP** (one specific post-review test).

Secondary objective: confirm whether the 4+1-channel framework has reached its empirical saturation ceiling. **Reaching the ceiling pre-launch is a desired outcome**, not a failure mode.

---

## Live 30d pre-deploy baselines (LOCKED)

Pulled 2026-06-06 from `daily_intelligence` for 5/7 → 6/5:

| Scope | Slate hit % | r1 hit % | Avg picks hit/slate |
|---|---|---|---|
| Allday  | **89.3%** | ~39% | 2.61 |
| Evening | **89.3%** | ~25% | 2.18 |
| Midday  | **82.1%** | ~18% | 1.64 |

These are the **only** baselines used for ratification. Backtest baselines (93.1 / 82.8 / 79.3) are NOT used — different metric, different distribution.

---

## Pre-review window (6/7 → 6/12)

### Daily operator checklist

Each day:
1. Click Daily Workflow in admin (rebuilds datasets + computes daily report)
2. Verify allday + evening + midday slates regenerated (check `slate_snapshots.updated_at_et` for today's date)
3. Confirm hit detection ran (check `run-hit-detection` edge fn log)

**Missing a day** means ds_raw is stale and daily_intelligence may be empty for that scope-date. Results will be noisier.

### 6/10 mid-window check (optional, advisory only)

After 3 full days of post-ship data (6/7, 6/8, 6/9 evening hit detection complete), pull this query:

```sql
SELECT scope,
  COUNT(DISTINCT slate_date) AS n_days,
  ROUND(100.0 * SUM(CASE WHEN any_hit THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS slate_pct
FROM (
  SELECT slate_date, scope, BOOL_OR(hit_box) AS any_hit
  FROM daily_intelligence
  WHERE slate_date BETWEEN '2026-06-07' AND '2026-06-09'
    AND on_slate = true AND mode = 'balanced'
  GROUP BY slate_date, scope
) per_slate
GROUP BY scope ORDER BY scope;
```

**This is a CHECK, not a DECISION.** n=3 is too small for action. Purpose: catch catastrophic failure early so we have notice before the formal review. Decision rules:

- All scopes ≥ 60%: silent — keep going
- Any scope ≤ 40%: investigate immediately, but DON'T revert based on 3 days
- Any scope ≤ 20%: emergency check — is hit detection broken? Is the engine producing nonsense?

### What NOT to do during 6/7 → 6/12

- **No new app_config changes** (any scope, any key)
- **No edge fn deploys**
- **No new backtest candidates queued for ship**
- **No "let me re-tune evening real quick"**
- Backtest exploration is fine — just don't ship anything

The whole point of the review window is clean attribution. Adding noise during the window defeats the purpose.

---

## Review day (6/13)

### Step 1 — Confirm data quality

Before pulling review metrics, confirm Daily Workflow ran all 7 days:

```sql
SELECT slate_date, scope, COUNT(*) AS top30_rows, MAX(created_at) AS latest_created
FROM daily_intelligence
WHERE slate_date BETWEEN '2026-06-07' AND '2026-06-13'
  AND mode = 'balanced'
GROUP BY slate_date, scope
ORDER BY slate_date, scope;
```

**Expected:** ~30 rows per (scope, date) combination, 21 rows total (3 scopes × 7 days). If any (scope, date) is missing or has <20 rows, that day is data-incomplete. **Note which days are missing — do NOT extrapolate.**

### Step 2 — Pull the review metrics

```sql
-- 7-day live slate hit rate + r1 hit rate per scope, post-CONFIG-13/14
WITH per_slate AS (
  SELECT slate_date, scope,
    BOOL_OR(hit_box) AS any_hit,
    BOOL_OR(hit_box AND rank = 1) AS r1_hit,
    COUNT(*) FILTER (WHERE hit_box) AS n_hits
  FROM daily_intelligence
  WHERE slate_date BETWEEN '2026-06-07' AND '2026-06-13'
    AND on_slate = true AND mode = 'balanced'
  GROUP BY slate_date, scope
)
SELECT scope,
  COUNT(*) AS n_slates,
  ROUND(100.0 * SUM(CASE WHEN any_hit THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS slate_pct,
  ROUND(100.0 * SUM(CASE WHEN r1_hit THEN 1 ELSE 0 END) / NULLIF(COUNT(*),0), 1) AS r1_pct,
  ROUND(AVG(n_hits)::numeric, 2) AS avg_hits_per_slate
FROM per_slate
GROUP BY scope ORDER BY scope;
```

Record the three numbers per scope: `slate_pct`, `r1_pct`, `avg_hits_per_slate`.

### Step 3 — Apply decision rules (LOCKED)

#### CONFIG-14 (allday CO=0) — solo

| If | Action |
|---|---|
| allday slate ≥ 85% **AND** r1 ≥ 35% | **RATIFY** |
| allday slate ≤ 75% **OR** r1 ≤ 25% | **REVERT** (see Step 4a) |
| Else | **QUEUE FOLLOW-UP** (no action; document) |

#### CONFIG-13 + CONFIG-11a (evening, joint) — stepped review

| If | Action |
|---|---|
| evening slate ≥ 85% **AND** r1 ≥ 25% | **RATIFY** both |
| evening slate ≤ 75% | **REVERT CONFIG-13 first** (see Step 4b). Observe 6/14-6/20. If still ≤ 75% on 6/20, revert CONFIG-11a too. |
| evening slate between 75-85% | **QUEUE FOLLOW-UP** |
| r1 ≤ 15% (but slate OK) | **REVERT CONFIG-13** (slate-rate gain isn't worth the r1 cost) |

#### CONFIG-12 (pressure_threshold, dormant)

| If | Action |
|---|---|
| All three scopes within ±5pp of (89.3 / 89.3 / 82.1) | **CONFIRM DORMANT** — leave in place |
| Any scope > 5pp from baseline | **INVESTIGATE before any action** — could be data quality, cross-scope coupling, or unexpected CONFIG-12 activation |

### Step 4 — Action commands (ready to paste)

#### 4a. Revert CONFIG-14 (allday CO=0 → restore 8.5%)

```sql
UPDATE app_config
SET value = '{"BOX":49.5,"PBURST":27,"CO":8.5,"DGC":15}', updated_at = NOW()
WHERE key = 'engine_weights_balanced_allday';

-- Then trigger allday regen so subscribers see the reverted picks:
-- Via curl (use EXPO_PUBLIC_SUPABASE_URL + EXPO_PUBLIC_SUPABASE_ANON_KEY from .env):
-- curl -X POST $SUPA/functions/v1/compute-slate-zk6 -H "..." -d '{"scope":"allday","weightsKey":"balanced"}'
```

#### 4b. Revert CONFIG-13 (evening WARMING off, CONFIG-11a stays)

```sql
DELETE FROM app_config WHERE key IN ('warming_weight_evening', 'warming_window_days');

-- Then trigger evening regen
```

#### 4c. Revert CONFIG-11a (only if step 4b doesn't fix evening after another 7 days)

```sql
UPDATE app_config
SET value = '{"BOX":49.5,"PBURST":27,"CO":13.5,"DGC":10}', updated_at = NOW()
WHERE key = 'engine_weights_balanced_evening';

-- Then trigger evening regen
```

### Step 5 — Audit + memory updates

For EVERY outcome (ratify, revert, queue, dormant-confirm), update MASTER_AUDIT.md with a `**Review 2026-06-13 outcome:**` paragraph appended to each config entry. Template:

```markdown
**Review 2026-06-13 outcome:** 7-day live slate hit rate <X%> vs pre-deploy
baseline 89.3% (Δ <+/-X.X>pp); r1 hit rate <X%> vs ~<baseline>%
(Δ <+/-X.X>pp). Decision: <RATIFIED | REVERTED | QUEUED FOLLOW-UP>.
<one sentence on what this confirms or falsifies>.
```

Also update memory files `project_config13_review_window.md` and `project_config14_review_window.md` with the outcome.

### Step 6 — Saturation check

After review decisions are made and audit updated, evaluate the saturation criteria:

**Declare saturation ONLY when ALL THREE hold:**

1. **0 ratifications** across CONFIG-13/14 (i.e., everything reverts or sits in queue-followup)
2. **Post-6/13 backtest sweep** (run one quick sweep that day) produces **0 candidates with ≥2pp lift** outside noise
3. **30-day overall slate rate trajectory** (5/7 → 7/7 window when we get to 7/7) shows **<1pp** change

If all three: declare saturation. Lock current configs. Move engine work to ENH-AUDIT-2026-05-19 per-state strength.

If only 1-2 conditions: do not declare; continue with the queued follow-up.

---

## Post-review (6/14 onwards)

### Branch A: Both ratify (best case)

- Both CONFIG-13 and CONFIG-14 keep
- Update audit + memory with outcomes
- Queue exactly ONE backtest: `evening_dgc_threshold` (DGC ≥0.85 boost on evening — finding from evening sweep 2026-06-06)
- DO NOT ship the queued candidate before 6/20 (let post-ratification baseline stabilize)
- Pre-state strength (ENH-AUDIT-2026-05-19) becomes next-up after the queued candidate clears

### Branch B: CONFIG-14 ratifies, CONFIG-13 reverts

- Revert CONFIG-13 (Step 4b), keep CONFIG-14
- Investigate why WARMING failed live (backtest predicted +6.9pp evening)
- Hypothesis to check: did Phase 1 LEARN-01 fixes affect the historical WARMING data in unexpected ways?
- No new candidates queued until root cause understood

### Branch C: CONFIG-13 ratifies, CONFIG-14 reverts

- Revert CONFIG-14 (Step 4a), keep CONFIG-13
- Investigate why allday CO=0 failed live (backtest predicted +3.5pp slate, r1 fix)
- Hypothesis to check: cross-scope coupling from evening WARMING change disrupted allday baseline
- No new candidates queued until root cause understood

### Branch D: Both revert

- Revert both (Steps 4a + 4b)
- This is the **saturation declaration candidate path**
- Run the post-6/13 sweep + 30d trajectory check
- If saturation criteria met: declare and move to per-state strength
- If not: investigate the discrepancy between backtest and live data — fundamental signal problem

### Branch E: Mixed queue (no clear ratify or revert)

- Keep both configs in place (no action)
- Extend observation window to 6/20 (14-day rolling)
- Apply same thresholds on 6/20 data
- If still mixed: declare ambiguous, treat as Branch D pending another cycle

### Branch F: CONFIG-12 activates unexpectedly

- Some scope moves >5pp from baseline
- Pause action on CONFIG-13/14 decisions
- Investigate: data quality, hit detection failure, or actual CONFIG-12 effect
- Don't make engine config changes until the anomaly is resolved

---

## Risks acknowledged and mitigated

### Risk 1 — n=7 variance

- A single 0/6 day drops the rate by ~14pp
- The 75% / 85% thresholds account for this — they're 14pp away from the 89% baseline (mostly)
- **DO NOT** narrow thresholds based on "small sample size" — that's drift
- DO note in the audit when variance was an obvious factor (e.g., "5/7 days hit but 2/7 were 0/6, dropping aggregate to 71%; revert anyway per locked criteria")

### Risk 2 — cross-scope coupling

- CONFIG-13 changes evening picks → changes excludeYesterday set → can shift allday picks next day
- When reading allday result, note any unusual baseline shift
- If allday lands in queue zone (75-85%), consider whether evening's WARMING activity is bleeding into allday's exclude set
- This is a known limitation; not a reason to reject the locked thresholds

### Risk 3 — backtest vs live baseline confusion

- This document uses LIVE baselines (89.3/89.3/82.1) only
- Backtest baselines are different metrics — DO NOT cite them in the review
- If a reader asks "but the backtest predicted X" — that's prediction, not target

### Risk 4 — operator missed a day

- Step 1 catches this — if `n_slates < 7` for any scope, note which days are missing
- Decision rules use percentages over available days, not raw counts
- A 5/5 result on 5 available days is still a valid 100% — note the missing days but don't re-baseline

### Risk 5 — goalpost moving

- The most insidious failure mode
- Mitigation: this document is binding. Read it in full before pulling data.
- If thresholds feel wrong on 6/13: that's the criteria doing their job. Reverting on legitimate ambiguous data is what saturation looks like.

### Risk 6 — saturation feels like giving up

- It isn't. The user explicitly stated reaching the ceiling is the goal.
- A locked engine config at "empirical max within current framework" is a STRONG launch position
- ENH-AUDIT-2026-05-19 (per-state strength) is the queued next-major-lift; the engine isn't dead-ended

---

## What success looks like by end-of-day 6/13

- All three configs have a `**Review 2026-06-13 outcome:**` paragraph in MASTER_AUDIT
- Memory files `project_config13_review_window.md` and `project_config14_review_window.md` updated
- Production config in known state (either still in CONFIG-13/14 or reverted, no half-states)
- One follow-up backtest candidate queued (or zero if all reverted)
- Saturation criteria evaluated — declared or not, with documented reasoning
- Branch from the post-review list selected and noted

The session shouldn't take more than 30 minutes of focused work. Most of the time is data-pull + threshold-apply + audit-write. The decisions are pre-made.

---

## Related references

- `MEMORY.md` index entries for `project_config13_review_window`, `project_config14_review_window`, `project_6_13_ratification_framework`, `project_evening_sweep_2026_06_06`, `project_midday_investigation_2026_06_06`
- `MASTER_AUDIT.md` entries CONFIG-13, CONFIG-14, ENH-WARMING-2026-06-06, anti-CO finding
- `feedback_engine_config_ship_pattern` — the parent ship-discipline rule
- `feedback_backtest_harness_noise` — the ±1.7pp variance reminder

**This document is the single source of execution truth for 6/13. If memory/audit and this document conflict, this document wins.**
