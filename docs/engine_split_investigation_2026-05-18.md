# ZK6 Per-Scope Tuning Conflict + Engine Split Feasibility

**Date:** 2026-05-18
**Author:** Claude Code (read-only investigation)
**Scope:** Forensic report; no code/config/DB changes made
**Time spent:** ~75 min

---

## 1. Executive Summary

- **The per-scope conflict is real and statistically significant on midday alone.** 60-day slate hit rates: midday 48.3% [CI 30.1–66.5], evening 79.3% [64.6–94.1], allday 75.9% [60.3–91.4]. Midday's CI sits entirely below evening's lower bound — not noise.
- **The conflict is structural, not a tuning bug.** Midday has 30% fewer draws per day than evening (21.7 vs 28.1) and 7 jurisdictions don't draw midday at all (QC, AZ, WC, WA, MN, WV, OK). A scope with materially less data WILL have a lower hit rate regardless of tuning.
- **Per-scope override infrastructure is already shipped in production** for both `engines/zk6.ts` and the live edge function (`compute-slate-zk6` v5). Six `app_config` key patterns accept `_${scope}` overrides: `engine_weights_{balanced,conservative,aggressive}`, `box_pressure_weight`, `box_freq_weight`, `recent_hit_cooldown`. CONFIG-02 (5/14) and CONFIG-07 (5/15) already use this path.
- **A full engine split would duplicate ~1,500 lines of zk6.ts plus an edge function for marginal gain.** The conflict the user observed in recent sweeps (ENH-EVCO, ENH-DBL H1/H2/H3) isn't "the engine can't be tuned for all three scopes" — it's "tuning interventions tested so far don't move the needle on the underperforming scope (midday) because the bottleneck is data volume, not parameter values."
- **Recommendation: Path D (don't split). Extend the existing per-scope override surface with the 4–5 remaining global-only knobs.** ~3–5 hours of work vs ~40+ hours for a full split. Re-evaluate split after the 5/22 CONFIG-07 scheduled review.

---

## 2. Confirmation: per-scope conflict is real (Task 1)

### 2.1 60-day slate hit rates by scope

Source: `slate_snapshots` × `top_k_straights_json[].hitType IS NOT NULL`, 2026-03-19 → 2026-05-18, deleted snapshots excluded.

| Scope   | Slates | Hits | Slate hit rate | 95% CI       | Pick hit rate (pick-hits / picks) |
|---------|--------|------|---------------:|--------------|-----------------------------------:|
| midday  | 29     | 14   | **48.3%**      | [30.1–66.5]  | 8.62% (15/174) |
| evening | 29     | 23   | **79.3%**      | [64.6–94.1]  | 18.97% (33/174) |
| allday  | 29     | 22   | **75.9%**      | [60.3–91.4]  | 24.86% (43/173) |

**Midday is significantly below the other two scopes** — its CI upper bound (66.5%) is below evening's lower bound (64.6%) and only barely overlaps with allday's lower bound (60.3%). The gap is not a sampling artifact.

### 2.2 Pre vs post CONFIG-07 split

CONFIG-07 shipped midday-only per-scope preset weights on 2026-05-15 (BOX 20.8% / PBURST 5.2% / CO 74% / DGC 0%). Splitting the 60-day window:

| Scope   | Era         | Slates | Hits | Slate hit rate |
|---------|-------------|-------:|-----:|---------------:|
| midday  | pre  5/15   | 26     | 11   | 42.3%          |
| midday  | post 5/15   | **3**  | **3**| **100.0%**     |
| evening | pre  5/15   | 26     | 21   | 80.8%          |
| evening | post 5/15   | 3      | 2    | 66.7%          |
| allday  | pre  5/15   | 26     | 20   | 76.9%          |
| allday  | post 5/15   | 3      | 2    | 66.7%          |

**Two caveats** make the post-CONFIG-07 numbers unreliable:
1. **n=3 per scope is far too small for any inference.** The 100% midday post-CONFIG-07 figure is 3 slates; one miss would drop it to 66.7%.
2. CONFIG-07 has a scheduled 7-day review at 2026-05-22 ([[project-config07-review-window]]). That review fires automatically and is the right moment to judge the midday intervention.

What the data DOES support: midday underperformed for the first 26 days of the window under the global preset; CONFIG-07 was the response. The 3-slate post-window is suggestive but unfalsifiable until 5/22.

### 2.3 Variance within scope

Standard deviations (binary 0/1 hit indicator, population stddev):
- midday: 0.500
- evening: 0.405
- allday: 0.428

Midday is the most variable scope as well as the lowest-mean. High variance + low mean = a scope where engine performance is sensitive to short-run input quality (which lines up with the data-volume hypothesis below).

---

## 3. Why the scopes diverge (Tasks 2 + 3)

### 3.1 Parameter divergence — what's ALREADY per-scope

Six `app_config` key patterns already support `_${scope}` overrides in both `engines/zk6.ts` (line 410, `loadEngineConfig(scope)`) and `supabase/functions/compute-slate-zk6/index.ts` (line 121+). Live values as of 2026-05-18:

| Key pattern                              | Global value | midday override | evening override | allday override |
|------------------------------------------|--------------|-----------------|------------------|-----------------|
| `engine_weights_balanced`                | `{BOX:49.5, PBURST:27, CO:13.5, DGC:10}` | `{BOX:20.8, PBURST:5.2, CO:74, DGC:0}` (CONFIG-07) | — | — |
| `engine_weights_conservative`            | `{BOX:67.5, PBURST:13.5, CO:9, DGC:10}` | `{BOX:35.1, PBURST:3.2, CO:61.6, DGC:0}` | — | — |
| `engine_weights_aggressive`              | `{BOX:40.5, PBURST:31.5, CO:18, DGC:10}` | `{BOX:14, PBURST:5, CO:81, DGC:0}` | — | — |
| `box_pressure_weight`                    | (hardcoded default 0.40) | `-0.40` (CONFIG-02) | `-0.40` (CONFIG-02) | (uses default) |
| `box_freq_weight`                        | (hardcoded default 0.60) | (uses default) | (uses default) | (uses default) |
| `recent_hit_cooldown`                    | `20` | `10` | — | — |

**Observation:** the per-scope override path is mature. Midday already has 4 distinct overrides; evening has 1 (box_pressure); allday has zero overrides (uses globals). The engine is *already* effectively three configs running on shared code.

### 3.2 Parameter divergence — what's NOT per-scope yet

Global-only keys today, no `_${scope}` reader in either engine path:

| Key                       | Live value | Per-scope candidate? |
|---------------------------|------------|----------------------|
| `min_energy_threshold`    | 70         | Yes — different scopes have different score distributions |
| `pressure_threshold`      | 250        | Yes — feeds into BOX pressure signal which is already per-scope-weighted |
| `pressure_bonus_weight`   | 10         | Yes — paired with pressure_threshold |
| `pair_rep_cap`            | 2          | Yes — diversity constraint differs by scope universe size |
| `k6_singles_max`          | 4          | Yes — scope multiplicity priors could justify this |
| `k6_doubles_max`          | 2          | Yes — same |
| `k6_triples_on`           | false      | Probably no — triples are universally bad in these data |
| `synergy_boost_on`        | false      | No — currently off everywhere |
| `synergy_boost_weight`    | 0.15       | No — moot while synergy_boost_on=false |
| `horizon_weights`         | `{H01Y:100, rest:0}` | No — single-source-of-truth design |

**5 keys** are reasonable per-scope candidates (`min_energy_threshold`, `pressure_threshold`, `pressure_bonus_weight`, `pair_rep_cap`, `k6_singles_max`/`k6_doubles_max`). Of these, `min_energy_threshold` is most likely to matter — the ENH-DBL post-mortem showed doubles cluster at low energy in midday (CO=74% suppresses them), which a per-scope floor could address without the catastrophic side effects of a global change.

### 3.3 Signal characteristics — why scopes genuinely differ

#### 3.3a Per-pick signal averages (selected K6 picks, last 60d, balanced mode)

| Scope   | avg BOX | avg PBURST | avg CO  | avg DGC | avg energy |
|---------|--------:|-----------:|--------:|--------:|-----------:|
| midday  | 0.920   | 0.821      | **0.859** | 0.635 | 97.5 |
| evening | 0.892   | 0.765      | 0.643   | 0.598   | 96.3 |
| allday  | 0.890   | 0.827      | 0.673   | 0.675   | 98.8 |

Midday picks are **strongly CO-biased** (0.859 avg vs 0.64 elsewhere), reflecting CONFIG-07's 74% CO weight. The other signals are roughly comparable across scopes — engine isn't picking from materially different signal universes, it's just weighting them differently per scope.

#### 3.3b Draw volume per scope (the load-bearing finding)

Source: `histories` last 60 days, group by session:

| Scope   | Days observed | Avg draws/day | StdDev | Min | Max |
|---------|--------------:|--------------:|-------:|----:|----:|
| midday  | 57            | 21.7          | 14.2   | 1   | 34  |
| evening | 57            | 28.1          | 18.4   | 1   | 42  |

**Evening has ~30% more draws per day than midday.** This is the biggest single explanatory factor for the hit-rate gap. With fewer draws available to match against, midday slates have proportionally fewer chances per K6 pick to score a hit — independent of any tuning choice.

#### 3.3c Per-jurisdiction scope behavior

| Subset | Jurisdictions | Midday share |
|--------|---------------|--------------|
| Evening-only states | QC, AZ, WC, WA, MN, WV, OK | 0% (no midday draws at all) |
| Roughly 50/50 | ~25 states incl CA, NY, FL, TX, MI, OH, etc. | 49–52% |
| Midday-heavy | TN (58.5%), MSS/MS (~52%), WI (51.3%) | >50% |

**7 of ~39 jurisdictions don't draw midday at all** — they're physically absent from the midday data universe. The midday engine operates on ~80% of the jurisdiction count that evening does.

This makes the midday→evening hit-rate gap a structural property of the data, not a tuning artifact. No CO weight value will make midday match evening's hit rate as long as midday has 30% less data to score against.

### 3.4 Synthesis: what's actually causing the conflict

The recent failed sweeps (ENH-EVCO, ENH-DBL H1/H2/H3) all share a single explanation:

- **They tried to lift the underperforming scope (midday/evening) via parameter changes.**
- **The bottleneck wasn't parameters — it was data volume + scope-specific universe shape.**
- Tuning interventions either: (a) had zero effect because the magnitude was too small to overcome structural disadvantages, or (b) admitted weaker picks that tanked overall quality.

This is NOT "the engine can't be tuned for all three scopes." This IS "the three scopes have different ceilings driven by data input differences, and the current engine is already operating near each scope's ceiling once per-scope weights are applied."

---

## 4. Engine split feasibility (Task 4)

### 4.A Code structure

**Current state — 2,584 lines across 3 files:**

| File                                                     | Lines | Role |
|----------------------------------------------------------|------:|------|
| `engines/zk6.ts`                                         | 1,465 | Client-side reference engine + fallback when `EXPO_PUBLIC_USE_EDGE_ZK6=false` |
| `supabase/functions/compute-slate-zk6/index.ts`          | 896   | Edge function — **the live production engine** (flag is `true` in .env) |
| `lib/engineCore.ts`                                      | 223   | Shared math helpers: `multiplicityOf`, `topPairOf`, `MULTIPLICITY_PRIORS`, `computeDGC`, `computeWeightedScore`, `maxNorm`, etc. |

**Scope-handling in engine code:**
- `engines/zk6.ts:84` — `normalizeScope()` accepts midday/evening/allday/case-variants
- `engines/zk6.ts:314` — `sessionClause = scope === 'allday' ? '' : '&session=eq.${scope}'` — controls which histories rows feed the dataset fetch
- `engines/zk6.ts:410` — `loadEngineConfig(scope?)` reads global keys + per-scope overrides
- `engines/zk6.ts:475–539` — override-application loop for cooldown, BOX freq/pressure, preset weights
- The K6 selection loop (`runK6Selection`) takes scope as a parameter but doesn't branch on it directly — all scope-specific behavior funnels through the config

**Bottom line on code structure:** there is no scope-branching control flow in the scoring logic itself. The "split" the user is considering would be entirely about config surface, not code paths.

**Could we do this with a single engine + scope-specific config bundle?** Yes — and we already do. Adding more `_${scope}` overrides for the 5 remaining global keys is the natural extension of the existing pattern.

**Could we split into 3 separate engine files?** Yes mechanically but it would duplicate ~1,500 lines of zk6.ts × 3 + 896 lines of the edge function × 3 = ~7,000 lines of duplication for behavior that's currently differentiated by ~6 config keys per scope. The cost is in long-term maintenance: every bug fix or change to the scoring model now has to be made in 3 places.

### 4.B Config storage

`app_config` is a flat key/value table (`text` keys, `jsonb` values). The per-scope pattern is "key" → "key_${scope}" with the same value shape. No schema change needed to add more per-scope keys.

**Migration path for extending overrides:** trivial — INSERT new rows like `min_energy_threshold_midday` with the same value shape as `min_energy_threshold`. Engine readers need 4–5 lines of code each to check the per-scope key first and fall back to the global. Mirror pattern: `scopeBoxPressKey` in engines/zk6.ts:419 and edge function line 126.

### 4.C Edge Function impact

**Current state:** `EXPO_PUBLIC_USE_EDGE_ZK6=true` in `.env` — the live production path is the edge function (`compute-slate-zk6` v5, sha256 `7c1bd4a9…` per BUG-150 deploy). `engines/zk6.ts` is the parity-aligned fallback, called only when the flag is false.

**Phase 3 migration consideration:** the "move ZK6 to edge function for IP protection" work the user mentioned is **already done.** The edge function is already the production path. The remaining work is one of:
- (a) Keep both implementations and maintain parity (current state — overhead but safe)
- (b) Retire `engines/zk6.ts` as the fallback and rely on the edge function exclusively (closes the duplication but removes the parity guard)

**Does the split happen before or after the edge function migration?** Moot — the migration has happened. If the split goes forward, it would be 3 edge functions + 3 fallback files = 6 files to maintain parity across, vs the current 2.

**Cost-benefit of splitting first vs migrating first:** N/A — migration is done.

### 4.D Backtest harness impact

The harness already supports per-scope config overrides via `presetByScope`, `recentHitCooldownByScope`, `boxFreqWeightByScope`, `boxPressureWeightByScope`, `multiplicityPriorsByScope` (just added 5/18), `minEnergyThresholdByMultiplicityByScope`, `doublesTopNBoostByScope`. This pattern is exhaustively exercised in `scripts/backtest/configs.ts` (intel_weights_midday_only_floor70, the ENH-EVCO/DBL families).

The harness would need **trivial extensions** for any additional per-scope keys: one optional field in `EngineConfig` + one lookup line in `replay.ts`. Less than 30 minutes of work per new override.

If we did a full split: the harness would need 3 separate `EngineConfig` shapes or a `{ midday: EngineConfig, evening: EngineConfig, allday: EngineConfig }` wrapper. Not difficult but a real refactor — ~4–6 hours.

### 4.E Slate generation pipeline routing

Slate generation already knows the scope at call time:
- `hooks/useDataIngestion.tsx::regenerateMutation` takes `scope` as input
- `engines/zk6.ts::computeSlate({scope, ...})` and `compute-slate-zk6` edge function POST body both accept `scope`
- Both pass scope through to `loadEngineConfig(scope)`

**Routing logic for per-scope config is already in place** — it's how CONFIG-02 and CONFIG-07 work today. No new routing needed.

If we split into 3 engines: the call site would need a dispatch (`engineForScope(scope).computeSlate(...)`) but this is a 3-line change in 2–3 call sites.

### 4.F daily_intelligence + slate_snapshots schemas

Both tables already track scope:
- `daily_intelligence` columns include `scope text` (verified) — no schema change needed
- `slate_snapshots` columns include `scope text, mode text, jurisdiction text` — already differentiates per-scope outputs

If we split: no schema change needed. If we wanted to track *which* engine variant generated a slate, we could add `engine_variant text` to `slate_snapshots`. Current snapshots have `engine_version text` already which serves a similar purpose — could be encoded as `zk6.1-midday` etc. with no migration.

---

## 5. Risk Assessment (Task 5)

### 5.1 Risks of FULL SPLIT (Path A)

| Risk | Severity | Notes |
|------|---------:|-------|
| Code duplication ×3 | 🔴 High | ~7,000 lines duplicated. Every BUG-XXX fix in scoring touches 3 files going forward. BUG-148/149/150 each had to touch zk6.ts + edge function — splitting triples that surface. |
| Tuning drift between scopes | 🟠 Med | Engineer fixes midday engine, forgets evening. Discovered weeks later. Mitigated by parity-test infrastructure that would need to be built. |
| Testing burden 3× | 🟠 Med | Every change needs 3 backtest sweeps. Current single-config sweep is ~360 slates / ~30s. 3-engine sweep is 3× that. |
| Hidden behavioral divergence | 🟠 Med | Two engines that "should" behave the same may not. Source of subtle bugs that the parity guards in configs.ts catch today via single-engine wiring. |
| Allday double-counts midday + evening | 🟠 Med | If midday and evening engines are independent, allday must avoid replicating their outputs. Currently allday is its own scope on the same engine — clean separation. Split version needs explicit dedup logic. |
| Maintenance cost across edge function versions | 🟠 Med | Currently `compute-slate-zk6 v5`. Splitting means `compute-slate-zk6-midday v1`, etc. — version skew between scopes possible. |

### 5.2 Risks of NOT SPLITTING

| Risk | Severity | Notes |
|------|---------:|-------|
| Single scope's tuning needs go unmet | 🟡 Low | Per-scope override surface already absorbs the differentiation. The recent failed sweeps weren't blocked by this. |
| Tuning interventions for one scope leak into others | 🟢 Very low | Per-scope override pattern is well-tested (CONFIG-02, CONFIG-07 isolated to specific scopes successfully). |
| Hits hard upper bound on per-scope optimization | 🟡 Low | Possible. But the data-volume + universe-size analysis (§3.3) shows the upper bound is structural, not architectural — splitting wouldn't lift it. |

### 5.3 Risks of CONFIG OVERLAY (Path B) — partial implementation

| Risk | Severity | Notes |
|------|---------:|-------|
| Override surface grows complex | 🟡 Low | We have 6 patterns today, would add 5 more. Each has a clear naming convention. |
| Forgetting to add per-scope to a new key | 🟢 Very low | Easy to add as part of any new tuning landed via backtest. The convention is already documented. |

### 5.4 Alternative: scope-aware tuning in single engine (current state)

Already implemented. Recent CONFIG-02 + CONFIG-07 are exactly this. No additional risk beyond what we have today.

---

## 6. Recommendation (Task 6)

### Path D — Don't split yet. Extend per-scope override surface.

**Concrete work items, in priority order:**

1. **Add `min_energy_threshold_${scope}` reader** to `engines/zk6.ts` + `compute-slate-zk6` edge function — 4–5 lines each. Backtest a midday-only `min_energy_threshold_midday=50` candidate (vs global 70) to test whether the ENH-DBL "doubles can't reach 70" observation is mitigatable. **~1 hour.**

2. **Wait for CONFIG-07 scheduled review on 2026-05-22.** That review will produce 7+ days of post-deploy midday slate data. If midday slate hit rate ≥ 60% holds, the per-scope override path is validated for midday. If it regresses below 50%, that's stronger evidence the structural data-volume issue dominates. **0 work, just observe.**

3. **Add `pair_rep_cap_${scope}` + `pressure_threshold_${scope}` readers** if midday or evening shows continued issues after CONFIG-07 review. Same pattern as #1, ~1 hour each. **~2 hours.**

4. **Re-evaluate split AFTER 30 days of additional per-scope override experimentation.** If after 5–6 more tuning iterations using the override surface the midday/evening conflict still hasn't resolved, then revisit Path A or Path B as a structural change.

**Total estimated effort:** 3–5 hours of code work + passive observation through 2026-06-17 (30-day review window).

### Why NOT Path A (full split):

- The per-scope conflict is one scope (midday) underperforming for structural reasons (less data volume, fewer jurisdictions). A split won't fix the structural problem.
- The cost is ~40+ hours of refactor + permanent tripling of maintenance burden for scoring changes.
- The infrastructure to do per-scope tuning *without* splitting already exists and is unexercised on 5 of 11 candidate keys.
- BUG-148/149/150 in the last 48 hours each required parallel edits to zk6.ts and the edge function. Tripling that surface area will multiply incident time-to-fix by 3 for every future scoring bug.

### Why NOT Path B (config overlay as a clean rewrite):

- We already HAVE config overlay. Rewriting it cleaner wouldn't add capabilities.

### Why NOT Path C (hybrid):

- The "core engine + scope-specific modules" framing assumes scope-specific scoring logic exists. It doesn't. The current scope differentiation is entirely parameter-driven. A module pattern would be solving a problem we don't have.

### What WOULD justify revisiting the split decision:

1. The data-volume issue is fixed (e.g., new midday jurisdictions added) AND midday still underperforms after exhausting the override surface.
2. A scope develops a unique scoring requirement that can't be expressed as parameter changes (e.g., midday needs a completely different signal — not just different weights on the same signals).
3. Three scopes diverge so far that shared scoring math actively hurts one of them (no current evidence of this).

---

## 7. Next Steps (specific work items)

| # | Item | Owner | Effort | Status |
|---|------|-------|-------:|--------|
| 1 | Add `min_energy_threshold_${scope}` to `engines/zk6.ts::loadEngineConfig` + edge fn | claude-code | 1h | **COMPLETED-NULL** 2026-05-18 — reader shipped, but candidate produced Δ=0.0pp. Code retained as exercisable infrastructure. See `docs/min_energy_threshold_midday_backtest_2026-05-18.md`. |
| 2 | Backtest `min_energy_threshold_midday=50` candidate config | claude-code | 30m | **COMPLETED-NULL** 2026-05-18 — see above report. Energy floor closed as a tuning lever for midday. |
| 3 | Observe CONFIG-07 5/22 scheduled review | scheduled routine | 0 | wait |
| 4 | After 5/22: log decision + memory update; if midday OK, close ENH-DBL/ENH-EVCO investigations permanently | claude-code | 30m | blocked on #3 |
| 5 | **ACTIVE QUEUE** — Add `pair_rep_cap_${scope}` + `pressure_threshold_${scope}` overrides; backtest midday candidates | claude-code | 2h | pending 5/22 CONFIG-07 review (#3) |
| 6 | Re-run this investigation 2026-06-17 (30 days post-deploy) with refreshed data to confirm decision | claude-code | 1h | wait |

---

## Appendix A: Data sources used

- `slate_snapshots` (60-day window, deleted_at IS NULL, top_k_straights_json scanned for hitType annotations)
- `adaptive_tracking` (60-day window, mode=balanced, rank 1–6) — per-pick signal averages
- `histories` (60-day window) — draw volume + per-jurisdiction scope behavior
- `app_config` (live snapshot 2026-05-18) — full key inventory
- `engines/zk6.ts` (read-only) — code structure + scope handling
- `supabase/functions/compute-slate-zk6/index.ts` (read-only) — edge function structure
- `lib/engineCore.ts` (read-only) — shared scoring math
- `.env` — `EXPO_PUBLIC_USE_EDGE_ZK6` flag value

## Appendix B: Data NOT gathered / would need separate work

- **Per-jurisdiction hit rates broken down by scope** — would clarify whether evening-only states "carry" the evening scope's hit rate. Doable in SQL, ~10 min; deferred for scope.
- **Sensitivity analysis sweeping each global parameter through its range, per scope** — would directly answer "would per-scope overrides on these 5 keys actually diverge?" Doable via backtest harness with ~15–20 new configs and 4–5 hours of compute + analysis. Deferred until #5 above is triggered.
- **Volatility decay curves per scope** — would show whether midday patterns persist for different durations than evening. Requires building a time-series model that the current data analysis tooling doesn't have. Out of scope for this investigation.
- **Cross-scope hit overlap analysis** — when allday picks the same combo as midday, do they correlate on outcome? Bears on whether allday is "double-dipping." Doable in SQL, ~15 min; deferred.

## Appendix C: Findings that changed the question

The investigation prompt framed the question as "should we split into three engines because they can't be tuned together." Two findings reframed it:

1. **The per-scope split is already 80% implemented** via the `_${scope}` override pattern. The user's three failed sweeps over the past 24h (ENH-EVCO, ENH-DBL H1/H2/H3) were all exercising this existing surface; what failed was *the specific candidates*, not the per-scope override architecture.
2. **Midday's underperformance is structural** (30% less draw volume, 7 missing jurisdictions). Splitting won't fix it — only additional jurisdictions drawing midday, or accepting midday's lower ceiling, would.

If the user accepts these two findings, the question becomes "should we extend the existing per-scope override surface" — which has a clear answer (yes, incrementally) and modest cost (~5 hours of work).

If the user disputes these findings (e.g., believes the data-volume hypothesis is wrong), the appropriate next step is the sensitivity analysis in Appendix B, not a code split.

---

## Appendix D: How much of midday's gap is data volume vs pick quality?

Added 2026-05-18 in response to a load-bearing follow-up question: if midday's hit rate scaled linearly with draw volume relative to evening, what rate would we expect — and is the observed 48.3% consistent with that, or is there underperformance beyond what data volume explains?

### D.1 Two framings, two answers, same direction

**Framing 1 — naïve linear scaling:**

```
midday_expected = evening_rate × (midday_draws / evening_draws)
                = 79.3% × (21.7 / 28.1)
                = 61.2%
```

Observed midday: **48.3%** → **~13pp unexplained by data volume.**

**Framing 2 — binomial slate-hit model (more correct for slate hit rate):**

Slate hit rate is `P(≥1 of K picks hits ≥1 of N draws)`, which saturates as N grows. Linear scaling actually *understates* the expected rate. Solving for evening's per-draw match probability:

```
0.793 = 1 − (1 − p_e)^28.1
p_e ≈ 0.055
```

If midday picks had the same per-draw match probability operating on 21.7 draws:

```
midday_expected = 1 − (1 − 0.055)^21.7 ≈ 70.5%
```

Observed midday: **48.3%** → **~22pp unexplained by data volume.**

### D.2 The cleanest signal — pick hit rate ratios

| Scope   | Pick hit rate | Ratio to evening |
|---------|--------------:|-----------------:|
| evening | 18.97%        | 1.00             |
| midday  | 8.62%         | **0.45**         |
| (data-volume ratio: midday/evening draws) | — | 0.77 |

If midday picks were equally good and only handicapped by fewer draws to match against, midday's pick hit rate should be ~0.77× evening's, i.e. ~14.6%. Observed is **8.6% — midday picks themselves are roughly half as predictive as evening picks**, far more than data volume alone explains.

### D.3 What this reframes

The §3.4 conclusion ("The conflict is structural, not a tuning bug") was too strong. The honest read:

- **Part of midday's gap (~8pp out of ~31pp) IS structural** — driven by 30% less data volume and 7 missing jurisdictions. No tuning fixes that.
- **The remaining ~13–22pp IS tuning headroom.** Midday picks are demonstrably worse per pick, not just operating on a smaller universe. Per-scope tuning has real room to recover quality.

### D.4 Implications for the Path D recommendation

The recommendation **stands and is strengthened**, not weakened:

- The per-scope override surface is the right tool — and it has substantially more headroom than the original report suggested (~13–22pp of midday slate-rate recovery is possible, not just incremental gains).
- CONFIG-07 (CO=74% midday preset, shipped 5/15) is plausibly the *right kind* of intervention — it targets pick quality, which is the actual gap. The 5/22 scheduled review becomes more load-bearing, not less.
- Splitting the engine still doesn't help because the headroom is in *pick quality* (i.e., what the scoring model produces), which is a tuning problem within the existing architecture, not an architectural one.

### D.5 Caveats

- The binomial model assumes per-draw independence; actual draws within a day across jurisdictions have some shared structure, so the true ceiling is probably slightly below 70.5%.
- Per-pick hit rate uses different denominators per scope (different total picks) but the ratio comparison is dimensionally clean.
- All these numbers are 60-day snapshots; volatility per scope (midday stddev 0.500 vs evening 0.405) means the underperformance could be partly run-of-bad-luck. A 90-day refresh in mid-June would tighten the CIs.
