# Analytics / intelligence surfaces — inventory and verdict (2026-10-25)

**Operator question:** "are we utilizing pattern analytics? footprint? pattern intelligence? analysis? watch list? top 30? learning? performance? is there anything to gain from all of these systems?"

**Method:** read-only. Every surface traced from screen → table → engine (three parallel code traces, claims re-verified by hand in `app/(tabs)/intelligence.tsx`), live state pulled from Supabase (row counts, config, audit log, cron, engine_runs). No code, config or data changed. Audit entry: SYS-INV-01.

## 1. One-table answer

| # | System | Where it lives | Reads | Feeds the engine or a decision? | Live state 10/25 | Verdict |
|---|---|---|---|---|---|---|
| 1 | **Pattern analytics / Pattern Explorer** (footprint search + expected-vs-observed) | admin `AnalyticsView`; consumer Pro modal `app/pattern-explorer.tsx` (entry: Slates "More", Number Book "Full history →") | `histories` 30d / 90d / clean-era, client-side | **No.** Display only; zero importers in `engines/`, `supabase/functions/`, `lib/engineCore.ts`, `lib/brief/` | Shipped 7/25 (ENH-ANALYTICS-01) as a Lottery-Post-parity product feature | Product/retention value only. No accuracy content by design, and COHORT-02 (10/25) showed no frequency/recency threshold in the universe carries information. |
| 2 | **Footprint** (second implementation) | `lib/brief/computeBrief.ts` (admin Brief tab) + `scripts/generate-jurisdiction-report.ts` | `histories` 90d, top-10 jurisdictions only | **Operator brief tiers only** — T1 ≥10 appearances, T3 ≥6; report script "Tonight's Watch List" = picks with footprint ≥6 | Report script: no npm entry, run by hand, last PDF `assets/zk6_pick_intelligence_2026-06-25.pdf` (4 months idle). Brief tab live. | The only place footprint shapes a decision. Not tested here as a predictor; the nearest universe tests (ENG-REVIEW-02 cross-state/carryover FLAT, WARMING reverted at −, STATE_STR falsified −8.1pp) all say cross-state recent frequency is flat-to-negative. |
| 3 | **Pattern Intelligence tab** — today / analysis / slate views | `app/(tabs)/intelligence.tsx` (admin gate) | `daily_intelligence` — today view: today's 30 rows per scope; analysis view: **every DI row ever** (16,162), recency-weighted, hit = stored flags | **Yes, by hand:** 5 "Apply" suggestion buttons PATCH `app_config` directly (see F1) | Live | Two defects, F1 and F2 below. |
| 4 | **Watch list** | same screen, today view | DI rows with `on_slate=false` (ranks 1–30 pre-rail that K6 did not pick) | **No.** A display label; no stored field, no consumer. `PickCard` "◈ WATCH LIST" is an unrelated energy label (45–64). | Live | Already answered by ENG-TOP30-01 (8/2): the hitting non-picked top-30 sets are ~100% cooldown-blocked, universe P(hit | days-since) flat, relaxation refuted in replay. Nothing left in it. |
| 5 | **Top 30** | `daily_intelligence` (written by `compute-slate-zk6`, hit flags by `run-hit-detection`) | — | **Engine reads it for two things only:** (a) the post-hit exclusion block, (b) 7d/30d match-rate metadata on the snapshot. Never for scoring. Consumers: `HeatCheckModal`, `PickCard` energy-band footer. | 16,162 rows, 175 slate-days per scope 4/19→10/25 (BUG-171 gap days persist), max rank 32/32/36 | Rows are permutations, not combos (~8–12 distinct sets per day). Useful as a persisted pre-rail ranking for forensics. **Non-slate rows carry zero hit flags by construction** (4,451 of 5,531 rows, last 60d) — see F2. |
| 6a | **Learning — ENH-AFL adaptive signal weights** | `signal_auc_per_day` ← `compute-daily-auc-zk6` (Daily Workflow step 2); `computeAdaptiveWeights` in engine | `histories` + datasets (leak-free) | **Gated off.** `adaptive_signal_weights_enabled=false` since 5/27; every 10/25 `engine_runs` row shows `_adaptive: null` | 2,196 AUC rows, still computed every workflow through 10/24 | Measured 5/27: α 0.5–1.5 moved 21 of 522 slate picks (4% churn), no lift. 30d AUC today: BOX .53–.55, CO .59/.60 (mid/eve), PBURST .50–.52, DGC .53–.55 — same gentle gradients as then. Costs one edge call per workflow; feeds a read-only table in `EngineConfigView`. |
| 6b | **Learning — Weight Proposal System** | `generate-weight-proposal` edge fn → `audit_logs` → `ProposalReviewView` → `lib/applyWeightUpdate.ts` | `adaptive_tracking` 30d | Designed as the **guarded** config path: 5 gates, 7-day expiry, acknowledge-revert checkbox, audit rows, revert SQL | **Never run.** `audit_logs` has 0 `weight_proposal_*` rows; `cron.job` is empty (no-auto-crons rule); `npm run autotune:propose` never invoked | Infrastructure exists and is unused, while the unguarded path (F1) is live. |
| 6c | **Learning — Engine Calibration Dashboard** | `AdaptiveLearningView` (admin "adaptive") | `adaptive_tracking` 60d, stored flags, canonical hash = snapshot with most hits | **No.** Metrics + text CTAs ("run intel:propose / backtest:replay"); only action is a link to the Engine view | Live | Read-only. Selection-on-outcome canonicalization (same class as BUG-180) touches 3 of 183 slate-days in the last 60d (max 2 hashes) — negligible today. |
| 6d | **Learning — closed paths** | WARMING (CONFIG-13), STATE_STR (ENH-AUDIT v2), CEN-01, per-state, due thresholds (COHORT-01/02) | — | — | All at weight 0 / flag off / refuted | Already settled; listed so nobody re-opens them. |
| 7 | **Performance** | admin `HitTrackingView`; consumer `results`, `track-record`; `engine_daily_report`; `useEnergyBandHitRates` → `PickCard` footer | `adaptive_tracking` stored flags (results cross-checks against the `histories` ledger; track-record floors at 6/11) | **No.** Descriptive. | Live, workflow-stamped (471 report rows through 10/25) | Nothing to gain beyond what they already show. BUG-162 rule stands: never quote a stored-flag rate without recomputing from `histories`. |

