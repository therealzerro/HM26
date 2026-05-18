# Self-Tuning Infrastructure Audit

**Date:** 2026-05-18
**Author:** Claude Code (read-only investigation)
**Scope:** Forensic audit of tracking → feedback wiring; no code/config/DB changes
**Time spent:** ~80 min

> **Post-audit note (2026-05-18 follow-up Order 1):** `applyDataDrivenWeights()` was renamed to `applyHardcodedWeightOverride()` and gated behind a runtime guard. References below reflect the name as of audit time; the current function is `applyHardcodedWeightOverride` in `lib/applyWeightUpdate.ts`.

---

## 1. Executive Summary

- **Hypothesis is partially correct.** The codebase records rich signals (~221 K6-pick outcome rows in `adaptive_tracking`, 2,536 watch-list rows in `daily_intelligence`), but the self-tuning *parameter* loop is human-in-the-loop. Three automated feedback paths DO exist; they're narrow (same-day hit exclusion, dataset rebuild, supplemental slates).
- **There is a complete data-driven weight-update pipeline that is wired but never invoked.** `lib/applyWeightUpdate.ts::applyDataDrivenWeights()` would PATCH `app_config` with intel-fitted weights AND trigger a regen — it has **zero callers** in the entire codebase. Confirmed orphan.
- **Three telemetry tables (`engine_runs` 13 rows, `engine_daily_report` 3 rows stuck on 5/13, `hit_detection_runs` 29 rows)** are write-only — nothing reads them. They function as logs for incident response, not as feedback inputs.
- **Four schema-debt tables (`saved_slates`, `slate_credits`, `user_sessions`, `push_tokens`, `pair_events`)** have zero rows — feature stubs not yet populated.
- **The highest-leverage feedback to activate** is the existing `applyDataDrivenWeights()` orphan, wired behind a backtest+significance gate. Estimated 3-5 hours to ship with safeguards. The biggest risk is small-sample chasing — adaptive_tracking only has 221 rows over 30 days for balanced mode (and zero for conservative/aggressive).

---

## 2. Inventory: self-tuning infrastructure (Task 1)

### 2.1 Tables that record engine-related signals

| Table | Rows | Time span | Schema purpose | Writer(s) |
|---|---:|---|---|---|
| **slate_snapshots** | 791 | 4/18–5/18 | Persisted slate outputs (top_k_straights_json, hash, scope, mode, jurisdiction, weights, components) | `engines/zk6.ts:1168`, `compute-slate-zk6/index.ts` (saveSlateSnapshot) |
| **adaptive_tracking** | 221 | 4/18–5/18 | One row per K6 pick at slate-gen, outcome columns NULL until hit detection PATCHes | `engines/zk6.ts:1472`, `compute-slate-zk6:873`, `run-hit-detection:194` |
| **daily_intelligence** | 2,536 | 4/19–5/18 | Top-30 watch list per (date, scope, mode); hit_box/hit_straight set by hit detection | `engines/zk6.ts:1397`, `compute-slate-zk6:830`, `run-hit-detection:118` |
| **histories** | 3,002 | 2026-01-01–5/18 | Raw draw results — ground truth for hit detection | `useDataIngestion.tsx` (ledger imports), `ImportWizardView.tsx` |
| **datasets_box** | 30,000 | n/a | Precomputed BOX signal table per (class_id, scope, horizon) | `rebuild-datasets-zk6` edge function |
| **datasets_pair** | 4,110 | n/a | Precomputed pair signal table | `rebuild-datasets-zk6` |
| **horizon_blends** | 30 | n/a | Per-scope × per-class available horizons + blend weights | `rebuild-datasets-zk6` |
| **percentile_maps** | 60 | n/a | Per (class_id, scope, horizon) percentile rank tables | `rebuild-datasets-zk6` |

### 2.2 Tables that record telemetry/audit signals

| Table | Rows | Time span | Schema purpose | Writer(s) |
|---|---:|---|---|---|
| **engine_runs** | 13 | up to 5/18 | One row per compute-slate-zk6 invocation: hash, scope, mode, slate_date, effective_weights, generated_at, source | `compute-slate-zk6/index.ts:709` |
| **engine_daily_report** | 3 | only 5/13 | Aggregated rate/picks_count/hits_count per (slate_date, scope) | `compute-daily-report/index.ts:133` |
| **hit_detection_runs** | 29 | up to 5/18 | ENH-12 telemetry: hits_found, scopes_checked, duration_ms, errors per (date, scope) | `run-hit-detection/index.ts:466` |
| **audit_logs** | 1,124 | up to 5/18 | Generic actor/action/target/payload_meta audit trail | various write paths |
| **imports** | 410 | up to 5/18 | One row per ledger/daily_input/box_history/pair_history import | `useDataIngestion.tsx`, `ImportWizardView.tsx` |

