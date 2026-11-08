# Positional study — all data, 2026-04-01 → 2026-11-07

Operator ask (11/07 ~11:20pm ET): "deep positional study to potentially find patterns in each position (1, 2 & 3) … study all of our data … we are not looking for picks, we are finding if there is anything overall in the positional data."

Data: `histories`, 15,531 draws after excluding DC 4/01–4/21 (known RNG fault, ENG-REVIEW-04). Fit window ≤ 8/31 (10,570), hold-out 9/01–11/07 (4,961). Serial tests use same state + session consecutive draw days with exactly one row each (the two-rows-per-day sort artifact from ENG-REVIEW-04 is excluded by construction). Multiple testing: Benjamini–Hochberg q = 0.10 within each family, plus fit → hold-out replication. Script: `scripts/research/composite_2026_11_03/positional_study.py`.

## A. Digit marginals per position
| cut | pos1 p | pos2 p | pos3 p |
|---|---|---|---|
| all (n 15,531) | 0.239 | 0.176 | 0.047 |
| midday | 0.712 | 0.889 | 0.109 |
| evening | 0.448 | 0.146 | 0.181 |
Max/min digit share per position 0.1057 / 0.0945. Weekday × position (21 tests): min p 0.012, BH survivors 0. State × session × position (207 cells, n ≥ 150): min p 0.0073 (CO evening pos3, digit 0 at 0.142), BH survivors 0. Mean fit → hold-out correlation of per-cell digit deviations +0.016 (a real per-state positional bias would replicate as a positive correlation).

## B. Within-draw cross-position dependence
pos1×pos2 p 0.640, pos1×pos3 0.368, pos2×pos3 0.953 (all draws). P(pos i = pos j) 0.098–0.101 (0.100). P(|diff| = 1) 0.178–0.180 (0.180). Nine session cuts: min p 0.022 (evening pos1×pos3), one of nine.

## C. Within-state serial dependence per position
Lag-1 (n 13,551): repeat 0.0991 / 0.1039 / 0.0990 (z −0.35 / +1.51 / −0.38); transition-matrix p 0.987 / 0.440 / 0.639. Lags 2, 3, 5: all |z| ≤ 1.70, matrix p ≥ 0.033 (12 tests). Per state × session × position lag-1 repeat (201 cells): BH survivors 0; IN evening pos1 9/211 (p 0.0038) fit 0.035 → hold 0.060; fit → hold correlation of per-cell deviations −0.088.

## D. Within-state cross-position lag-1
pos i today = pos j next draw: 0.0996–0.1048 for all six ordered pairs (max z +1.86, pos3 → pos2). P(next draw shares ≥ 1 digit) 0.6115 vs shuffled 0.6092 ± 0.0032.

## E. Nationwide day-to-day positional carryover
Correlation of the 30-vector of positional digit frequencies, day D → next session:
| link | fit | hold-out | random-day null |
|---|---|---|---|
| mid → next mid | +0.000 ± 0.016 | +0.037 ± 0.024 | +0.002 |
| eve → next eve | +0.032 ± 0.015 | +0.018 ± 0.025 | −0.010 |
| eve → next-day mid | +0.030 ± 0.016 | +0.006 ± 0.022 | +0.000 |
| mid → same-day eve | +0.026 ± 0.015 | +0.001 ± 0.021 | −0.006 |
Rule "yesterday's top digit at pos i → today's rate at pos i": pos1 0.0993 → 0.0964, pos2 0.0999 → 0.1078, pos3 0.1033 → 0.1000 (fit → hold; null 0.1000, se 0.0043).

## F. Positional due
Within state + session + position, P(digit appears | draws since it last appeared): gap 0–4 0.1007 / 0.0986, 5–9 0.0984 / 0.0975, 10–19 0.0991 / 0.1052, 20–39 0.1022 / 0.0997, 40–79 0.1005 / 0.1026 (fit / hold; null 0.1000). Longest current absences: MO midday pos2 digit 4 (60), IN evening pos2 digit 6 (59), KS evening pos1 digit 1 (53), CO evening pos1 digit 5 (53).

## G. Positional pair carryover (the straight scorer's pair term)
Positional pair seen in the reference session repeats in the next: eve → next mid 0.3405 vs exp 0.3402 (fit), 0.3465 vs 0.3406 (hold); mid → same-day eve 0.2764 vs 0.2728 (fit), 0.2726 vs 0.2771 (hold).

## H. Ball vs RNG jurisdictions
Ball (FL GA MI NC NJ NY SC TX WV CT, PA eve, IN eve; n 4,928): per-position chi² p 0.711 / 0.318 / 0.595; RNG (n 10,603): 0.309 / 0.411 / 0.091. Same distribution ball vs RNG at each position: p 0.808 / 0.653 / 0.810. Lag-1 same-position repeat: ball 0.0960 / 0.1016 / 0.0918, RNG 0.1003 / 0.1048 / 0.1018. Class mix ball 0.725 / 0.264 / 0.0106, RNG 0.716 / 0.277 / 0.0071 (0.720 / 0.270 / 0.010).

## I. Positional composition
P(odd) 0.504 / 0.507 / 0.496; P(high) 0.505 / 0.502 / 0.499; strictly ascending 0.1198, descending 0.1220 (0.120).

## Result
Across nine families (≈ 480 tests) no positional cell survives BH at q = 0.10, no fit-window deviation replicates in the hold-out (replication correlations +0.016 and −0.088), and every pooled rate sits within two standard errors of uniform. Nationwide positional carryover is +0.03 in the fit window on three of four links and +0.00 to +0.04 in the hold-out, each within two standard errors of its random-day null. The positional data behave as independent uniform digits at every position, in every session, in ball and RNG jurisdictions alike. Consistent with ENG-REVIEW-04 (210 position cells, 10/24) and the 11/07 positional-scorer sweep (0 of 84 configs above null).
