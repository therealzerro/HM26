# Hold-out fit — can six months of results + data be reverse-engineered into a picker? (2026-11-01, Sunday evening)

**Operator ask:** "is there no option to reverse engineer the engine based on having 6 months of results and 6 months of data?" → "run the hold-out fit now, deep think and be creative."

**Design.** Fit on **May 1 → Aug 31** only, score **Sep 1 → Oct 31** untouched. Two independent halves: (A) a model fitted directly to the results from as-of features, (B) the engine itself replayed under 18 configurations. Hits always computed from `histories` (no stored flags, BUG-162). Scripts + configs: `scripts/research/holdout_2026_11_01/`.

## A. Feature model fitted to the results (as-of, leak-free)

Data: 15,149 draws 3/01–10/31 (full feed from 4/01). Universe: 120 singles sets (doubles/triples handled in the state model). For every session × set, 11 features from draws strictly before that session: rate over the last 60 / 120 / 180 sessions and all-time, gap since last draw (and log), drawn last session, drawn in last 3, pair strength (120 sessions), digit strength (60), gap × rate (the engine's pressure term). L2 logistic regression (scipy). Train 246 sessions / 9,031 draws; test 122 sessions / 4,488 draws.

| Lens | Train (May–Aug) | **Test (Sep–Oct)** |
|---|---|---|
| Within-session AUC, fitted model | 0.511 | **0.503** |
| Pooled AUC with session-size features (logN, evening) | 0.550 | 0.541 — the 0.54 is the draw-count feature (more draws → more sets drawn), not set discrimination |
| Fitted model, top-6 singles per session, hits / uniform | 301 / 292.0 | **148 / 145.1** |
| Random top-6 (Monte Carlo 400) | 289.5 ± 13.8 | 146.7 ± 9.6 |
| Fit ON the test window, scored on test (in-sample ceiling) | — | AUC 0.549 |

Single-feature within-session AUC, train / test: rate60 0.496/0.487 · rate120 0.495/0.483 · rate180 0.496/0.490 · rate_all 0.495/0.489 · gap 0.496/0.497 · prev1 0.499/0.500 · prev3 0.504/0.505 · pair120 0.503/0.493 · dig60 0.500/0.504 · pressure 0.496/0.495.

**Ranking rules, top-6 per session (z against the random band):**

| Rule | Train hits/exp (z) | Test hits/exp (z) |
|---|---|---|
| logit fit on train | 301/292 (+0.8) | 148/145 (+0.1) |
| highest 180-session rate (best on train) | **330/292 (+2.9)** | 152/145 (+0.6) |
| highest all-time rate | 321/292 (+2.3) | 140/145 (−0.7) |
| highest 60-session rate | 304/292 (+1.1) | 129/145 (−1.8) |
| least overdue (best on test) | 291/292 (+0.1) | **165/145 (+1.9)** |
| lowest all-time rate | 283/292 (−0.5) | 165/145 (+1.9) |
| most overdue | 301/292 (+0.8) | 148/145 (+0.1) |
| pressure (gap × rate) | 287/292 (−0.2) | 147/145 (0.0) |
| pair strength 120 | 305/292 (+1.1) | 142/145 (−0.5) |
| digit strength 60 | 303/292 (+1.0) | 137/145 (−1.0) |
| drawn last session | 272/292 (−1.3) | 146/145 (−0.1) |

**Rolling** (fit on all months before M, score M): logit top-6 Jun 67/71.1 · Jul 64/74.5 · Aug 74/73.7 · Sep 63/71.4 · Oct 87/73.7; within-month AUC 0.492–0.504.

**State level** (set drawn in jurisdiction j this session; national features + state count 60 / all + state gap; 1.01M train rows, 505k test): AUC 0.511 train, **0.509 test**; best set per state draw hit 27 of 4,209 test draws = 0.64% vs 0.60% uniform (random control 0.52%).

**Leak demonstration:** ranking by the whole-period count (which includes the target sessions) gives top-6 lift ×1.22 train / ×1.10 test — that is what "fitting the record" looks like when the future is allowed in; ranking by the count before 5/01 only gives ×1.03 / ×0.87.

## B. Engine replay grid — 18 configs, 5/01 → 10/31 (184 days × 3 scopes = 552 slates each)

Base = live parity `pair_dedupe`. Variants: equal weights; each signal alone (BOX / PBURST / CO / DGC); each signal heavy; **anti_eq** (all weights −0.25 = pick the engine's lowest-scored sets); pressure inverted / zero / only; singles-only and 3-doubles rails; cooldown off (block 1 day, staleness off) and cooldown 40. Scored against the **rail-matched** baseline (random picker with the same singles/doubles mix — the uniform 000–999 baseline reads ×1.18 for any singles-only slate purely because singles results are 72% of draws; live snapshots over the same Sep–Oct window: ×1.13 uniform, **×0.99 rail-matched**).

| Config | Train pick hits / exp (lift) | Train slate % / exp | **Test pick hits / exp (lift)** | Test slate % / exp | Test lift mid / eve / allday |
|---|---|---|---|---|---|
| parity (live) | 583 / 553.2 (1.054) | 79.9 / 79.3 | **285 / 277.3 (1.028)** | 79.2 / 79.7 | 1.02 / 1.00 / 1.05 |
| singles_only | 583 / 553.2 (1.054) | 79.9 / 79.3 | 285 / 277.3 (1.028) | 79.2 / 79.7 | 1.02 / 1.00 / 1.05 |
| cooldown_off | **588 / 553.2 (1.063)** | 79.7 / 79.3 | 278 / 277.3 (1.002) | 84.7 / 79.7 | 0.96 / 1.08 / 0.97 |
| cooldown_wide | 586 / 553.2 (1.059) | 80.2 / 79.3 | 287 / 277.3 (1.035) | 79.8 / 79.7 | 1.05 / 1.00 / 1.05 |
| press_invert | 584 / 553.2 (1.056) | 80.5 / 79.3 | 279 / 277.3 (1.006) | 80.9 / 79.7 | 1.02 / 1.00 / 1.00 |
| doubles3 | 583 / 553.2 (1.054) | 79.9 / 79.3 | 286 / 277.3 (1.031) | 79.8 / 79.7 | 1.04 / 1.00 / 1.05 |
| press_zero | 580 / 553.0 (1.049) | 78.9 / 79.2 | 285 / 277.3 (1.028) | 83.6 / 79.7 | 1.04 / 1.01 / 1.03 |
| co_heavy | 579 / 552.9 (1.047) | 82.7 / 79.2 | 288 / 277.3 (1.039) | 81.4 / 79.7 | 1.05 / 1.03 / 1.03 |
| box_heavy | 575 / 552.0 (1.042) | 79.7 / 79.2 | 289 / 277.1 (1.043) | 83.6 / 79.6 | 1.04 / 1.10 / 1.01 |
| box_only | 567 / 551.1 (1.029) | 78.9 / 79.1 | 285 / 276.9 (1.029) | 80.9 / 79.6 | 1.00 / 1.06 / 1.03 |
| co_only | 527 / 514.6 (1.024) | 78.0 / 78.0 | 254 / 257.3 (0.987) | 79.2 / 78.4 | 0.92 / 1.04 / 0.99 |
| pburst_heavy | 561 / 553.2 (1.014) | 79.1 / 79.3 | 274 / 277.3 (0.988) | 79.8 / 79.7 | 1.05 / 0.96 / 0.97 |
| press_only | 471 / 482.9 (0.975) | 74.0 / 75.3 | 228 / 242.1 (0.942) | 72.1 / 75.9 | 0.88 / 0.92 / 0.99 |
| pburst_only | 489 / 502.6 (0.973) | 75.9 / 75.6 | 233 / 251.1 (0.928) | 72.1 / 75.7 | 1.07 / 0.86 / 0.91 |
| eq | 521 / 553.0 (0.942) | 77.5 / 79.2 | 278 / 277.3 (1.002) | 81.4 / 79.7 | 1.09 / 0.98 / 0.97 |
| dgc_heavy | 491 / 540.9 (0.908) | 77.5 / 78.1 | 283 / 277.1 (1.021) | 79.2 / 79.6 | 1.09 / 1.00 / 1.00 |
| anti_eq | 359 / 397.8 (0.902) | 64.0 / 67.1 | 186 / 179.6 (1.036) | 66.1 / 63.2 | 0.94 / 1.01 / 1.09 |
| dgc_only | **468 / 519.9 (0.900)** | 75.1 / 76.6 | **290 / 275.4 (1.053)** | 84.7 / 79.4 | 1.07 / 1.05 / 1.04 |

- Every config sits between 0.90 and 1.06 on both windows; the whole spread is inside the noise of ~550 / ~280 expected pick hits (1σ ≈ ±3.7% / ±5.3%).
- **Best on train (cooldown_off, 1.063) scored 1.002 on test. Best on test (dgc_only, 1.053) was LAST on train (0.900).** anti_eq — deliberately picking the engine's worst-scored sets — went 0.902 → 1.036.
- Rank correlation of configs train → test: **Spearman +0.05** (all 18), +0.20 without anti_eq.
- Caveat on the train window only: `datasets_box.times_drawn` is frozen from the June CSV import (created 6/03, last_seen through 6/23; pairs 6/24 — DATA-07), so replay dates 5/01–6/23 carry a mild forward leak in the frequency inputs; the **test window is leak-free**. ds_raw / DGC inputs are as-of via `dsOverride`.
- Lift-basis lesson for every future table: quote the **rail-matched** lift. The uniform baseline's ×1.13–1.18 on singles-only slates is a class-mix artifact, not signal (live Sep–Oct: ×1.13 uniform vs ×0.99 rail-matched).

## Verdict

Fitting six months of results — directly (A) or through the engine's own knobs (B) — produces nothing that survives the next two months. Held-out within-session AUC 0.503; held-out top-6 at the random band; config rank order does not carry (Spearman +0.05); the best training rule in each half was flat or negative out of sample. Nothing proposed, engine untouched. Related: SIGNAL-INFO-01, ENG-REVIEW-01 (AUC 0.500), COHORT-02, ENG-REVIEW-05, STAT-01.

## Reproduce

```bash
npx tsx scripts/research/holdout_2026_11_01/export_hist.ts <out>/hist.csv       # histories 3/01–10/31 via .env.backtest
python3 -I scripts/research/holdout_2026_11_01/fit.py  <out>/hist.csv            # A: national + state models
python3 -I scripts/research/holdout_2026_11_01/fit2.py <out>/hist.csv scripts/research/holdout_2026_11_01/fit.py   # within-session AUC, rules, rolling
python3 -I scripts/research/holdout_2026_11_01/leak.py <out>/hist.csv scripts/research/holdout_2026_11_01/fit.py   # leak demonstration
npx tsx scripts/research/holdout_2026_11_01/gen_configs.ts <out>                  # grid_1..4.json from CONFIGS.pair_dedupe
npm run backtest:replay -- --days 184 --end-date 2026-10-31 --config-file <out>/grid_N.json   # ×4, ~25 min each in parallel
python3 -I scripts/research/holdout_2026_11_01/score_grid.py <replay CSVs>        # (uniform basis; rail-matched table above used rail_matched_expected_pick_hits)
npm run backtest:report -- --days 62                                               # live snapshots, same window
```