### 2.3 Tables empty / feature stubs

| Table | Rows | Notes |
|---|---:|---|
| **saved_slates** | 0 | Schema for user-saved slates; feature not built |
| **slate_credits** | 0 | Schema for tiered regen credits (free/plus/pro); not in use |
| **user_sessions** | 0 | Schema for session_token + credits_used + tier; not in use |
| **push_tokens** | 0 | Schema for push notifications; never wired |
| **pair_events** | 0 | Schema for per-event pair tracking; never written |

### 2.4 Programmatic tuning surfaces (code, not tables)

| File | Purpose | Status |
|---|---|---|
| `scripts/intel-tuning/fit.ts` | AUC-based weight fitter; loads `daily_intelligence` rows, computes per-signal AUC, proposes weights | **READ-ONLY** by explicit design (line 6) |
| `scripts/intel-tuning/cli.ts` | `npm run intel:propose` CLI — prints proposed weights | Human-invoked only |
| `lib/applyWeightUpdate.ts` | `applyDataDrivenWeights()` — PATCHes `app_config` with hardcoded weights + triggers slate regen | **ORPHAN — zero callers** |
| `lib/backfillIntelHits.ts` | Backfills hit annotations on `daily_intelligence` | Operator-invoked |
| `scripts/intel-tuning/backfill-adaptive-tracking.ts` | One-time backfill of AT rows | Operator-invoked |
| `scripts/backtest/{cli,replay,score,configs}.ts` | Counterfactual harness | Operator-invoked |
| `components/admin/AdaptiveLearningView.tsx` | UI shows AUC per signal, flags anti-predictive signals, recommends "run intel:propose" | Human-facing |
| `components/admin/EngineConfigView.tsx` | Manual config editor | Human-facing |

### 2.5 Edge functions that read/write the above

| Function | Reads | Writes | Trigger |
|---|---|---|---|
| `compute-slate-zk6` (v5+) | `app_config`, `datasets_box`, `datasets_pair`, `histories`, `daily_intelligence` (yesterday hits), `adaptive_tracking` (today hits) | `slate_snapshots`, `daily_intelligence` (top-30), `adaptive_tracking` (K6 primaries), `engine_runs` | User-triggered regen, run-hit-detection auto-supplement |
| `run-hit-detection` (v5) | `slate_snapshots`, `histories`, `adaptive_tracking` | `slate_snapshots.top_k_straights_json` (pick annotations), `adaptive_tracking` (PATCH primaries + INSERT secondaries), `daily_intelligence` (PATCH hits), `hit_detection_runs` | Pull-to-refresh, ledger import auto-fire (Home + useDataIngestion path), manual curl |
| `rebuild-datasets-zk6` | `histories`, `datasets_box` (existing for compare) | `datasets_box`, `datasets_pair`, `horizon_blends`, `percentile_maps` | Operator-invoked |
| `compute-daily-report` | `daily_intelligence` | `engine_daily_report` | Operator-invoked, **not scheduled** |
| `send-push` | `push_tokens` (empty) | nothing | Never invoked |

---

## 3. Feedback loop classification (Task 2)

