# `min_energy_threshold_midday=50` Backtest Report

**Date:** 2026-05-18
**Author:** Claude Code (work order execution)
**Context:** Item #1–2 from `docs/engine_split_investigation_2026-05-18.md` §7
**Status:** Investigation complete; **recommendation = DO NOT deploy**

---

## 1. Comparison table (60d, balanced mode, n=57 slates per scope)

| Scope   | Baseline (floor 70) | Candidate (midday floor 50) | Δ slate hit rate | Wilson 95% CI overlap |
|---------|---------------------:|----------------------------:|-----------------:|-----------------------|
| midday  | 57.9% [45.0–69.8] | 57.9% [45.0–69.8] | **0.0pp**        | Identical             |
| evening | 50.9% [38.3–63.4] | 50.9% [38.3–63.4] | **0.0pp**        | Identical (isolation ✓) |
| allday  | 68.4% [55.5–79.0] | 68.4% [55.5–79.0] | **0.0pp**        | Identical (isolation ✓) |
| **Overall** | **59.1% [51.6–66.2]** | **59.1% [51.6–66.2]** | **0.0pp**    | Identical             |

Identical pick-hit totals as well: 184 across both configs.

## 2. Statistical significance assessment

- Midday Δ = 0.0pp. There is no signal to test for significance — the candidate produced exactly the same slate hit rate as the baseline.
- The standard error for the baseline midday rate (57.9%, n=57) is ~6.5pp. A true positive intervention would need to produce a delta ≥ 13pp (2× SE) to be confidently called significant at 95%. The observed delta is **two orders of magnitude smaller**.
- Conclusion: no detectable effect on midday slate hit rate.

## 3. Isolation check ✓ PASSED

The per-scope override correctly isolates to midday:

- **evening**: baseline 50.9% → candidate 50.9% (Δ = 0.0pp)
- **allday**: baseline 68.4% → candidate 68.4% (Δ = 0.0pp)
- Per-rank tables for evening and allday are bit-identical between baseline and candidate

The new `minEnergyThresholdByScope` reader in `replay.ts` is correctly wired: setting `midday: 50` affects only midday's K6 selection, not the other scopes. The production `engines/zk6.ts` and edge function readers follow the same logic pattern (mirroring the existing `recentHitCooldownByScope` precedent), so they will behave identically.

## 4. What the candidate DID change (per-rank evidence)

Slate-level rate was unchanged, but the per-rank composition of midday slates shifted meaningfully:

| rank | baseline | candidate | Δ      |
|------|---------:|----------:|-------:|
| r1   | 22.8%    | 21.1%     | -1.7pp |
| r2   | 21.1%    | 15.8%     | -5.3pp |
| r3   | 8.8%     | **17.5%** | **+8.7pp** |
| r4   | 14.0%    | 8.8%      | -5.2pp |
| r5   | 8.8%     | 10.5%     | +1.7pp |
| r6   | 17.5%    | 19.3%     | +1.8pp |

The candidate admitted different midday picks (the 50-69th energy percentile band) and they ended up at ranks 3, 5, 6 in the iteration order. But the slate-level hit count netted to exactly the same total — the new picks didn't add any new winning slates beyond what the baseline picks already produced.

**Interpretation:** the floor relaxation works mechanically (different picks get admitted) but those picks aren't better predictors than what the engine was already picking. The energy floor was correctly identifying lower-quality candidates; lowering it to 50 just admitted them, with neutral outcome on hit rate.

## 5. Doubles allocation (cross-check from CSV picks_doubles column)

| Config | midday | evening | allday |
|--------|-------:|--------:|-------:|
| baseline | 0 doubles / 57 slates | 0 / 57 | 0.02/slate |
| candidate (midday floor 50) | 0 doubles / 57 slates | 0 / 57 | 0.02/slate |

Confirms the parked ENH-DBL finding: doubles can't even reach the 50th energy percentile, let alone the 70th. The midday floor relaxation to 50 did NOT admit any doubles. The original "CO=74% midday preset suppresses doubles below the floor" hypothesis from the engine-split investigation §3.3a was wrong about the mechanism: doubles score so low that no realistic floor (above ~10) admits them on midday.

## 6. Recommendation: KEEP `min_energy_threshold` at 70 globally; do NOT add a midday-specific value

**Why don't deploy:**
- Zero slate-rate improvement (Δ=0.0pp midday)
- Per-rank evidence shows the floor relaxation admits qualitatively *different* picks, not *better* picks — neutral outcome
- Doubles allocation unchanged (the secondary hypothesis the change was supposed to help)
- Adds a per-scope config row to maintain for zero observable benefit

**Why not test other values (e.g., 40, 55, 60):**
- Floor 55–69 would admit *fewer* additional picks than 50; the slate-rate ceiling is bounded by 50's null result
- Floor 30–49 would admit lower-quality picks; the ENH-DBL H2 post-mortem already established this regresses overall slate rate (midday r1 dropped 30%→10% at floor=0 in that sweep — directionally consistent with admitting weak candidates)
- The midday 13–22pp tuning headroom identified in Appendix D of the investigation is NOT in this lever

**What this finding teaches:**
- The energy floor isn't the bottleneck on midday performance
- The new infrastructure (per-scope reader + harness override) is correctly wired and exercisable for future per-scope keys
- The next per-scope intervention to test (per §7 of the investigation, after CONFIG-07 5/22 review) should target a different parameter — `pair_rep_cap_${scope}` or `pressure_threshold_${scope}` rank higher on the priority list given this null result

## 7. SQL INSERT statement (NOT for execution — recommendation is to not deploy)

For completeness, if the decision were reversed:

```sql
-- DO NOT EXECUTE — recommendation is to keep floor at 70 globally
INSERT INTO app_config (key, value)
VALUES ('min_energy_threshold_midday', '50'::jsonb);
```

The engine paths (both `engines/zk6.ts` and `compute-slate-zk6` edge function) would read this on next slate generation. **Do not run this INSERT** unless overriding the recommendation above.

## 8. What got shipped that's worth keeping

These edits are committed-ready and useful infrastructure even though the candidate failed:

| File | Change | Keep? |
|------|--------|-------|
| `engines/zk6.ts` | Added `scopeMinEnergyKey` reader following CONFIG-05/07 pattern | ✓ Yes — enables future per-scope floor experiments |
| `supabase/functions/compute-slate-zk6/index.ts` | Parity reader | ✓ Yes — must stay in sync with above |
| `scripts/backtest/types.ts` | Added `minEnergyThresholdByScope?: Partial<Record<Scope, number>>` | ✓ Yes — harness infrastructure |
| `scripts/backtest/replay.ts` | Resolves per-scope override in K6 selection | ✓ Yes — required for harness field |
| `scripts/backtest/configs.ts` | Added `min_energy_midday_50` candidate | ✓ Yes (mark PARKED with null-result post-mortem; mirrors ENH-EVCO/ENH-DBL handling) |

**No production app_config changes were made.** No edge function deploy. The infrastructure is in place for any future per-scope floor test without re-touching code.

## 9. Time budget retrospective

| Phase | Estimated | Actual |
|-------|-----------|--------|
| Code changes + parity check | 30 min | ~20 min |
| Backtest harness extension + run | 30 min | ~15 min |
| Report writing | 30 min | ~15 min |
| **Total** | **90 min** | **~50 min** |

Came in under budget because the override pattern was so well-established that the code changes were close to mechanical.
