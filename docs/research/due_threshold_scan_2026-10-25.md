# COHORT-02 — "Is any box combo ever DUE?" Full threshold scan of the 220-set universe (2026-10-25)

**Operator question (10/25, ~5:30am ET):** "since there is no hope for any straight matches lets focus on the 220 box universe … pair data, time drawn, times since drawn, and all other history data all cannot exist a certain thresholds telling us that a box combo is due?"

**Scope.** `histories` 2026-04-01 → 2026-10-24 (full-coverage era; April = warm-up), 14,5xx national draws, 220 box sets split by class (120 singles / 90 doubles / 10 triples — classes are scored separately because their base rates differ 6:3:1 and mixing them makes "cold" sets look anti-predictive for free). Outcome everywhere = the set is drawn on day D in ANY session anywhere (the operator's full-board ticket). Every bucket is compared with its own class base rate; z = (rate − base) / binomial SE.

## 1. Draws-since (national), scaled by the class's expected gap (1,000/perms draws) — 5/1→10/24, 39,000 set-days
| class | gap vs expected | n | rate | base | z |
|---|---|---|---|---|---|
| singles | <0.5× | 8,337 | 35.90% | 35.56% | +0.64 |
| singles | 0.5–1× | 5,028 | 36.42% | | +1.26 |
| singles | 1–1.5× | 2,993 | 33.65% | | −2.19 |
| singles | 1.5–2× | 1,907 | 35.24% | | −0.30 |
| singles | 2–3× | 1,869 | 34.24% | | −1.19 |
| singles | 3–4× | 716 | 36.73% | | +0.65 |
| singles | **≥4×** (≈9+ days absent) | 390 | 37.95% | | +0.98 |
| doubles | <0.5× … ≥4× | 6,363 … 273 | 18.70–22.71% | 20.14% | all within ±1.06 |
| triples | <0.5× … ≥4× | 592 … 83 | 4.57–6.25% | 5.82% | all within ±0.75 |

21 buckets, one |z|>2 and it points the WRONG way (1–1.5× singles hit less). No gradient in any class.

## 2. Cumulative days-absent ladder (national) — "absent ≥ T days"
| class | ≥3d | ≥5d | ≥7d | ≥10d | ≥14d | ≥21d | ≥30d |
|---|---|---|---|---|---|---|---|
| singles rate (base 35.56%) | 34.75 | 34.60 | 35.69 | 37.97 (n 403) | 25.97 (n 77) | 7.69 (n 13) | 25.00 (n 4) |
| doubles rate (base 20.14%) | 20.02 | 20.16 | 20.11 | 20.23 | 19.68 | 23.86 (n 176) | 26.67 (n 15) |
| triples rate (base 5.82%) | 5.73 | 5.96 | 5.59 | 5.60 | 5.54 | 5.20 | 5.17 (≥45d: 6.38) |

No threshold at which the rate lifts and stays lifted. The longest-absent singles (≥14 d) hit LESS, not more (small n, still noise).

## 3. Trailing frequency ("times drawn", 30d and 90d) — quintiles within class and day, 7/1→10/24
Singles cnt30 quintiles 1→5: 36.49 / 37.57 / 35.42 / 34.52 / 34.23 % (base 35.65; z +0.9, +2.1, −0.3, −1.2, −1.6). Singles cnt90: 37.46 / 34.95 / 36.35 / 33.51 / 35.96 (z +2.0, −0.8, +0.8, −2.35, +0.3). Doubles all five quintiles within ±0.8z both windows; triples within ±1.7z. Sign-incoherent (q1 up, q2 up, q4 down, q5 flat) = noise, no monotone cold→hot or hot→cold gradient.

## 4. Pair recency (the set's three digit-pairs: days since each pair last drew anywhere; min / max / sum)
At ~75 national draws a day every one of the 55 digit pairs draws essentially every day: singles with max pair gap ≥3 days = 24 set-days out of 21,240; doubles 303 / 15,930. There is no spread to carry information. Where spread exists (sum of three pair gaps 4–6 d): singles 33.36% (z −1.54), doubles 18.57% (z −1.84) — colder pairs, slightly FEWER hits, inside noise. Pair-level "due" cannot exist at the national board level because the pairs never go cold.

## 5. Per-state hazard curve ("the longer a set has been absent from THIS state, the more due it is there") — intervals from every (state×session, set) stream
| gap in that state's draws | singles hazard /1000 (fair 6.0) | doubles (fair 3.0) |
|---|---|---|
| 1–30 | 6.08 (267k exposures) | 3.17 |
| 31–60 | 5.86 | 3.05 |
| 61–100 | 5.84 | 3.08 |
| 101–150 | 5.66 | 2.99 |
| 151–200 | 6.60 | 3.30 |
| 201–300 | 4.85 (9.7k) | 2.29 |
| 301–400 | 6.00 (1.0k) | 2.06 |

The hazard is flat at the fair rate across the whole observable range — a set absent from a state for 300+ of its draws hits that state's next draw at exactly the same 6-in-1,000 as one that drew yesterday. (Triples: 15 events total, uninformative.)

## Verdict
**No threshold exists** in draws-since, days-absent, 30/90-day frequency, pair recency, or per-state absence at which a box set becomes more likely to draw. 60+ buckets scanned across five feature families; the two |z|>2 cells point in opposite directions and are what 60 independent looks produce by chance. This extends COHORT-01 (June, 70 days, top-of-list only) to the full universe, every threshold, and 207 days. Consistent with [[project_overdue_reversion_tested_flat]], [[project_pressure_rescale_candidate]] (falsified), [[project_pair_data_tested_flat]], ENG-REVIEW-01 (AUC 0.500), ENG-REVIEW-04 (ledger fair).

**What this means for the ticket:** the 220 sets are interchangeable on any given day. Coverage (how many sets, 1B each) and stake size are the only levers — exactly what 10/20–10/24 showed in practice.

**Reproduce:** the five SQL blocks are in `scripts/research/due_threshold_scan.sql` (national gap scan; days-absent ladder; frequency quintiles; pair recency; per-state hazard). Run against `histories`; adjust the date window as the ledger grows.
