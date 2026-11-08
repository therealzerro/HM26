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

**Reading:** held out, the pair term is positive on all three universes at top-5 (+0.87 / +1.48 / +0.43) and the anti-pair is negative on all three, but none of the three clears its own shuffle null (34, 80, 22 of 200) and the sign flips at K=2 on every universe. Over the full 186 days the early-13 top-5 is 81 vs 64 expected — about 17 extra matches in 186 days (one per 11 days) — with the whole-ranking percentile still 0.500. Status: the direction survived the held-out window; the size did not clear the noise floor in it. Stays hypothesis-grade; the standing re-test is the next 60 days (11/03 → 1/01) scored before anyone looks at them, with the pass line written now: early-13 top-5 ratio ≥ 1.15 AND anti-pair ≤ 1.00 on that window. **AMENDED 11/07 (operator): pass ALSO requires the all-draws universe (midday + evening, all states) top-5 ratio ≥ 1.15 on the same window, with anti-pair ≤ 1.00 on both universes; early-13 alone no longer passes.** Scoring stays untouched until 1/01 (11/03–11/07 rows were seen only inside 30d aggregate cells on 11/07; no per-day scoring of the window has been run).

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

## 9. "Flat" levers as composite terms — walk-forward (operator ask, 11/03 ~5:10pm ET)

Same harness as §6/§7 (`flat_terms.py`, `combined_terms.py`): each term scores the 220 sets per slate day, class-standardized; top-5 / top-10 hits vs class-correct expectation; anti-5 = bottom five; IS = 7/01→11/02, OOS = 5/01→6/30. Reference block = previous evening + same-day midday (evening) / previous evening + previous midday (midday). Raw tables in the two logs (`flat_terms.log`, `combined_terms.log`, copied below).

### 9a. Single terms (top-5 z, IS / OOS; anti-5 z over both)

| Term | Early-13 eve | All midday | All evening | Read |
|---|---|---|---|---|
| pair (base, §6) | +1.98 / +0.87; anti −1.84 | +1.36 / +0.43 | +1.04 / +1.48 | adopted |
| pair, prev-evening half only | −0.16 / +0.97 | +1.10 / −0.08 | +0.47 / +1.51 | flips |
| pair, same-day-midday half only | +0.97 / +1.39; anti −0.10 | −0.83 / −1.06 | −0.27 / +1.46 | the early-13 signal sits in the same-day midday half |
| pair over last 2d / 3d / 7d | −0.64 / −0.35 · +1.22 / −1.12 · −0.28 / −0.23 | mixed | mixed | longer windows dilute; dead |
| digit carryover | +1.15 / +0.61; anti **+0.98** | −0.05 / +1.38 | +0.37 / +2.32 | both ends over on early-13 |
| exact set repeat | −1.70 / +0.48; pct 0.543 | +0.41 / +0.28 | −2.07 / +0.01 | anti-orders (drawn sets rank LOW) — the post-hit block, confirmed |
| mirror pairs / mirror sets | −0.61 / 0.00 · −1.10 / +0.91 | flat | flat | dead |
| rundown ±1 | +0.54 / +0.13 | −1.95 / −1.13 | −0.34 / −0.81 | dead |
| digit sum / root sum | −0.97 / −0.65 · 0.00 / +0.24 | flips | flips | dead |
| followers (set→next-day sets) | −1.53 / +1.60 | +0.12 / +0.54 | +0.08 / +0.81 | flips |
| overdue (days since drawn) | +0.77 / +0.88; anti **+1.54** | +0.55 / +0.01 | −0.44 / −0.43 | both ends over; dead (COHORT-02 stands) |
| hot 7d / hot 14d | −1.15 / **+3.03** · −2.67 / +1.88 | +0.89 / −0.43 · −0.80 / +0.68 | +0.05 / +1.73 · −1.33 / +1.59 | sign flips between halves (STATE_STR verdict stands) |
| weekday count | +0.45 / +0.98; top-10 −0.35 / +1.65 | −0.17 / +0.04 | +0.43 / +1.67 | weak, top-10 flips |

Only digit carryover and weekday keep the top-5 sign across both windows on early-13; neither keeps it on top-10 with a negative anti-5. Everything else flips, is flat, or scores both ends of the ranking up.

### 9b. Combined scorers (top-5 z IS / OOS; anti-5 IS / OOS)

