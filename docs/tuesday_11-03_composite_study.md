# Composite-score study — 2026-11-03 (Tuesday)

**Operator ask (~3:55pm ET):** "deep think and deeply study the composite scoring for possible enhancements."

**What the composite is (as used for the 11/03 early-13 ticket):** for a set or exact order, composite = z(all) + z(60d) + z(30d), z = (count − expected) / √expected, expected = draws × class/1000 (single-set box 6, double 3, exact 1), windows = 4/01 → D−1, D−60 → D−1, D−30 → D−1. Equal weights; the 30d count is inside the 60d count, which is inside the all count.

**Test:** walk-forward. For every evening (and midday) from 7/01 to 11/02 (125 days), score all 220 sets with only the rows dated before that day, take the top-5, count how many of that day's draws they matched (pick-hit, any order), and compare with the enumeration expectation for those 5 sets. 15 scorers, three universes. Also the mean rank-percentile of every drawn set under each scorer (0.500 = the ranking carries nothing). Scripts: `scripts/research/composite_2026_11_03/` (`composite_study.py` full pass; `composite_study2.py <start> <end> <K> <scorers>` halves / K sweep; `deep13.py` the ticket scan). No stored hit flags (BUG-162). Draw counts: early-13 pool 1,948; all evening 5,203; all midday 4,011.

## 1. Full window 7/01 → 11/02, top-5

| Scorer | Early-13 hits / exp (z) | All evening hits / exp (z) | All midday hits / exp (z) | Mean pct (eve) |
|---|---|---|---|---|
| composite (as used) | 41 / 40.5 (+0.08) | 124 / 108.8 (+1.45) | 86 / 85.7 (+0.03) | 0.506 |
| z30 only | 33 / 40.2 (−1.13) | 137 / 112.6 (+2.30) | 79 / 80.3 (−0.15) | 0.504 |
| z60 only | 42 / 41.2 (+0.13) | 129 / 107.6 (+2.06) | 77 / 81.9 (−0.55) | 0.503 |
| 30d count (the 11/01 method) | 30 / 31.4 (−0.25) | 113 / 90.8 (+2.34) | 64 / 55.1 (+1.20) | 0.510 |
| 60d count | 34 / 30.9 (+0.55) | 112 / 91.4 (+2.15) | 55 / 55.3 (−0.04) | 0.508 |
| all-window count | 35 / 33.4 (+0.28) | 108 / 92.6 (+1.60) | 57 / 59.0 (−0.26) | 0.512 |
| composite, non-overlapping windows | 36 / 42.2 (−0.95) | 119 / 106.6 (+1.20) | 83 / 85.9 (−0.31) | 0.506 |
| composite, singles only | 56 / 58.4 (−0.32) | 187 / 156.1 (+2.47) | 122 / 120.3 (+0.15) | — |
| composite, 3-day block applied | 50 / 38.5 (+1.85) | 105 / 99.7 (+0.53) | 68 / 77.4 (−1.07) | 0.478 |
| composite, blocked sets only | 40 / 44.0 (−0.60) | 134 / 115.0 (+1.78) | 93 / 91.9 (+0.12) | 0.529 |
| composite, same-day midday closure | 38 / 40.5 (−0.39) | 125 / 108.3 (+1.61) | n/a | 0.498 |
| nationwide 7-day count | 33 / 32.2 (+0.14) | 87 / 86.0 (+0.11) | 61 / 66.3 (−0.65) | 0.509 |
| draws-since (longest absent) | 14 / 13.9 (+0.03) | 46 / 44.7 (+0.20) | 31 / 33.0 (−0.35) | 0.458 |
| anti-composite (bottom-5) | 46 / 49.5 (−0.50) | 114 / 117.3 (−0.30) | 88 / 94.0 (−0.62) | 0.494 |
| exact-order composite, top-5 straights | 13 / 9.7 (+1.04) | 35 / 26.0 (+1.76) | 22 / 20.1 (+0.43) | 0.506 |

The "mean pct" column for singles-only and block variants is distorted by ranking the excluded class at the bottom; read their hits columns only.

## 2. Split halves (all evening and early-13, top-5)

