# Multi-draw days — same set drawn more than once in one day (all draws), 2026-04-01 → 2026-11-07

Operator ask (11/07 ~11:50pm ET): "is there any correlation in our past data that can point to patterns when combos were drawn more than once in the allday drawings? search deep for any anomalies."

Data: 15,531 draws over 220 days (DC 4/01–4/21 fault window excluded), mean 70.6 draws/day. Expectation = uniform simulation with each day's own draw count (400 simulated days per real day) unless stated. Fit ≤ 8/31, hold-out 9/01→11/07. Script: `scripts/research/composite_2026_11_03/multidraw_study.py`.

## 1. How often a set draws k times in one day
| k | observed | simulated | ratio |
|---|---|---|---|
| 2 | 1,963 | 1,941 | 1.011 |
| 3 | 246 | 252 | 0.975 |
| 4 | 16 | 25.6 | 0.62 |
| 5 | 2 | 2.1 | 0.95 |
Days by number of multi-drawn sets match the simulation across the whole distribution (mode 10 sets/day; 0-days obs 7 sim 7.0; 15+ days obs 10 sim 10.0). Exact same straight twice in one day: 510 observed vs 533.5 simulated (0.956).

## 2. Class of multi-drawn sets
Singles 1,834 (0.824) vs 0.840 expected; doubles 388 (0.174) vs 0.158; triples 5 vs 4.3. Doubles +37 over 2,227 events (z ≈ +2.0 on one of three cells).

## 3. Session mix of the repeats
mid–mid 515 (0.183) vs 0.182; mid–eve 1,383 (0.491) vs 0.511; eve–eve 919 (0.326) vs 0.307.

## 4. Weekday
Mon −0.06, Tue −0.53, Wed +0.30, Thu −0.25, Fri 0.00, Sat −0.10, Sun +1.06 (z vs per-day simulation). Fit 1,507 / 1,510; hold-out 720 / 711.

## 5. Carryover after a multi-draw day
Set drawn ≥2× on day D, drawn again on: D+1 fit 597 / 599.4, hold 292 / 287.3; D+2 608 / 600.3, hold 238 / 284.0 (−2.73); D+3 629 / 600.6, hold 267 / 279.4; D+4..7 2,413 / 2,409, hold 1,050 / 1,078; D+1..3 fit +0.80, hold −1.84. Midday set → same-day evening 1,282 / 1,313.5 (−0.87). Lead-in (set also drawn on D−1): 895 / 887.4 (+0.25).

## 6. Sets drawn 3+ times in one day
264 events; 16 at ×4, 2 at ×5 (simulation 25.6 and 2.1). Full list in the script output. The ×3 days are spread across all weekdays and sessions; 11/02 had five ×3 sets ({3,4,9} {3,6,9} {2,4,6} {1,5,8} {1,2,7}), 10/26 four.

## 7. State pairs sharing a set on the same day
741 pairs; observed 2,779 vs 2,833 expected (z −1.02); BH q = 0.10 survivors 0. Top cell ID×TN 16 vs 5.9 (p 0.0004 before correction; 13 of the 16 fall in Apr–Aug, 3 in Sep–Nov vs 1.8 expected there). Next: MN×W.Canada 5 / 1.1, CO×WA 7 / 2.2, NE×NY 7 / 2.2, MI×WA 7 / 2.2.

## 8. Which sets repeat most
{4,6,9} {1,2,3} {1,5,9} 23 multi-days each; {0,6,7} 22; {1,5,8} {1,2,7} {2,4,8} {1,3,5} 21. Correlation of a set's multi-day count with its total draw count across sets +0.92 — multi-draw days are where the frequent sets' draws happen to fall, not a separate property.

## Result
The number of same-day repeats, their multiplicity, their class and session mix, their weekday spread, and the exact-order repeats all match a uniform simulation with the real draw counts. A set that drew two or more times on one day is drawn at its base rate on the following days (D+1 to D+7, both windows). No state pair survives correction. There is no anomaly in the multi-draw structure to use. Consistent with ENG-REVIEW-02 (cross-state and carryover flat), ENG-REVIEW-04 (ledger fair) and the 10/20 same-order-on-two-boards test.
