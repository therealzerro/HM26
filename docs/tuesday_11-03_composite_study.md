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

## 6. Pair term added (operator: "add the pair term and run the walk-forward", ~4:30pm ET)

**Term:** for each set, pair support = how many of its three digit pairs appear among the pairs of a reference block of draws (every draw contributes its three unordered pairs); z(pair) = (support − class mean) / class sd across the 220 sets for that day. Three references, all nationwide: the previous evening (41–42 draws); the previous evening + the same day's midday (for a midday target: the previous day's two sessions); the last 3 days both sessions. Scorers: the pair term alone, composite + z(pair), composite + 2·z(pair), anti-pair. Scripts `pair_study.py <start> <end> <K>`, `pair_perm.py <n>`.

| Top-5, 7/01 → 11/02 | Early-13 hits / exp (z) | All evening (z) | All midday (z) |
|---|---|---|---|
| composite (reference) | 41 / 40.5 (+0.08) | 124 / 108.8 (+1.45) | 86 / 85.7 (+0.03) |
| pair, prev evening only | 42 / 43.0 (−0.16) | 120 / 115.0 (+0.47) | 99 / 88.6 (+1.10) |
| **pair, prev evening + same-day midday** | **56 / 43.0 (+1.98)** | 126 / 114.9 (+1.04) | 100 / 87.3 (+1.36) |
| pair, last 3 days | 45 / 43.5 (+0.23) | 128 / 116.1 (+1.11) | 78 / 89.5 (−1.22) |
| composite + pair (prev eve) | 47 / 41.9 (+0.79) | 132 / 111.2 (+1.97) | 93 / 83.8 (+1.01) |
| composite + pair (prev eve + mid) | 45 / 41.9 (+0.48) | 130 / 111.0 (+1.80) | 78 / 83.9 (−0.65) |
| composite + 2× pair (prev eve + mid) | 57 / 43.4 (+2.06) | 135 / 114.1 (+1.96) | 87 / 85.0 (+0.22) |
| composite + pair (3d) | 32 / 41.6 (−1.49) | 116 / 110.6 (+0.51) | 80 / 83.4 (−0.38) |
| anti-pair (prev eve + mid) | 49 / 48.0 (+0.15) | 119 / 128.1 (−0.80) | 95 / 98.8 (−0.38) |

Split halves, pair (prev eve + mid) alone: early-13 +1.63 / +1.17; all evening +1.66 / −0.19; all midday +0.24 / +1.67. Composite + 2× pair: early-13 +0.37 / +2.57; evening +2.82 / −0.00; midday +0.48 / −0.17. Anti-pair on early-13 Jul–Aug: +1.29 (both the pair and its inverse above expectation in the same half).

K sweep, pair (prev eve + mid) alone, early-13: K=2 +1.09 · K=5 +1.98 · K=10 +1.32 · K=20 +1.74; rank percentile of drawn sets 0.498 at every K. Composite + 2× pair, early-13: +0.29 · +2.06 · +1.32 · +0.75.

**Permutation null (200 shuffles, each day's pair reference replaced by a random other date's same block):** early-13 real z +1.98 vs null mean +0.29, sd 0.97, 95th percentile +1.91 → P(null ≥ real) = 9/200. All midday real +1.36 → 23/200. All evening real +1.04 → 36/200. The null mean is above zero (+0.29 on early-13) because a top-5 built from any day's repeated pairs leans to high-frequency sets.

**Reading:** the prev-evening + same-day-midday pair term is the one variant positive in all six half × universe cells but one (evening Sep–Nov −0.19), with the early-13 full-window number at the edge of the shuffle null (9 of 200) after a 9-scorer × 3-reference search. The ranking-wide percentile is 0.498–0.505 everywhere: whatever the top-5 lift is, the ordering below the top-5 carries nothing. Adding it to the composite does not help consistently (composite + pair is below the pair term alone on early-13 and flips sign on midday). Under the ship rule: not sign-consistent across both halves on all three universes, |Δ| ≈ 13 pick-hits over 125 days on the early-13 pool ≈ 1 extra match per 10 days; recorded as hypothesis-grade, not a change to the ticket method. Re-test on request after another 60 days of draws (9/04 → 11/02 is the only window where it is positive on every universe).

## 7. Out-of-sample test of the pair term (operator: "can you do a back test and test this?", ~4:40pm ET)

The pair term was chosen on 7/01 → 11/02. May–June (5/01 → 6/30, 61 days) was not looked at while choosing it, so it is the held-out test. Same scorers, same code (`pair_study.py 2026-05-01 2026-06-30 <K>`, `pair_perm_oos.py`).

| Top-5, 5/01 → 6/30 (held out) | Early-13 hits / exp (z) | All evening (z) | All midday (z) |
|---|---|---|---|
| composite | 22 / 22.5 (−0.11) | 50 / 53.1 (−0.43) | 45 / 40.4 (+0.73) |
| pair, prev eve + same-day midday | 25 / 21.0 (+0.87) | 67 / 56.0 (+1.48) | 44 / 41.2 (+0.43) |
| pair, prev eve only | 25 / 20.6 (+0.97) | 66 / 54.8 (+1.51) | 41 / 41.5 (−0.08) |
| composite + pair (eve + mid) | 22 / 21.8 (+0.04) | 65 / 54.3 (+1.45) | 40 / 40.9 (−0.14) |
| composite + 2× pair | 22 / 21.8 (+0.05) | 57 / 55.3 (+0.23) | 46 / 40.5 (+0.86) |
| anti-pair | 14 / 23.6 (−1.97) | 60 / 62.8 (−0.36) | 45 / 46.2 (−0.18) |

