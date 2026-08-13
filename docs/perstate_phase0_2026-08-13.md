# Per-State Engine — Phase 0 Measurement (ENG-PERSTATE-P0, 2026-08-13)

**Question:** ENH-AUDIT v2 promoted "per-state intelligence" as the highest engine
priority — the structural fix the reorder tiebreaks were standing in for. Phase 0
asks, before any build: *does per-state data support a per-state accuracy engine at
all, and if so at what granularity?* All measurements read-only, full-coverage era
(2026-04-01 → 2026-08-12, 9,223 draws, 39 jurisdictions).

**Verdict up front: the per-state ACCURACY hypothesis measures out at Phase 0 —
no estimable substrate exists at any granularity tested.** What survives is
deterministic participation structure (product/playability value, partly shipped)
and per-state *evaluation* (receipts). No backtest is warranted; there is no
candidate to test. This is consistent with, and extends, the SIGNAL-INFO-01/02
ceiling verdict: the draws are fair nationally, and they are fair per-state too.

---

## 1. There is no per-state dataset layer

`datasets_box` and `datasets_pair` contain **zero** `jurisdiction IS NOT NULL`
rows (live-counted). Every engine signal reads the national aggregate slice. A
per-state engine would have to build its features from `histories` directly —
which is why the density facts below are decisive.

## 2. Comboset-level per-state frequency: data-starved ~20× — DEAD

| metric (per jurisdiction, 134 days) | value |
|---|---|
| rows: min / median / max | 108 / **252** / 465 (TX; 4-draw schedule folded to 2 sessions) |
| distinct combosets seen (of 220) | min 85 / **median 141** / max 178 |
| draws per comboset cell (median state) | **~1.1** |

Estimating 220 comboset propensities from ~252 observations is not a weak signal —
it is no signal. Any per-state comboset frequency channel would be selection on
noise. (The national engine solves this exact problem by aggregating states; the
aggregation *is* the dataset layer.)

## 3. Positional digit-level per-state bias: estimable, and measures UNIFORM — DEAD

The one granularity the data CAN estimate (30 cells/state, ~25–46 obs/cell):
per-state positional digit frequencies — where real per-state mechanics
(different machines, ball sets, draw procedures) would surface if they existed.

Universe-level chi-square vs uniform, every jurisdiction with ≥100 draws ×
3 positions — **117 tests**:

| criterion | observed | expected by chance |
|---|---|---|
| exceed 95% critical (16.92, df=9) | **3** | ~5.9 |
| exceed 99% critical (21.67) | **0** | ~1.2 |

Fewer 95% exceedances than chance predicts; zero at 99%. TX (the richest state,
n=465) inspected cell-by-cell: range 32–63 against 46.5 expected — unremarkable.
**Per-state digit distributions are uniform.** No exploitable bias at the only
estimable granularity. Caveats recorded: 134-day window; n≥100 filter excludes
the smallest feeds; straight-position digits tested (the mechanism-sensitive
representation — comboset-level uniformity is the national engine's settled
domain).

## 4. Recency-based per-state strength: already falsified — NOT RETESTED

STATE_STR (recency-weighted per-state hit rate) was falsified three times and the
shipped channel stays weight-0. Nothing here re-opens it; Phase 0 tested the
*structural* granularities the STATE_STR verdicts did not cover.

## 5. What per-state data IS good for (and its status)

- **Participation structure (deterministic, real):** 33 midday vs 39 evening
  jurisdictions; evening-only feeds: MN, OK, QC, W.Canada, WA, WV; Sunday drops
  to 29/37 (TX/WV/PR dark; TN/SC/AR midday-dark — matches the recorded schedule).
  Value is *playability guidance* — which states can settle a pick today — i.e.
  product surface, not engine scoring. Partly shipped (topJurisdictions metadata,
  DrawTicker schedule, Sunday-schedule ops notes).
- **Per-state evaluation/receipts:** `adaptive_tracking.matched_state` already
  records where picks settle. Honest per-state claims ("settled in GA") are a
  track-record/UX asset and need no new engine.
- **Scope-mixture arithmetic:** evening's larger state count (39 vs 33 draws/day)
  mechanically raises any-hit probability vs midday — worth remembering when
  comparing scope baselines, but it is accounting, not prediction.

## 6. Consequence for the engine backlog

The "per-state is the path" line in the 6/6 midday investigation should now be
read as: *per-SCOPE config effects were real; the per-state substrate underneath
them is not estimable and, where estimable, is uniform.* The promoted priority is
**re-scoped from "per-state engine" to "per-state product surfaces"** (playability
+ receipts — UX lanes, operator-priced), and the engine accuracy backlog after
Phase 0 is empty — which is exactly where SIGNAL-INFO-01/02 said it was.
Remaining engine work is robustness: P4 (gated history floor), P5 (edge
consolidation at next deploy), P6 (DI row-count red flag — verified missing from
`computeBrief.ts`'s flag set, one small addition when ordered).

**No backtest was spent. Nothing was built. Registry check: this document
proposes no accuracy lever.**

*Harness scripts (scratchpad, session-local): perstate_density.ts,
perstate_mixture.ts, perstate_chisq.ts — trivial REST + counting; re-derivable
from this document's method descriptions in minutes if ever needed again.*
