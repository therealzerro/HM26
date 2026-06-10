# Overdue Cohort Log — COHORT-01

Standing falsification track record for the overdue-reversion thesis (operator's
H01Y red/blue logic). Each block below is one run of
`npm run cohort:overdue -- --log`; the evaluation window grows as draws
accumulate, so later runs supersede earlier ones in power.

Decision bar (set 2026-06-10, before any logged run): a cohort only counts as
real if observed > expected with a coherent red > blue > rest gradient AND
|z| > 2.5 sustained across consecutive runs as the window grows. Anything
less is uniformity. Do not move this bar after looking at results.

---

## Overdue cohort run — 2026-06-10

Eval window 2026-04-22 → 2026-06-09 (49 days, 3239 pooled singles draws).
Expected = day-matched uniform chance, P(set hits) = 1 - (119/120)^(singles draws that day).

### Pooled (all jurisdictions — the H01Y screenshot view)

| Cohort | Set-days | Avg days overdue | Hits | Observed | Expected (uniform) | z |
|---|---|---|---|---|---|---|
| red (top 2 overdue) | 98 | 11.5 | 40 | 40.82% | 35.50% | 1.10 |
| blue (rank 3-8) | 294 | 8.1 | 102 | 34.69% | 35.50% | -0.29 |
| next 22 (9-30) | 1078 | 5.0 | 352 | 32.65% | 35.50% | -1.95 |
| rest | 4409 | 1.8 | 1574 | 35.70% | 35.50% | 0.28 |

### Per-jurisdiction (what a single-state ticket experiences)

| Cohort | Set-days | Avg days overdue | Hits | Observed | Expected (uniform) | z |
|---|---|---|---|---|---|---|
| red (state top 2) | 3790 | 35.6 | 61 | 1.61% | 1.13% | 2.83 |
| blue (state 3-8) | 11322 | 31.0 | 121 | 1.07% | 1.13% | -0.60 |
| rest | 58075 | 15.8 | 729 | 1.26% | 1.22% | 0.75 |

### Live red/blue zone (most overdue right now, pooled)

| Set | Last seen | Days since | Draws since |
|---|---|---|---|
| {3,6,8} | 2026-05-25 | 16 | 795 |
| {4,6,8} | 2026-05-26 | 15 | 740 |
| {3,4,6} | 2026-06-01 | 9 | 419 |
| {2,8,9} | 2026-06-03 | 7 | 318 |
| {3,4,8} | 2026-06-03 | 7 | 318 |
| {6,8,9} | 2026-06-03 | 7 | 318 |
| {0,3,6} | 2026-06-04 | 6 | 264 |
| {2,3,7} | 2026-06-04 | 6 | 264 |

Reading: the thesis predicts red/blue observed > expected with a coherent
red > blue > rest gradient that persists as the window grows. Flat or
sign-flipping buckets = uniformity holding. z beyond ±2.5 sustained across
runs is the bar worth acting on (harness noise note: single-window z
excursions die routinely — see MASTER_AUDIT COHORT-01).

---