K sweep, pair (eve + mid) alone, held out: early-13 K=2 −0.70 · K=5 +0.87 · K=10 +1.27; all evening −0.71 · +1.48 · +2.09; all midday −0.44 · +0.43 · −1.14. Shuffle null on the held-out window: early-13 P = 34/200, midday 80/200, evening 22/200.

Combined 5/01 → 11/02 (186 days), top-5, pair (eve + mid) alone: early-13 81 / 64.0 (+2.12, ratio 1.27), all evening 193 / 170.9 (+1.69), all midday 144 / 128.5 (+1.36); anti-pair −1.01 / −0.86 / −0.42; rank percentile 0.500 / 0.505 / 0.505. Composite alone over the same 186 days: −0.01 / +0.95 / +0.43.

**Reading:** held out, the pair term is positive on all three universes at top-5 (+0.87 / +1.48 / +0.43) and the anti-pair is negative on all three, but none of the three clears its own shuffle null (34, 80, 22 of 200) and the sign flips at K=2 on every universe. Over the full 186 days the early-13 top-5 is 81 vs 64 expected — about 17 extra matches in 186 days (one per 11 days) — with the whole-ranking percentile still 0.500. Status: the direction survived the held-out window; the size did not clear the noise floor in it. Stays hypothesis-grade; the standing re-test is the next 60 days (11/03 → 1/01) scored before anyone looks at them, with the pass line written now: early-13 top-5 ratio ≥ 1.15 AND anti-pair ≤ 1.00 on that window.

## 8. Which early-13 state follows the pair pattern (operator ask, 11/03 ~4:40pm ET)

Per-state walk-forward of the pair term (reference = previous evening + same-day midday, nationwide; top-5 / top-10 of the 220 sets), scored on each state's own evening draws. Expected = that state's draws × class/1000 summed over the top-K. `pair_by_state.py <start>`.

| State | Draws 5/01→11/02 | Top-5 hits / exp (z) | Top-10 hits / exp (z) | Rank pct of drawn | 60d top-5 / exp (z) | 60d top-10 / exp (z) |
|---|---|---|---|---|---|---|
| MN | 186 | 8 / 4.1 (+1.92) | 12 / 8.3 (+1.28) | 0.481 | 3 / 1.3 (+1.46) | 5 / 2.7 (+1.41) |
| GA (2 rows/day) | 372 | 13 / 8.2 (+1.67) | 21 / 16.6 (+1.08) | 0.487 | 5 / 2.6 (+1.45) | 9 / 5.4 (+1.57) |
| DE | 185 | 7 / 4.1 (+1.44) | 13 / 8.3 (+1.65) | 0.510 | 1 / 1.3 (−0.26) | 2 / 2.6 (−0.39) |
| MI | 190 | 7 / 4.2 (+1.37) | 9 / 8.5 (+0.18) | 0.529 | 2 / 1.3 (+0.59) | 2 / 2.7 (−0.42) |
| ME,NH,VT | 186 | 6 / 4.1 (+0.93) | 8 / 8.3 (−0.10) | 0.490 | 3 / 1.3 (+1.46) | 5 / 2.7 (+1.41) |
| TX (2 rows/day) | 317 | 9 / 7.0 (+0.76) | 16 / 14.2 (+0.47) | 0.503 | 3 / 2.2 (+0.53) | 6 / 4.5 (+0.69) |
| TN | 186 | 5 / 4.1 (+0.44) | 10 / 8.3 (+0.59) | 0.511 | 1 / 1.3 (−0.28) | 3 / 2.7 (+0.19) |
| OH | 186 | 5 / 4.1 (+0.44) | 7 / 8.3 (−0.45) | 0.505 | 3 / 1.3 (+1.46) | 3 / 2.7 (+0.19) |
| WV | 159 | 4 / 3.5 (+0.26) | 7 / 7.1 (−0.05) | 0.479 | 1 / 1.1 (−0.11) | 3 / 2.3 (+0.47) |
| SC | 186 | 4 / 4.1 (−0.05) | 11 / 8.3 (+0.94) | 0.499 | 1 / 1.3 (−0.28) | 3 / 2.7 (+0.19) |
| AR | 186 | 4 / 4.1 (−0.05) | 7 / 8.3 (−0.45) | 0.498 | 2 / 1.3 (+0.59) | 3 / 2.7 (+0.19) |
| PA | 186 | 3 / 4.1 (−0.55) | 12 / 8.3 (+1.28) | 0.505 | 1 / 1.3 (−0.28) | 6 / 2.7 (+2.02) |
| DC (2 rows/day) | 372 | 6 / 8.2 (−0.77) | 17 / 16.6 (+0.10) | 0.505 | 1 / 2.6 (−1.01) | 4 / 5.4 (−0.59) |
| **Pool** | 2,897 | 81 / 64.0 (+2.12) | 150 / 129.4 (+1.81) | 0.500 | 27 / 20.5 (+1.45) | 54 / 41.7 (+1.91) |

MN and GA are the two states above expectation on both windows and both K (MN top-5 8 vs 4.1 full, 3 vs 1.3 in 60d — 394 9/15, 004 10/10, 576 10/26; GA 13 vs 8.2 full, 5 vs 2.6 in 60d — 297 9/24, 763 9/29, 554 10/13, 715 10/18). DE and MI carry the full window but are at or under in the last 60 days. ME,NH,VT and OH are 60d-only. PA is the top-10 leader in 60d (6 vs 2.7) with top-5 under. DC is under on every lens. No state's whole-ranking percentile moves off 0.50 (range 0.479–0.529), so within a state the term orders only the top handful. 13 states × 2 windows × 2 K = 52 cells; the largest z (+2.02 PA 60d top-10) is inside what 52 null cells produce.