| System | Recorded signal | Read by engine? | Classification |
|---|---|---|---|
| **app_config → engine parameters** | All tunable knobs | YES — `loadEngineConfig(scope)` reads every slate gen | **ACTIVE FEEDBACK** (manual writes) |
| **yesterday-hits exclusion** | `daily_intelligence` where `hit_box OR hit_straight = true AND slate_date >= yesterday` | YES — `engines/zk6.ts:791`, `compute-slate-zk6:481` exclude these comboSets as hard block | **ACTIVE FEEDBACK** (automated, every gen) |
| **today-hits exclusion (mid-day regen)** | `adaptive_tracking` where today + this scope + hit fields true | YES — `zk6.ts:1289`, `compute-slate-zk6:765` exclude these from new picks during regen | **ACTIVE FEEDBACK** (automated) |
| **datasets_box / datasets_pair** | Precomputed signal scores from histories | YES — read every gen | **ACTIVE FEEDBACK** (manually triggered rebuilds, operator-run) |
| **horizon_blends, percentile_maps** | Per-(class, scope, horizon) blend metadata | YES — implicitly via dataset reads | ACTIVE FEEDBACK |
| **Auto-supplemental slates** | hit-detection finds new hit → calls `compute-slate-zk6` with `is_supplement=true, excludeComboSets=[hits]` | YES — closes loop within same day | **ACTIVE FEEDBACK** (automated) |
| **AdaptiveLearning AUC → operator action** | adaptive_tracking signals + outcomes per pick | NO — AUC is *displayed*, operator manually runs intel:propose, manually edits configs | **MANUAL FEEDBACK** |
| **intel:propose → app_config** | AUC-fitted weights | The script is read-only by design. `applyDataDrivenWeights()` exists but no caller | **DORMANT** (capability built, never invoked) |
| **engine_runs telemetry** | hash, scope, mode, weights at gen time | NO reader anywhere in codebase | **DORMANT** |
| **engine_daily_report** | aggregated daily slate metrics | NO reader; writer (`compute-daily-report`) not scheduled — stuck on 5/13 | **DORMANT + STALE** |
| **hit_detection_runs telemetry** | hit count + duration per detection run | Only `rls-smoke.ts` references; purely a regression canary | **DORMANT** |
| **adaptive_tracking outcomes for conservative/aggressive modes** | None — `mode='balanced'` is the only row in AT (221/221) | n/a | **DORMANT** (engine writes only balanced; other modes unrecorded) |
| **saved_slates / slate_credits / user_sessions / push_tokens / pair_events** | nothing — 0 rows | n/a | **DORMANT-EMPTY** (feature stubs) |

### Key file:line references confirming the classifications

- `engines/zk6.ts:791` + `supabase/functions/compute-slate-zk6/index.ts:481` — yesterday-hits exclusion query
- `engines/zk6.ts:1289` + `compute-slate-zk6:765` — today-hits exclusion (mid-day regen)
- `lib/applyWeightUpdate.ts:32` — orphan `applyDataDrivenWeights()` function
- `scripts/intel-tuning/cli.ts:6` — "Never writes to app_config" explicit design choice
- `components/admin/AdaptiveLearningView.tsx:316,691` — UI suggests `npm run intel:propose` to operator
- `supabase/functions/run-hit-detection/index.ts:466` — hit_detection_runs telemetry write
- `supabase/functions/compute-slate-zk6/index.ts:709` — engine_runs telemetry write
- `supabase/functions/compute-daily-report/index.ts:133` — engine_daily_report writer

---

## 4. Dormant data quantification (Task 3)

| Source | Rows recorded | Span | Shape suitability for feedback |
|---|---:|---|---|
| **adaptive_tracking (balanced mode only)** | 221 | 30 days | ✓ Excellent — signal + outcome pairs, per-rank, with quartile flags. The AUC-fitter input shape. |
| **adaptive_tracking (conservative/aggressive)** | 0 | n/a | Zero — engine only generates balanced; other presets never persisted as picks |
| **daily_intelligence (with hit annotations)** | 2,536 | 30 days | ✓ Good — broader universe (top-30 per slate) gives more samples; AUC at the top-30 level differs from K6-only signal-quality |
| **slate_snapshots (with `top_k_straights_json` annotations)** | 791 | 30 days | ✓ Good — has annotated hitType per pick across regens; usable for ranking analysis (per investigation Appendix D source) |
| **engine_runs** | 13 | unknown span (very sparse) | ✗ Volume too low — only 13 runs total recorded; almost certainly missing many invocations |
| **engine_daily_report** | 3 | only 2026-05-13 | ✗ Stale/broken — writer not scheduled, last write 5 days ago |
| **hit_detection_runs** | 29 | up to 5/18 | ✓ Could inform "hit detection health" alerts but not engine decisions |
| **audit_logs** | 1,124 | up to 5/18 | Operational only — actor_id/action/target — not signal data |
| **imports** | 410 | up to 5/18 | Operational — import ledger, no engine relevance |

**Total dormant signal-data with feedback potential:**
- ~221 AT rows × 6 picks/slate ≈ enough for per-signal AUC at balanced mode only
- ~2,536 DI rows × top-30 ≈ ~75,000 evaluated combos for the broader-universe AUC (intel:propose already uses this)
- Sample size IS reasonable for one mode; insufficient for the three-preset matrix the AUC fitter assumes

---

## 5. Top leverage opportunities (Task 4)

