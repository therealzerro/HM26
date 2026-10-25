# Brief-tab footprint tiers — universe cohort test (2026-10-25)

**Question (operator, after SYS-INV-01):** the Brief tab's T1 / T3 tiers are the one place a pattern number steers a bet. Do they predict anything?

**Feature, replicated exactly from `lib/brief/computeBrief.ts`:** for brief date D, top-10 jurisdictions = those with ≥20 draws in [D−30, D−1], ranked by 30d box correlation with that date's same-session or allday slate (ties: box count, then code). Footprint(set, D) = number of draws of that comboset in [D−90, D−1] inside those 10 jurisdictions. Tiers: **T1 = footprint ≥10**, **T3 = 6–9**, **T4 = <6** (the Conv/Overdue/strong tag modifiers depend on the slate and are outside a universe test).

**Design:** every day 7/1→10/24 (116 days, so the 90d lookback stays inside the clean era ≥4/1) × 3 scopes × all 220 sets. Outcome = the set was drawn on D in the scope's session(s). Singles stratum is the fair test (multiplicity confound). Hits recomputed from `histories`, never stored flags (BUG-162). Baseline = same scope × multiplicity across all tiers.

## Result — singles (the slate is singles-only in practice)

| scope | tier | n | hits | rate % | base % | z |
|---|---|---|---|---|---|---|
| midday | T1 fp≥10 | 7,370 | 1,280 | 17.37 | 17.46 | −0.20 |
| midday | T3 6–9 | 5,448 | 949 | 17.42 | 17.46 | −0.07 |
| midday | T4 <6 | 1,102 | 201 | 18.24 | 17.46 | +0.68 |
| evening | T1 fp≥10 | 7,370 | 1,598 | 21.68 | 22.13 | −0.93 |
| evening | T3 6–9 | 5,448 | 1,223 | 22.45 | 22.13 | +0.56 |
| evening | T4 <6 | 1,102 | 260 | 23.59 | 22.13 | +1.17 |
| allday | T1 fp≥10 | 7,370 | 2,601 | 35.29 | 35.65 | −0.64 |
| allday | T3 6–9 | 5,448 | 1,946 | 35.72 | 35.65 | +0.11 |
| allday | T4 <6 | 1,102 | 415 | 37.66 | 35.65 | +1.39 |

**Footprint as a ranker (per-day Mann–Whitney AUC, singles, 116 days each):** midday 0.4995 (t −0.07), evening 0.4885 (t −1.76), allday 0.4941 (t −1.10). Null = 0.500.

**Verdict: FLAT, sign slightly inverted.** T1 sits at or below baseline in all three scopes; T4 sits at or above. The ordering the tiers assume (T1 > T3 > T4) does not exist. Consistent with WARMING (reverted, negative), STATE_STR (−8.1pp), ENG-REVIEW-02 cross-state/carryover (flat), COHORT-02 frequency quintiles (sign-incoherent).

## Doubles — one cell flagged, not replicated

Doubles T1 (fp≥10) read above base: midday 12.35 vs 9.41 (z +2.09), allday 23.78 vs 20.31 (+1.79), evening 13.52 vs 11.79 (+1.11). These are not three confirmations — the same 429 set-days (29–32 distinct sets, each persisting ~7 consecutive days, so effective n is far below 429) scored three ways, and one |z|>2 cell among 18 is the expected count at chance. Split-half:

| scope | H1 7/1–8/27 T1 vs rest | H2 8/28–10/24 T1 vs rest |
|---|---|---|
| midday | 13.68 vs 9.44 | 11.06 vs 9.11 |
| evening | 15.09 vs 11.92 | 11.98 vs 11.51 |
| allday | 25.94 vs 20.55 | 21.66 vs 19.77 |

H2 collapses toward base (allday H2 z ≈ +0.7). Hypothesis-grade; dies under the replication rule. The slate carries no doubles anyway (doubles starvation, standing).

## What this means for the Brief tab

The T1/T3 labels are descriptive breadth ("this set has been drawn a lot in the correlated states"), not predictive. No code change made: the brief is an operator-internal surface and its tier labels are not an engine input. If the operator wants the labels gone or renamed, that is a one-line ruling. Nothing to re-test.

## Re-run

The full SQL (three queries: tier table, per-day AUC, split-half) is in the SYS-INV-01 session log; feature construction is the CTE chain `days → sets → slate_sets → draws(boxhit) → jx30 → top10 → fp → uni`. Change the `generate_series` bounds to re-window.