| Variant | Early-13 eve | All midday | All evening |
|---|---|---|---|
| composite alone | +0.08 / −0.11; anti −0.64 / +0.05 | +0.03 / +0.73 | +1.45 / −0.43 |
| composite + pair (tonight's rule) | +0.48 / +0.04; top-10 +1.60 / +0.16 | −0.65 / −0.14 | +1.80 / +1.45 |
| composite + pair + digit | +1.13 / −0.43; anti **+1.15** / +0.28 | −0.34 / −0.33 | +1.01 / +1.24 |
| composite + pair + weekday | +0.93 / −0.26; top-10 +0.36 / −0.67 | −0.40 / +0.95 | +1.48 / +1.03 |
| composite + pair + digit + weekday | +0.96 / +0.12 | +0.66 / +0.40 | +1.88 / +1.03 |
| composite + digit | −0.41 / −0.55 | +0.19 / +0.25 | +2.34 / +0.62 |
| **pair + digit (no composite)** | **+2.20 / +0.99**; anti −0.06 / −0.55; top-10 +1.21 / +0.72 | +1.99 / −0.52 | +1.70 / +2.23; top-10 +1.58 / +2.20 |
| composite + pair + same-day-midday pair (double weight) | +1.99 / +0.43 | −0.43 / −0.21 | +1.60 / +1.27 |

**Findings.** (1) On the early-13 pool the composite is dead weight: composite alone is 41/40.5 and 22/22.5; adding it to the pair term pulls the pair's +1.98 / +0.87 down to +0.48 / +0.04. (2) No candidate term improves composite + pair on top-5, top-10 and anti together across both windows. (3) The one combination above the pair term alone is **pair + digit, without the composite**: early-13 +2.20 / +0.99 (vs +1.98 / +0.87), all evening +1.70 / +2.23 (vs +1.04 / +1.48), anti negative on both; it flips on midday (+1.99 / −0.52). Digit carryover is the same reference block as the pair term (its 1-digit marginal), so this is a re-weighting of one signal, not a second signal. (4) Exact-set repeat anti-orders on every pool (drawn sets rank at the 0.54 percentile): the engine's post-hit block is measured in the right direction. All of §9 is hypothesis-grade by the §6 rule (selected-pick diffs); nothing here is a ship candidate without the universe/backtest gate.

```
term                 pool          | IS top5 h/e (z)        IS top10 (z)     | OOS top5 (z)         OOS top10 (z)    | anti5 IS+OOS (z)   pct
pair_ref(base)       EARLY-13 eve  |  56/ 43.0 (+1.98)       99/ 86.7 (+1.32) |  25/ 21.0 (+0.87)     51/ 42.7 (+1.27) |  56/ 71.6 (-1.84)     0.499
pair_ref(base)       ALL midday    | 100/ 87.3 (+1.36)      201/180.3 (+1.54) |  44/ 41.2 (+0.43)     74/ 84.5 (-1.14) | 144/145.0 (-0.08)     0.495
pair_ref(base)       ALL evening   | 126/114.9 (+1.04)      244/231.6 (+0.82) |  67/ 56.0 (+1.48)    136/113.7 (+2.09) | 175/190.9 (-1.15)     0.493
pair_prevEve_only    EARLY-13 eve  |  42/ 43.0 (-0.16)       77/ 86.4 (-1.01) |  25/ 20.6 (+0.97)     40/ 42.5 (-0.38) |  70/ 75.3 (-0.62)     0.499
pair_prevEve_only    ALL midday    |  99/ 88.6 (+1.10)      194/177.9 (+1.21) |  41/ 41.5 (-0.08)     76/ 85.6 (-1.04) | 141/154.0 (-1.05)     0.496
pair_prevEve_only    ALL evening   | 120/115.0 (+0.47)      228/230.8 (-0.18) |  66/ 54.8 (+1.51)    110/113.2 (-0.30) | 197/201.1 (-0.29)     0.492
pair_sameMid_only    EARLY-13 eve  |  49/ 42.7 (+0.97)       93/ 85.3 (+0.84) |  27/ 20.7 (+1.39)     52/ 41.2 (+1.68) |  78/ 78.9 (-0.10)     0.494
pair_sameMid_only    ALL midday    |  80/ 87.8 (-0.83)      165/176.0 (-0.83) |  35/ 41.9 (-1.06)     77/ 83.0 (-0.66) | 155/161.9 (-0.54)     0.495
pair_sameMid_only    ALL evening   | 111/113.9 (-0.27)      215/227.8 (-0.85) |  66/ 55.2 (+1.46)    129/109.8 (+1.83) | 207/210.8 (-0.26)     0.497
pair_2d              EARLY-13 eve  |  39/ 43.2 (-0.64)       90/ 86.8 (+0.34) |  20/ 21.6 (-0.35)     44/ 42.7 (+0.19) |  63/ 68.9 (-0.72)     0.499
pair_2d              ALL midday    | 103/ 90.3 (+1.34)      188/179.7 (+0.62) |  45/ 43.2 (+0.28)     81/ 85.9 (-0.53) | 149/141.1 (+0.67)     0.495
pair_2d              ALL evening   | 119/115.4 (+0.34)      248/231.9 (+1.06) |  63/ 57.6 (+0.71)    125/113.9 (+1.04) | 167/184.0 (-1.25)     0.493
pair_3d              EARLY-13 eve  |  51/ 43.0 (+1.22)       97/ 86.6 (+1.12) |  16/ 21.2 (-1.12)     39/ 42.6 (-0.56) |  57/ 67.4 (-1.27)     0.497
pair_3d              ALL midday    |  78/ 89.5 (-1.22)      192/182.2 (+0.72) |  42/ 42.8 (-0.12)     77/ 85.4 (-0.91) | 148/140.4 (+0.64)     0.495
pair_3d              ALL evening   | 118/114.8 (+0.30)      252/231.2 (+1.37) |  61/ 56.4 (+0.61)    118/113.7 (+0.40) | 155/180.0 (-1.87)     0.494
pair_7d              EARLY-13 eve  |  41/ 42.9 (-0.28)       85/ 87.5 (-0.27) |  21/ 22.1 (-0.23)     39/ 43.0 (-0.61) |  56/ 68.3 (-1.48)     0.494
pair_7d              ALL midday    |  83/ 88.4 (-0.57)      167/180.3 (-0.99) |  42/ 44.2 (-0.34)     87/ 88.2 (-0.12) | 134/139.1 (-0.43)     0.494
pair_7d              ALL evening   | 104/114.5 (-0.98)      249/233.8 (+0.99) |  61/ 58.9 (+0.28)    126/114.5 (+1.07) | 163/182.2 (-1.42)     0.493
digit_ref            EARLY-13 eve  |  53/ 45.3 (+1.15)      100/ 87.0 (+1.40) |  25/ 22.2 (+0.61)     52/ 42.8 (+1.40) |  80/ 71.7 (+0.98)     0.490
digit_ref            ALL midday    |  90/ 90.5 (-0.05)      187/178.3 (+0.65) |  54/ 44.8 (+1.38)     96/ 86.1 (+1.06) | 144/146.8 (-0.23)     0.495
digit_ref            ALL evening   | 125/120.9 (+0.37)      236/232.2 (+0.25) |  77/ 59.1 (+2.32)    139/114.3 (+2.31) | 199/191.3 (+0.55)     0.494
set_repeat_ref       EARLY-13 eve  |  33/ 44.3 (-1.70)       80/ 96.0 (-1.63) |  24/ 21.7 (+0.48)     43/ 47.3 (-0.62) |  87/ 85.9 (+0.12)     0.543
set_repeat_ref       ALL midday    |  94/ 90.1 (+0.41)      206/197.8 (+0.58) |  44/ 42.2 (+0.28)     93/ 94.7 (-0.17) | 191/177.3 (+1.03)     0.536
set_repeat_ref       ALL evening   |  96/118.5 (-2.07)      239/256.1 (-1.07) |  58/ 57.9 (+0.01)    125/126.0 (-0.09) | 215/229.2 (-0.94)     0.536
mirror_pair_ref      EARLY-13 eve  |  39/ 43.0 (-0.61)       89/ 86.7 (+0.24) |  21/ 21.0 (+0.00)     39/ 42.7 (-0.56) |  70/ 71.6 (-0.18)     0.508
mirror_pair_ref      ALL midday    |  94/ 87.3 (+0.71)      186/180.3 (+0.42) |  37/ 41.2 (-0.66)     80/ 84.5 (-0.49) | 143/145.0 (-0.17)     0.503
mirror_pair_ref      ALL evening   | 112/114.9 (-0.27)      232/231.6 (+0.03) |  62/ 56.0 (+0.81)    115/113.7 (+0.12) | 183/190.9 (-0.57)     0.501
mirror_set_ref       EARLY-13 eve  |  37/ 44.3 (-1.10)       82/ 96.0 (-1.42) |  26/ 21.7 (+0.91)     53/ 47.3 (+0.83) |  84/ 85.9 (-0.20)     0.531
mirror_set_ref       ALL midday    |  85/ 90.1 (-0.54)      194/197.8 (-0.27) |  51/ 42.2 (+1.35)     89/ 94.7 (-0.58) | 168/177.3 (-0.70)     0.536
mirror_set_ref       ALL evening   | 116/118.5 (-0.23)      257/256.1 (+0.06) |  61/ 57.9 (+0.40)    133/126.0 (+0.63) | 214/229.2 (-1.01)     0.533
rundown±1_ref        EARLY-13 eve  |  48/ 44.4 (+0.54)       97/ 89.2 (+0.83) |  22/ 21.4 (+0.13)     48/ 42.9 (+0.79) |  81/ 84.2 (-0.35)     0.506
rundown±1_ref        ALL midday    |  72/ 90.5 (-1.95)      159/181.9 (-1.70) |  36/ 43.5 (-1.13)     70/ 85.8 (-1.70) | 181/176.8 (+0.32)     0.511
rundown±1_ref        ALL evening   | 115/118.7 (-0.34)      252/238.2 (+0.90) |  51/ 57.1 (-0.81)    112/114.3 (-0.21) | 231/224.7 (+0.42)     0.510
sum_ref              EARLY-13 eve  |  23/ 28.2 (-0.97)       67/ 75.4 (-0.97) |  12/ 14.5 (-0.65)     27/ 37.9 (-1.76) |  71/ 79.6 (-0.97)     0.501
sum_ref              ALL midday    |  55/ 58.1 (-0.41)      142/158.1 (-1.28) |  36/ 28.8 (+1.33)     89/ 73.8 (+1.77) | 176/162.7 (+1.04)     0.494
sum_ref              ALL evening   |  84/ 75.2 (+1.02)      191/201.2 (-0.72) |  41/ 38.6 (+0.38)     89/100.9 (-1.18) | 172/212.5 (-2.78)     0.497
rootsum_ref          EARLY-13 eve  |  46/ 46.0 (+0.00)      103/ 94.8 (+0.84) |  22/ 20.9 (+0.24)     37/ 43.7 (-1.01) |  49/ 55.2 (-0.83)     0.494
rootsum_ref          ALL midday    |  82/ 92.1 (-1.05)      177/193.0 (-1.15) |  47/ 40.3 (+1.05)     99/ 85.6 (+1.45) | 122/112.8 (+0.87)     0.504
rootsum_ref          ALL evening   | 120/122.6 (-0.24)      258/253.0 (+0.31) |  45/ 55.9 (-1.46)     99/116.7 (-1.64) | 121/146.9 (-2.14)     0.497
follower             EARLY-13 eve  |  36/ 46.5 (-1.53)       65/ 90.3 (-2.67) |  30/ 22.4 (+1.60)     57/ 42.9 (+2.15) |  69/ 64.2 (+0.60)     0.502
follower             ALL midday    |  96/ 94.8 (+0.12)      184/184.4 (-0.03) |  48/ 44.4 (+0.54)     84/ 86.9 (-0.31) | 132/131.9 (+0.01)     0.507
follower             ALL evening   | 125/124.1 (+0.08)      244/241.4 (+0.17) |  66/ 59.7 (+0.81)    129/114.4 (+1.37) | 180/171.3 (+0.66)     0.499
overdue_days         EARLY-13 eve  |  48/ 43.0 (+0.77)       94/ 85.3 (+0.94) |  26/ 21.9 (+0.88)     47/ 42.3 (+0.72) |  71/ 59.2 (+1.54)     0.498
overdue_days         ALL midday    |  93/ 87.8 (+0.55)      179/175.1 (+0.29) |  44/ 43.9 (+0.01)     93/ 86.2 (+0.74) |  94/ 85.3 (+0.94)     0.501
overdue_days         ALL evening   | 110/114.7 (-0.44)      227/227.8 (-0.06) |  55/ 58.3 (-0.43)     99/112.8 (-1.30) | 181/158.1 (+1.82)     0.504
hot7                 EARLY-13 eve  |  36/ 43.6 (-1.15)       68/ 84.9 (-1.83) |  34/ 20.3 (+3.03)     54/ 40.9 (+2.06) | 108/ 83.5 (+2.68)     0.497
hot7                 ALL midday    |  98/ 89.6 (+0.89)      187/175.5 (+0.87) |  38/ 40.8 (-0.43)     78/ 82.1 (-0.45) | 171/172.2 (-0.09)     0.504
hot7                 ALL evening   | 117/116.5 (+0.05)      230/226.8 (+0.21) |  67/ 54.3 (+1.73)    121/108.9 (+1.16) | 231/223.0 (+0.53)     0.495
hot14                EARLY-13 eve  |  25/ 42.4 (-2.67)       66/ 85.9 (-2.14) |  28/ 19.7 (+1.88)     54/ 41.1 (+2.01) |  82/ 72.0 (+1.18)     0.498
hot14                ALL midday    |  80/ 87.5 (-0.80)      170/177.3 (-0.55) |  43/ 38.7 (+0.68)     80/ 84.9 (-0.53) | 133/146.0 (-1.07)     0.505
hot14                ALL evening   |  99/113.1 (-1.33)      218/229.4 (-0.75) |  64/ 52.5 (+1.59)    127/109.5 (+1.67) | 182/192.3 (-0.74)     0.491
weekday              EARLY-13 eve  |  50/ 46.9 (+0.45)       83/ 86.3 (-0.35) |  26/ 21.5 (+0.98)     53/ 42.3 (+1.65) |  78/ 79.1 (-0.13)     0.502
weekday              ALL midday    |  92/ 93.7 (-0.17)      194/184.8 (+0.68) |  42/ 41.7 (+0.04)     85/ 86.4 (-0.15) | 165/167.4 (-0.19)     0.505
weekday              ALL evening   | 130/125.2 (+0.43)      229/230.4 (-0.09) |  70/ 57.3 (+1.67)    136/112.8 (+2.18) | 217/211.1 (+0.41)     0.497


== EARLY-13 eve ==
variant                  | IS top5 (z)        IS top10 (z)       IS anti5       | OOS top5 (z)       OOS top10 (z)      OOS anti5     
comp                     |  41/ 40.5 (+0.08)   84/ 86.6 (-0.28)   45/ 49.5 (-0.64) |  22/ 22.5 (-0.11)   49/ 44.2 (+0.73)   26/ 25.8 (+0.05)
comp+pair                |  45/ 41.9 (+0.48)  101/ 86.1 (+1.60)   44/ 47.1 (-0.46) |  22/ 21.8 (+0.04)   45/ 44.0 (+0.16)   23/ 22.6 (+0.09)
comp+pair+digit          |  51/ 43.5 (+1.13)   96/ 88.0 (+0.86)   53/ 45.3 (+1.15) |  20/ 22.0 (-0.43)   48/ 43.5 (+0.68)   23/ 21.7 (+0.28)
comp+pair+wkday          |  48/ 42.0 (+0.93)   91/ 87.7 (+0.36)   40/ 45.7 (-0.84) |  20/ 21.2 (-0.26)   39/ 43.4 (-0.67)   24/ 22.2 (+0.38)
comp+pair+digit+wkday    |  50/ 43.6 (+0.96)   94/ 87.3 (+0.72)   46/ 44.8 (+0.18) |  22/ 21.5 (+0.12)   43/ 43.6 (-0.09)   26/ 21.4 (+0.99)
comp+digit               |  39/ 41.7 (-0.41)   93/ 86.2 (+0.73)   46/ 46.6 (-0.09) |  19/ 21.6 (-0.55)   47/ 43.7 (+0.49)   25/ 21.9 (+0.67)
pair+digit               |  59/ 44.4 (+2.20)  100/ 88.7 (+1.21)   48/ 48.4 (-0.06) |  26/ 21.4 (+0.99)   48/ 43.3 (+0.72)   21/ 23.7 (-0.55)
comp+pair+midpair        |  56/ 43.0 (+1.99)  100/ 87.5 (+1.33)   45/ 45.9 (-0.14) |  24/ 22.0 (+0.43)   48/ 43.3 (+0.71)   22/ 21.4 (+0.12)

== ALL midday ==
variant                  | IS top5 (z)        IS top10 (z)       IS anti5       | OOS top5 (z)       OOS top10 (z)      OOS anti5     
comp                     |  86/ 85.7 (+0.03)  184/177.3 (+0.50)   90/ 94.0 (-0.42) |  45/ 40.4 (+0.73)   77/ 80.4 (-0.38)   52/ 50.3 (+0.24)
comp+pair                |  78/ 83.9 (-0.65)  173/176.3 (-0.25)   80/ 93.5 (-1.40) |  40/ 40.9 (-0.14)   82/ 81.0 (+0.11)   49/ 49.0 (+0.00)
comp+pair+digit          |  83/ 86.1 (-0.34)  180/177.6 (+0.18)   87/ 93.4 (-0.66) |  39/ 41.1 (-0.33)   80/ 82.9 (-0.32)   40/ 49.5 (-1.35)
comp+pair+wkday          |  83/ 86.7 (-0.40)  195/175.7 (+1.46)   93/ 92.6 (+0.04) |  47/ 40.9 (+0.95)   88/ 80.9 (+0.79)   46/ 48.1 (-0.30)
comp+pair+digit+wkday    |  94/ 87.8 (+0.66)  187/175.7 (+0.85)   92/ 91.3 (+0.08) |  44/ 41.4 (+0.40)   93/ 81.8 (+1.24)   45/ 48.1 (-0.45)
comp+digit               |  87/ 85.2 (+0.19)  179/175.0 (+0.30)   82/ 94.0 (-1.24) |  43/ 41.4 (+0.25)   82/ 81.7 (+0.04)   49/ 48.7 (+0.04)
pair+digit               | 111/ 91.9 (+1.99)  210/182.3 (+2.05)   98/100.2 (-0.22) |  40/ 43.5 (-0.52)   81/ 86.4 (-0.58)   40/ 47.5 (-1.09)
comp+pair+midpair        |  82/ 85.9 (-0.43)  161/174.0 (-0.99)   90/ 92.7 (-0.28) |  39/ 40.4 (-0.21)   90/ 82.8 (+0.80)   43/ 47.1 (-0.60)

== ALL evening ==
variant                  | IS top5 (z)        IS top10 (z)       IS anti5       | OOS top5 (z)       OOS top10 (z)      OOS anti5     
comp                     | 124/108.8 (+1.45)  267/226.8 (+2.67)  115/117.3 (-0.21) |  50/ 53.1 (-0.43)  118/112.4 (+0.53)   61/ 57.1 (+0.52)
comp+pair                | 130/111.0 (+1.80)  257/229.4 (+1.82)  114/118.8 (-0.44) |  65/ 54.3 (+1.45)  117/113.6 (+0.31)   50/ 56.1 (-0.82)
comp+pair+digit          | 124/113.2 (+1.01)  257/229.3 (+1.83)  110/116.6 (-0.61) |  65/ 55.7 (+1.24)  124/114.9 (+0.85)   50/ 57.2 (-0.95)
comp+pair+wkday          | 129/113.2 (+1.48)  254/231.0 (+1.51)   96/115.6 (-1.83) |  63/ 55.3 (+1.03)  125/113.5 (+1.08)   55/ 56.2 (-0.16)
comp+pair+digit+wkday    | 134/114.0 (+1.88)  249/231.8 (+1.13)  114/114.8 (-0.07) |  63/ 55.3 (+1.03)  125/114.2 (+1.01)   52/ 56.8 (-0.63)
comp+digit               | 134/109.5 (+2.34)  252/227.2 (+1.64)  116/116.3 (-0.03) |  59/ 54.4 (+0.62)  114/112.3 (+0.16)   52/ 57.2 (-0.68)
pair+digit               | 137/118.5 (+1.70)  261/236.7 (+1.58)  126/129.3 (-0.29) |  74/ 57.1 (+2.23)  139/115.3 (+2.20)   59/ 63.1 (-0.51)
comp+pair+midpair        | 131/114.0 (+1.60)  256/231.6 (+1.60)  110/118.1 (-0.75) |  65/ 55.5 (+1.27)  124/115.7 (+0.77)   52/ 55.6 (-0.49)
```

### 9c. Engine gate for "pair + digit" — REFUTED (harness 30d/60d, MASTER_AUDIT ENG-DIGITREP-01)

Operator asked to carry §9b into the engine. Harness-only digit channel (same reference block, same normalization as PAIRREP) at 0.10 / 0.20 / 0.40 on top of live parity, plus pair 0.40 + digit 0.40: every variant is below the live baseline on pick rate AND slate rate in BOTH windows (60d: baseline 298 pick-hits / 27.6% / 83.3%; digit 0.10 270 / 25.0 / 77.8; 0.20 266 / 24.7 / 76.7; 0.40 252 / 23.3 / 74.4; heavy 248 / 23.0 / 76.7). Midday pays most (60d slate 76.7 → 55–65). The ticket-side lift does not transfer: in the engine the digit term is the 1-digit marginal of the pair block already in the score. Logs: `bt30_digit.log`, `bt60_digit.log`. Ticket-side use of pair + digit (tonight's late-29 re-rank) is unaffected by this verdict.

## 10. Draws-since drill-down (operator ask, 11/03 ~6:05pm ET) — `draws_since_drill.py`

Four lenses, 5/01→11/02, histories ≥4/01, evaluated per slate session with everything before that session consumed. Bucket = expected hits elapsed since the set last drew (gap × class/1000), so classes are comparable. COHORT-02 (10/25) already scanned national draws-since, days absent, frequency, pair recency, per-state gap — lens A reproduces it as a control; B, C and E are new.

| Lens | Early-13 eve | All evening | All midday |
|---|---|---|---|
| A. national any-session draws-since (control) | flat; 0.5–1 bucket 555/506 (+2.16) isolated, no gradient | flat (3–5 bucket −1.57) | flat |
| E. same-session draws-since (gap in this session's draws only) | flat (all six buckets within ±0.9) | flat | flat |
| C. straight-level (ordered 000–999) draws-since | flat | flat (<0.5 +1.89, 0.5–1 −1.67; no gradient) | flat |
| **B. inside pair+digit top-10: recently drawn vs overdue** | **due<1 103/81.9 = 1.26 (+2.34); due2+ 22/27.7 = 0.79** | **due<1 265/218.9 = 1.21 (+3.12); due2+ 67/73.7 = 0.91** | due<1 1.06, due2+ 1.06 (flat) |

**B in three disjoint windows** (top-10, obs/exp; "due<1" = the set drew within the last expected cycle, ≈ under 2.2 days for a single; "due2+" = absent for 2+ expected cycles):

| Window | Early-13 due<1 | Early-13 due2+ | All eve due<1 | All eve due2+ | Midday due<1 / due2+ |
|---|---|---|---|---|---|
| 5/01→6/30 | 30/25.7 = 1.17 | 9/9.7 = 0.93 | 84/68.7 = 1.22 | 28/25.8 = 1.08 | 0.91 / 0.81 |
| 7/01→9/01 | 34/28.8 = 1.18 | 6/8.8 = 0.68 | 90/77.3 = 1.16 | 18/23.3 = 0.77 | 1.06 / 1.20 |
| 9/02→11/02 | 39/27.4 = 1.43 | 7/9.2 = 0.76 | 91/72.9 = 1.25 | 21/24.6 = 0.85 | 1.20 / 1.15 |

**Findings.** (1) Draws-since on its own is flat on every lens, including the two not previously scanned (same-session gap, straight-level gap) — COHORT-02 stands. (2) The positive data is an *interaction*, and it runs the opposite way to a due thesis: among the ten sets the pair + digit scorer ranks highest, the ones that drew within the last expected cycle hit 1.16–1.43× expectation in all three windows on both evening pools, while the ones absent for 2+ cycles hit 0.68–0.93× on early-13 in all three windows (all-evening 0.77–1.08). Midday is incoherent. Over the full window that is 103 vs 81.9 (early-13) and 265 vs 218.9 (all evening). (3) Read: the pair + digit lift concentrates in sets that are both pair-supported by yesterday's block AND recently drawn themselves; the overdue members of the same top-10 carry none of it. Post-hoc split (6 cells × 3 pools), hypothesis-grade; sign-consistent across three windows is the only reason it is written up. Not a reason to re-open due/overdue as a selector; if used, it is a *filter within the top-10* ("drop the overdue members"), not a ranking.

```

[EARLY-13 eve] A. national any-session draws-since, bucket = expected hits elapsed (gap × class/1000) — COHORT-02 control
bucket           hits      exp  obs/exp      z
<0.5              628    641.1     0.98  -0.52
0.5–1             555    506.3     1.10  +2.16
1–2               723    746.5     0.97  -0.86
2–3               436    442.5     0.99  -0.31
3–5               357    370.1     0.96  -0.68
5+                198    190.5     1.04  +0.54

[EARLY-13 eve] E. SAME-SESSION draws-since (gap counted in this session's national draws only)
bucket           hits      exp  obs/exp      z
<0.5             1166   1134.9     1.03  +0.92
0.5–1             675    689.2     0.98  -0.54
1–2               649    668.7     0.97  -0.76
2–3               251    253.8     0.99  -0.18
3–5               133    128.2     1.04  +0.42
5+                 23     22.2     1.04  +0.18

[EARLY-13 eve] C. STRAIGHT (ordered 000–999) national draws-since, bucket = gap/1000; hits = exact-order matches
bucket           hits      exp  obs/exp      z
<0.5              705    695.9     1.01  +0.34
0.5–1             506    528.2     0.96  -0.97
1–2               760    758.2     1.00  +0.07
2–3               438    434.8     1.01  +0.15
3–5               367    350.5     1.05  +0.88
5+                121    129.4     0.93  -0.74

[EARLY-13 eve] B. pair+digit top-K × national draws-since
bucket           hits      exp  obs/exp      z
top10 due<1       103     81.9     1.26  +2.34
top10 due1–2       23     22.3     1.03  +0.15
top10 due2+        22     27.7     0.79  -1.09
top20 due<1       171    149.7     1.14  +1.74
top20 due1–2       67     50.1     1.34  +2.38
top20 due2+        63     64.1     0.98  -0.14

[ALL evening] A. national any-session draws-since, bucket = expected hits elapsed (gap × class/1000) — COHORT-02 control
bucket           hits      exp  obs/exp      z
<0.5             1736   1712.0     1.01  +0.58
0.5–1            1401   1352.0     1.04  +1.33
1–2              1976   1990.9     0.99  -0.33
2–3              1183   1181.5     1.00  +0.04
3–5               939    988.4     0.95  -1.57
5+                498    508.3     0.98  -0.46

[ALL evening] E. SAME-SESSION draws-since (gap counted in this session's national draws only)
bucket           hits      exp  obs/exp      z
<0.5             3095   3030.0     1.02  +1.18
0.5–1            1833   1838.3     1.00  -0.12
1–2              1760   1786.4     0.99  -0.63
2–3               656    676.8     0.97  -0.80
3–5               332    342.3     0.97  -0.56
5+                 57     59.3     0.96  -0.30

[ALL evening] C. STRAIGHT (ordered 000–999) national draws-since, bucket = gap/1000; hits = exact-order matches
bucket           hits      exp  obs/exp      z
<0.5             1939   1857.6     1.04  +1.89
0.5–1            1347   1409.8     0.96  -1.67
1–2              2022   2023.9     1.00  -0.04
2–3              1130   1160.5     0.97  -0.90
3–5               957    935.6     1.02  +0.70
5+                338    345.7     0.98  -0.41

[ALL evening] B. pair+digit top-K × national draws-since
bucket           hits      exp  obs/exp      z
top10 due<1       265    218.9     1.21  +3.12
top10 due1–2       68     59.4     1.14  +1.11
top10 due2+        67     73.7     0.91  -0.78
top20 due<1       450    400.0     1.13  +2.50
top20 due1–2      156    133.9     1.17  +1.91
top20 due2+       162    170.7     0.95  -0.67

[ALL midday] A. national any-session draws-since, bucket = expected hits elapsed (gap × class/1000) — COHORT-02 control
bucket           hits      exp  obs/exp      z
<0.5             1061   1031.8     1.03  +0.91
0.5–1             853    852.5     1.00  +0.02
1–2              1325   1366.4     0.97  -1.12
2–3              1005    990.5     1.01  +0.46
3–5               959    983.5     0.98  -0.78
5+                722    700.4     1.03  +0.82

[ALL midday] E. SAME-SESSION draws-since (gap counted in this session's national draws only)
bucket           hits      exp  obs/exp      z
<0.5             2342   2326.3     1.01  +0.33
0.5–1            1357   1420.2     0.96  -1.68
1–2              1407   1391.1     1.01  +0.43
2–3               534    508.0     1.05  +1.15
3–5               255    254.4     1.00  +0.04
5+                 30     25.0     1.20  +1.00

[ALL midday] C. STRAIGHT (ordered 000–999) national draws-since, bucket = gap/1000; hits = exact-order matches
bucket           hits      exp  obs/exp      z
<0.5             1053   1118.0     0.94  -1.94
0.5–1             931    925.6     1.01  +0.18
1–2              1485   1477.1     1.01  +0.20
2–3               951    974.2     0.98  -0.74
3–5              1006    945.3     1.06  +1.98
5+                499    484.7     1.03  +0.65

[ALL midday] B. pair+digit top-K × national draws-since
bucket           hits      exp  obs/exp      z
top10 due<1       143    135.0     1.06  +0.69
top10 due1–2       55     45.7     1.20  +1.37
top10 due2+        93     88.0     1.06  +0.54
top20 due<1       258    258.6     1.00  -0.04
top20 due1–2      111     99.0     1.12  +1.21
top20 due2+       172    181.3     0.95  -0.69

=== WINDOW 2026-05-01 2026-06-30
[EARLY-13 eve] B. pair+digit top-K × national draws-since
top10 due<1        30     25.7     1.17  +0.84
top10 due1–2        9      7.8     1.15  +0.43
top10 due2+         9      9.7     0.93  -0.23
top20 due<1        53     47.0     1.13  +0.87
top20 due1–2       25     18.0     1.39  +1.64
top20 due2+        27     21.6     1.25  +1.17
[ALL evening] B. pair+digit top-K × national draws-since
top10 due<1        84     68.7     1.22  +1.85
top10 due1–2       27     20.9     1.29  +1.35
top10 due2+        28     25.8     1.08  +0.43
top20 due<1       151    125.5     1.20  +2.28
top20 due1–2       58     48.2     1.20  +1.41
top20 due2+        63     57.4     1.10  +0.74
[ALL midday] B. pair+digit top-K × national draws-since
top10 due<1        39     42.8     0.91  -0.57
top10 due1–2       19     15.3     1.25  +0.96
top10 due2+        23     28.4     0.81  -1.01
top20 due<1        77     84.5     0.91  -0.82
top20 due1–2       35     33.0     1.06  +0.34
top20 due2+        45     55.6     0.81  -1.42
=== WINDOW 2026-07-01 2026-09-01
[EARLY-13 eve] B. pair+digit top-K × national draws-since
top10 due<1        34     28.8     1.18  +0.97
top10 due1–2        4      7.1     0.56  -1.17
top10 due2+         6      8.8     0.68  -0.94
top20 due<1        49     52.7     0.93  -0.51
top20 due1–2       19     16.7     1.14  +0.57
top20 due2+        17     20.7     0.82  -0.81
[ALL evening] B. pair+digit top-K × national draws-since
top10 due<1        90     77.3     1.16  +1.44
top10 due1–2       17     19.0     0.90  -0.45
top10 due2+        18     23.3     0.77  -1.10
top20 due<1       141    141.3     1.00  -0.03
top20 due1–2       46     44.6     1.03  +0.20
top20 due2+        50     55.0     0.91  -0.68
[ALL midday] B. pair+digit top-K × national draws-since
top10 due<1        50     47.2     1.06  +0.41
top10 due1–2       21     15.4     1.36  +1.43
top10 due2+        36     29.9     1.20  +1.11
top20 due<1        90     89.0     1.01  +0.11
top20 due1–2       43     32.8     1.31  +1.79
top20 due2+        70     63.3     1.11  +0.84
=== WINDOW 2026-09-02 2026-11-02
[EARLY-13 eve] B. pair+digit top-K × national draws-since
top10 due<1        39     27.4     1.43  +2.23
top10 due1–2       10      7.4     1.36  +0.97
top10 due2+         7      9.2     0.76  -0.74
top20 due<1        69     50.0     1.38  +2.69
top20 due1–2       23     15.4     1.49  +1.93
top20 due2+        19     21.9     0.87  -0.61
[ALL evening] B. pair+digit top-K × national draws-since
top10 due<1        91     72.9     1.25  +2.12
top10 due1–2       24     19.6     1.22  +0.99
top10 due2+        21     24.6     0.85  -0.72
top20 due<1       158    133.2     1.19  +2.15
top20 due1–2       52     41.0     1.27  +1.71
top20 due2+        49     58.3     0.84  -1.22
[ALL midday] B. pair+digit top-K × national draws-since
top10 due<1        54     45.1     1.20  +1.33
top10 due1–2       15     15.1     0.99  -0.02
top10 due2+        34     29.7     1.15  +0.80
top20 due<1        91     85.1     1.07  +0.64
top20 due1–2       33     33.2     0.99  -0.03
top20 due2+        57     62.4     0.91  -0.69
```

### §7b — Pass line scored on all data held (operator 11/07 ~10:50pm ET: "why are we waiting until 1/01, use the data we have with backtest")

`pair_study.py hist.json <start> <end> 5`, scorer = pair term (prev evening + same-day midday), top-5 of 220 sets; all-draws = ALL evening + ALL midday hits and expectations summed. Pass line (amended 11/07): early-13 ≥ 1.15 AND all-draws ≥ 1.15 AND anti-pair ≤ 1.00 on both.

| window | early-13 hits / exp (ratio) | all-draws hits / exp (ratio) | anti early-13 | anti all-draws | pass? |
|---|---|---|---|---|---|
| full 5/01→11/07 | 83 / 65.3 (1.27, +2.19) | 342 / 306.0 (1.12, +2.06) | 0.86 | 0.94 | NO (all-draws < 1.15) |
| May–Jun (held out in §7) | 25 / 21.0 (1.19) | 111 / 97.2 (1.14) | 0.59 | 0.96 | NO (all-draws 1.14) |
| Jul–Aug (term chosen here) | 29 / 21.5 (1.35) | 115 / 100.8 (1.14) | 1.26 | 1.01 | NO (anti > 1, all-draws 1.14) |
| Sep–Nov 7 | 29 / 22.9 (1.27) | 116 / 108.0 (1.07) | 0.74 | 0.86 | NO (all-draws 1.07) |
| 11/03→11/07 (re-test so far) | 2 / 1.3 | 5 / 6.6 (0.76) | 0.00 | 0.60 | too small |

Early-13 clears 1.15 on every window (1.19–1.35); all-draws clears on none (1.07–1.14); rank percentile of the drawn set 0.500–0.506 everywhere. Under the amended line the pair term FAILS on every window held. The 11/03→1/01 window still runs for the record; the verdict on existing data is recorded here.