Ranked by leverage = (data exists) × (clear decision point) × (bounded effort).

### 5.1 Activate the orphan `applyDataDrivenWeights()` behind safeguards

- **Signal recorded:** `daily_intelligence` per-pick AUC (already what intel:propose fits)
- **Engine decision it could inform:** the `engine_weights_{balanced,conservative,aggressive}` presets in app_config — same surface CONFIG-07 / CONFIG-02 already use, just automated
- **Implementation complexity:** 3-5 hours
  - Wire `applyDataDrivenWeights()` to a scheduled trigger (Supabase cron or `/schedule` routine)
  - Add safeguards: min sample threshold (e.g., refuse to write if N < 500), monotonicity check (refuse to write if proposed AUC < current AUC), backtest gate via the existing harness
  - Add audit row before/after so any auto-applied weight change shows in `audit_logs`
- **Expected impact:** Modest — the per-scope manual interventions (CONFIG-02/07) already capture most of the gain. Could catch slow signal-quality drift that operators wouldn't notice between manual reviews.
- **Risk:** HIGH if shipped naively — the 2026-05-09 Gemini CLI incident (CONFIG-01) destroyed engine config via an untested write. The same surface is what `applyDataDrivenWeights()` would PATCH. **Backtest+significance gate is mandatory.**

### 5.2 Schedule `compute-daily-report` properly

- **Signal recorded:** `engine_daily_report` (currently 3 rows stuck on 5/13)
- **Engine decision it could inform:** Nothing directly — but it would enable trend dashboards (rate over time, slate-rate-by-week) that operators could watch for drift
- **Implementation complexity:** 1-2 hours — set up a cron or scheduled routine to invoke the edge function nightly at e.g. 4 AM ET; verify rows accumulate
- **Expected impact:** Modest — operational visibility. Doesn't change engine decisions but reduces "is this regression real?" investigation time
- **Risk:** Very low — pure read-then-aggregate-then-write, no engine state change

### 5.3 Per-rank AUC trend in AdaptiveLearningView

- **Signal recorded:** `adaptive_tracking.rank` + signal columns + outcomes
- **Engine decision it could inform:** Operator decisions about which scope to tune next (per investigation §7); could feed a "rank-1 monotonicity alarm" similar to the harness's per-rank flag
- **Implementation complexity:** 2-3 hours — extend the existing AUC view to break down by rank position, surface "is rank-1 < rank-2?" warnings on live data
- **Expected impact:** Modest — improves operator situational awareness. Same data the harness's per-rank section now surfaces, but for production rather than backtest
- **Risk:** Low — read-only dashboard work

### 5.4 Populate adaptive_tracking for conservative + aggressive modes