## 2. Findings worth acting on (operator decision — nothing changed)

**F1 — Unguarded engine-config write path in the Intelligence analysis view.** `applySuggestion` (`app/(tabs)/intelligence.tsx:543-555`) PATCHes `app_config` on a single tap: no confirm dialog, no `audit_logs` row, no CONFIG-XX, no backtest, no per-scope awareness. The five buttons can write `engine_weights_balanced`, `pressure_threshold`, `min_energy_threshold`, `pair_rep_cap`, `default_scope`. Today the weights button is a practical no-op (all three scopes run per-scope overrides that shadow the global key) and the energy button is shadowed where a per-scope `min_energy_threshold_*` exists — but `pressure_threshold`, `pair_rep_cap` and `default_scope` are global and take effect on the next workflow run. This is the CONFIG-01 incident class (3 days of degraded picks, no trail). The "Weight Adjustment" card even says no change is needed when the signal gap is < 0.05 and still shows an active Apply button.

**F2 — The analysis view's statistics are computed on structurally missing data.** It pages every `daily_intelligence` row (line 455, no `on_slate` filter) and counts `hit_box || hit_straight`. Hit detection only stamps on-slate rows (CALIB-02 found this; re-verified today: last 60d on_slate=false → 4,451 rows, 0 hits; on_slate=true → 1,080 rows, 269 hits). Consequences: rank 7–30 hit rates read as ~0%, so the "diversity warning" (ranks 7–15 beating 1–6 by 5pp) can never fire; the energy-threshold suggestion (lowest energy among hit rows) is circular because on-slate picks already sit above the energy floor; draws-since and multiplicity rates are on-slate-only numbers presented as top-30 numbers. The view's numbers should not be quoted, and its suggestions are garbage-in regardless of F1.

**F3 — Dormant infrastructure.** `generate-weight-proposal` edge fn + `ProposalReviewView` + `applyWeightUpdate.ts` (never run); `scripts/generate-jurisdiction-report.ts` (last output 6/25, no npm script); the daily AUC compute (feeds a flag-off loop and a read-only table). None costs anything measurable; none produces anything. Retire, park, or keep for research — operator call.

## 3. "Is there anything to gain?"

- **As accuracy levers: no.** Every surface above is a view over the same `histories` / `datasets_*` the engine already scores. Every attempt to close a loop from these views was measured: AFL (neutral, 4% churn), WARMING (negative, reverted day 4), STATE_STR (−8.1pp), centrality (AUC 0.49–0.51), per-state allocation (34.6% vs 38.1% base), due thresholds (none exist, COHORT-02), top-30 non-picks (cooldown, refuted). This is the information ceiling (ENG-REVIEW-01: universe AUC 0.500).
- **As a safety fix: yes, one.** F1 is the only live, unaudited path that can change engine behavior. The designed guarded path (6b) already exists. Options: (a) gate the five buttons behind confirm + `audit_logs` config_change row + per-scope targeting; (b) remove them and route through `ProposalReviewView`; (c) leave as-is with this entry as the warning. Not built — no operator ask.
- **As operator-decision inputs:** the Brief tab's footprint tiers (item 2) are the one place a "pattern" number steers a bet. Untested as a predictor in this scope; the adjacent universe evidence is flat-to-negative. If the operator wants it graded, that is a cohort test on the 220-set universe (feature = 90d top-10-jurisdiction count), not a backtest.

## 4. Re-runnable checks

```sql
-- non-slate DI rows never carry hit flags (F2)
select on_slate, count(*) rows_, sum(case when hit_box or hit_straight then 1 else 0 end) hits
from daily_intelligence where mode='balanced' and slate_date between current_date-60 and current_date-1 group by 1;

-- adaptive loop is off on every run
select scope, effective_weights->'_adaptive' from engine_runs where slate_date=current_date and mode='balanced';

-- weight-proposal system has never fired; no cron scheduled
select action, count(*) from audit_logs where action like 'weight_proposal%' group by 1;
select jobname, schedule, active from cron.job;

-- rolling 30d per-signal AUC (what ENH-AFL would consume)
select scope, signal, round(avg(auc),3) auc30, count(*) days from signal_auc_per_day
where day >= current_date-30 group by 1,2 order by 1,2;
```