| Scorer | Eve Jul–Aug (z) | Eve Sep–Nov (z) | Early-13 Jul–Aug (z) | Early-13 Sep–Nov (z) |
|---|---|---|---|---|
| composite | 70 / 50.8 (+2.69) | 54 / 58.0 (−0.53) | 19 / 20.7 (−0.37) | 22 / 19.8 (+0.49) |
| 30d count | 71 / 46.0 (+3.69) | 42 / 44.8 (−0.41) | 11 / 15.5 (−1.15) | 19 / 15.9 (+0.79) |
| 60d count | 62 / 42.5 (+3.00) | 50 / 49.0 (+0.15) | 15 / 16.5 (−0.36) | 19 / 14.5 (+1.19) |
| z30 only | 73 / 54.8 (+2.46) | 64 / 57.8 (+0.82) | 16 / 19.5 (−0.79) | 17 / 20.7 (−0.81) |
| all-window count | 63 / 45.6 (+2.57) | 45 / 46.9 (−0.28) | 15 / 18.2 (−0.75) | 20 / 15.2 (+1.23) |
| block applied | 58 / 52.0 (+0.83) | 47 / 47.7 (−0.10) | 23 / 19.0 (+0.91) | 27 / 19.5 (+1.70) |
| blocked only | 75 / 55.4 (+2.63) | 59 / 59.5 (−0.07) | 21 / 22.2 (−0.26) | 19 / 21.7 (−0.59) |
| anti-composite | 65 / 60.0 (+0.64) | 49 / 57.3 (−1.09) | 23 / 24.1 (−0.22) | 23 / 25.4 (−0.48) |

The whole full-window evening lift sits in July–August. Of the 70 July–August composite hits, 20 are {2,4,8}, 12 {3,3,5}, 11 {4,4,7} — three sets that ran above expectation through the summer and stayed in the top-5 for most of it ({4,4,7} occupied a top-5 slot on 91 of 125 days, {3,3,5} 76, {2,4,8} 72; only 36 distinct sets ever reached the top-5). Same-jurisdiction repeats within 3 days: 0 of 70. No duplicate rows (GA/TX/DC two-draw rows and the July NJ/NC/MI Double Draw rows are distinct results). September–November: flat on every scorer, both universes; rank-percentile 0.50 in both halves.

## 3. K sweep (all evening, full window)

| Scorer | K=2 (z) | K=5 (z) | K=10 (z) | K=20 (z) |
|---|---|---|---|---|
| composite | 59 / 46.3 (+1.87) | 124 / 108.8 (+1.45) | 267 / 226.8 (+2.67) | 484 / 462.6 (+1.00) |
| 30d count | 37 / 35.1 (+0.32) | 113 / 90.8 (+2.34) | 208 / 187.6 (+1.49) | 405 / 404.3 (+0.03) |
| z30 only | 61 / 48.1 (+1.87) | 137 / 112.6 (+2.30) | 244 / 222.9 (+1.42) | 464 / 477.3 (−0.61) |
| anti-composite | 40 / 49.9 (−1.40) | 114 / 117.3 (−0.30) | 224 / 227.3 (−0.22) | 455 / 449.8 (+0.25) |

Early-13 pool, same sweep: composite +0.10 / +0.08 / −0.28 / +0.46; anti-composite −0.57 / −0.50 / +0.51 / +1.25.

## 4. Structural notes on the score (measured, not opinions)

- **Nested windows:** the 30d count is counted three times, the 60d twice. The non-overlapping variant scored lower, not higher (eve +1.20 vs +1.45; early-13 −0.95 vs +0.08). Nothing to gain by fixing the nesting.
- **Doubles:** with expected counts of 1.4 (30d) and 2.8 (60d), two or three draws give a double a z of +2 to +3, so doubles fill 60% of the composite top-5 slots (61% in the early-13 pool). Singles-only composite: eve +2.47 full window, −0.32 early-13, +0.15 midday — the evening number is again July–August ({2,4,8}, {1,2,7}).
- **Stickiness:** 36 distinct sets in 125 days of top-5 (composite) vs 69 for the 30d-only scorer. The composite is mostly an all-window ranking with a recent-count tie-break.
- **3-day block:** applying the block helped in the early-13 pool (+1.85) and hurt in the full evening (+0.53 vs +1.45) and midday (−1.07); blocked-only sets did the opposite. Sign flips across universes = noise, consistent with the 2-day/3-day post-hit tests already on file.
- **Draws-since ("due"):** flat everywhere (+0.03 / +0.20 / −0.35), consistent with COHORT-02.
- **Nationwide 7-day count:** flat (+0.14 / +0.11 / −0.65).
- **Exact-order composite:** 13 / 9.7 early-13 (+1.04), 35 / 26.0 evening (+1.76), 22 / 20.1 midday (+0.43). Not sign-consistent across the halves at the per-universe level (the evening lift is the same summer sets).

## 5. Result

For the early-13 pool the composite's top-5 matched 41 draws against 40.5 expected over 125 days (ratio 1.01), top-2 16 / 15.6, and the ranking's percentile of drawn sets is 0.505. No variant tested beats expectation sign-consistently across the two halves and the three universes. The one cluster of z > 2 (all-evening recency scorers, full window) is a July–August run of three sets and is absent from September–November. Per the ship rule nothing here is an eligible change to how the ticket is chosen; the composite remains a tie-break that chooses WHICH sets to list. Prior verdicts this agrees with: ENG-REVIEW-01 (AUC 0.500), STATE_STR (recent hotness), COHORT-02 (no due threshold), post-hit block 2-day/3-day, ENG-REVIEW-06 hold-out (nothing carries May–Aug → Sep–Oct).