- **Signal recorded:** Currently `mode='balanced'` only (221/221 rows)
- **Engine decision it could inform:** intel:propose could fit weights per mode rather than assuming balanced data generalizes
- **Implementation complexity:** 3-4 hours — periodically generate shadow slates for conservative + aggressive modes (don't show to users; just record AT rows); 30 days of shadow data unlocks per-mode AUC
- **Expected impact:** Unknown — depends on whether conservative/aggressive presets matter for any production decision. They're configurable but I haven't seen evidence subscribers actually toggle modes
- **Risk:** Low — shadow generation doesn't affect user-facing slates

### 5.5 Auto-alert on hit_detection_runs anomalies

- **Signal recorded:** `hit_detection_runs.error_count, duration_ms, hits_found`
- **Engine decision it could inform:** None — pure incident response
- **Implementation complexity:** 2 hours
- **Expected impact:** Operational; would have caught BUG-145 within a day vs the multi-day blind spot
- **Risk:** None

---

## 6. False-positive feedback risks (Task 5)

### 6.1 Same-day hit exclusion (ACTIVE FEEDBACK) — LOW RISK

The two automated exclusion paths only block combos that ACTUALLY hit. Sample size is fine (need n=1 hit to justify excluding from re-pick). The risk vector is **stale annotations** — if a hit was falsely recorded (BUG-149/151 mass-cleanup history), today's regen would over-exclude. The 2026-05-18 cleanup of 7 stale DI annotations + 4 orphan AT sessions resolved that risk window; the integrity-check query in the cleanup commits can be re-run as a routine sanity check.

### 6.2 Yesterday-hit exclusion — LOW RISK same vector

Same shape as 6.1. Same vulnerability (stale annotations); same mitigation.

### 6.3 Auto-supplemental slates — MEDIUM RISK conceptually, LOW empirically

After a hit, `run-hit-detection` triggers `compute-slate-zk6` with `is_supplement=true` to fill the slate's empty slot. This is a feedback loop that could in principle generate over-correlated supplements (e.g., if the same comboSet has multiple hits, the supplement excludes more aggressively than needed). In practice the exclusion list is bounded to the actual hit comboSets so the over-exclusion ceiling is low.

### 6.4 Hypothetical: `applyDataDrivenWeights()` if activated naively — HIGH RISK

If `applyDataDrivenWeights()` were wired to a daily cron without safeguards, it would:
- Compute AUC from the last N days (intel:propose default 4/13–5/8 window per `cli.ts:32-34`)
- Hardcoded NEW_WEIGHTS = `{balanced: {BOX:0.55,PBURST:0.30,CO:0.15}, conservative: {BOX:0.75,PBURST:0.15,CO:0.10}, aggressive: {BOX:0.45,PBURST:0.35,CO:0.20}}` — **note these are LITERAL HARDCODED VALUES, not fit-from-data**. This means the function as-written would write the same fixed weights every time, not adaptive weights. The naming is misleading.
- PATCH app_config and immediately regen

**The actual bug pattern:** the file name and intent suggest "data-driven" but the implementation just sets fixed weights. If activated, it would override per-scope CONFIG-07 / CONFIG-02 with global flat values. **This is a CONFIG-01-style risk** (the Gemini CLI incident).

### 6.5 Self-fulfilling prophecy: BOX over-weighting

The K6 selector ranks by `finalScore = Σ(weight × normSignal) + multiplicityPrior`. If a weight increases for BOX based on observed BOX hits, future slates pick more BOX-dominant combos, which (when they hit) further reinforce BOX weight. This is the bias that makes naïve "tune to recent winners" loops dangerous. The intel:propose AUC-based weighting partially mitigates by using *per-signal predictive power vs random*, not just "hit-rate by signal" — but the cycle is still imperfect.

The current human-in-the-loop with backtest gate (CONFIG-02, CONFIG-07) effectively breaks this cycle. Removing the human without replacing the gate would introduce it.

---

## 7. Final assessment + recommendation (Task 6)

### A. Is the hypothesis correct?

**Partially.** Rich signals ARE recorded (adaptive_tracking + daily_intelligence + slate_snapshots = ~3,500 evaluated picks over 30 days). Some of those signals DO feed back automatically (same-day hit exclusion, dataset rebuilds, auto-supplements). What's missing is the **automated parameter tuning loop** — and it's not for lack of code; `applyDataDrivenWeights()` exists, is wired, and has zero callers.

The more accurate framing: **the engine has 3 active automated feedback paths and 1 dormant one. The dormant path is the parameter-tuning loop, and it's the highest-leverage missing piece.** But it's missing for a defensible reason (CONFIG-01 / Gemini CLI incident memory).

### B. Highest-leverage opportunity to connect signal to decision

**Activate `applyDataDrivenWeights()` behind a backtest + significance gate** — but only after fixing its current implementation (the function as-written uses hardcoded values, not the AUC-fitted output from `intel-tuning/fit.ts`).

**The minimum viable wiring would be:**

1. Rewrite `applyDataDrivenWeights()` to import `fitWeights()` from `scripts/intel-tuning/fit.ts` and compute proposed weights from the actual last-30-day adaptive_tracking AUC (currently it just sets a hardcoded constant)
2. Add a significance gate: refuse to PATCH if `N < 500` evaluated picks OR if proposed AUC delta is within Wilson 95% CI overlap of current
3. Add a backtest gate: run a 30-day replay against the proposed weights via the existing `npm run backtest:replay` harness; refuse if slate hit rate regresses
4. Add audit_log rows before/after with the AUC delta + backtest delta + the actual weight diff
5. Wire as a scheduled review (weekly cadence, not daily)
6. Log to a NEW telemetry table (or extend `engine_runs`) so operators can see exactly what got tuned and when

**Estimated effort: 5-8 hours** for a safe implementation; 3 hours for the bare minimum.

### C. Risk of doing this wrong

The CONFIG-01 incident (2026-05-09 Gemini CLI destroyed engine config) and the recent CONFIG-07 + Path D investigation finding (per-scope tuning has real but bounded headroom; midday gap is partly structural) both inform the risk profile:

- **Wrong**: ship `applyDataDrivenWeights()` as-is on a daily cron → guaranteed regression (hardcoded values would override per-scope overrides)
- **Wrong**: ship the AUC-fitted version without backtest gate → naïve tuning chases recent noise; could reproduce the 7d-window CONFIG-07 regression risk
- **Right**: ship the AUC-fitted version with significance + backtest gates + weekly cadence + per-scope-respect → genuine ongoing improvement with bounded blast radius
- **Conservative**: don't ship; do continue the manual loop (intel:propose → operator → backtest → CONFIG-XX entry → manual app_config INSERT) which is what's been working through CONFIG-02, CONFIG-07, and the recent ENH-MET null result

### D. Small contained experiment

**Yes.** Same scope as the `min_energy_threshold_midday` work order:

**Experiment: "Weekly intel-fit dry-run report"** (no production writes)

- Write a new scheduled routine that:
  - Runs `fitWeights()` against the last 7 days of adaptive_tracking
  - Compares proposed weights to current production weights
  - Runs a 7-day backtest of the proposed weights via the harness
  - Writes a markdown summary to `docs/intel_fit_weekly_YYYY-MM-DD.md` with the comparison
  - **Never writes to app_config**
- Run it weekly for 4 weeks
- After 4 weeks, review: did the proposals consistently identify improvements that human operators missed? Or were they noise?
- If consistently useful → graduate to the auto-apply version with gates (per §7.B)
- If noise → close the investigation, document that human-in-the-loop is the right model

**Estimated effort: 3-4 hours** to build the routine + a 4-week observation window. Zero production risk. Generates the evidence base for the bigger decision in §7.B.

---

## 8. Findings that changed the question

Two findings reframed the investigation:

1. **`applyDataDrivenWeights()` is an orphan with misleading naming.** The function name implies adaptive tuning; the implementation writes hardcoded constants. Anyone wiring it as-is would create a CONFIG-01-style incident. The "self-tuning is partially built" framing is more accurate than "self-tuning is missing" — but the existing build has a subtle correctness bug that limits its utility even if activated.

2. **`adaptive_tracking` only persists `mode='balanced'`.** The conservative + aggressive preset rows are 0/221. Any "fit weights from outcomes" loop would only have data for balanced, so the auto-tune would only adapt one of three presets. This is a smaller-than-expected feedback surface that limits how much the dormant pipeline could even contribute if activated.

If you accept these two findings, the recommendation becomes "evaluate the safe-gated experiment in §7.D before investing in the production auto-tune pipeline" — that's the cheapest way to find out whether the dormant loop would actually beat the current manual cadence.

---

## Appendix A: Data sources used

- `slate_snapshots`, `adaptive_tracking`, `daily_intelligence`, `histories`, `engine_runs`, `engine_daily_report`, `hit_detection_runs`, `datasets_box`, `datasets_pair`, `horizon_blends`, `percentile_maps`, `audit_logs`, `imports`, `saved_slates`, `slate_credits`, `user_sessions`, `push_tokens`, `pair_events`, `app_config`
- `engines/zk6.ts` (1,488 lines after ENH-MET)
- `supabase/functions/compute-slate-zk6/index.ts` (914 lines)
- `supabase/functions/run-hit-detection/index.ts`
- `supabase/functions/rebuild-datasets-zk6/index.ts`
- `supabase/functions/compute-daily-report/index.ts`
- `lib/applyWeightUpdate.ts`, `lib/backfillIntelHits.ts`
- `scripts/intel-tuning/{fit,cli,backfill-adaptive-tracking,verify-hits}.ts`
- `scripts/rls-smoke.ts`
- `components/admin/{AdaptiveLearningView,EngineConfigView,DashboardView,FingerprintView,HitTrackingView}.tsx`
- `package.json` (script inventory)

## Appendix B: Things NOT investigated (scope/time deferred)

- Whether `applyDataDrivenWeights()` was ever invoked manually in production (no audit_logs entry mentions it; would need git log forensics on the file's history)
- Whether the 4 empty feature-stub tables represent active backlog or abandoned design — needs product/roadmap input
- The interaction between BUG-148 session migration + the `daily_intelligence yesterday-hits` exclusion (whether stale session annotations could have caused over-exclusion before the 5/18 cleanup) — likely irrelevant after cleanup but technically unverified
- Whether `rebuild-datasets-zk6` should be on a schedule (probably yes for freshness; currently operator-invoked)
- Cost/benefit of removing dormant tables vs leaving them as schema-debt
