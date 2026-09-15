# ZK6 Engine — Year-One Enhancement Review (2026-09-15)

**Question asked (operator, 2026-09-15 ~4:30pm ET):** "We have been working for over a year — are there any enhancements to be made to the engine to help achieve more matches?"

**Short answer:** No accuracy enhancement exists to make. Three fresh universe-level tests run today on the longest clean data we have all land on the fair-draw null, the same as every test since June. The only levers that change the *number* of matches are structural: how many picks are on the board and how the stake is spread across them. Those change match frequency and win size, not expected return.

## 1. Fresh evidence (run 2026-09-15, read-only)

### 1a. Universe-level stratified AUC, 6/10 → 9/14 (97 days — the longest clean window to date)

Tool: `scripts/intel-tuning/universe-auc-stratified.ts`. Singles stratum = the fair test (120 equiprobable combosets; null = 0.500). |t| ≥ 2.8 ≈ p < .01.

| scope | BOX | PBURST | CO | DGC |
|---|---|---|---|---|
| midday | 0.505 (+0.71) | 0.494 (−0.86) | 0.510 (+1.50) | 0.482 (−2.53) |
| evening | 0.502 (+0.24) | 0.516 (+2.37) | 0.493 (−1.06) | 0.491 (−1.29) |
| allday | 0.501 (+0.21) | 0.507 (+1.14) | 0.503 (+0.65) | 0.486 (−2.70) |

Every signal in every scope sits at chance on singles. The two DGC readings below 0.49 are the known, replicated anti-information (SIGNAL-INFO-01 §2) and remain unexploitable (negating DGC loses in replay). Evening PBURST +2.37 is one of 12 tests at p≈0.02 — within the count expected by chance. Pooled-stratum AUCs of 0.55–0.61 are the multiplicity confound (singles hit 2×/6× more often than doubles/triples per draw), not information.

### 1b. Per-jurisdiction positional-digit uniformity, 4/1 → 9/15 (11,683 draws, 39 jurisdictions)

216 chi-square tests (jurisdiction × session × position, 10 digit bins, df=9). Expected by chance: ~10.8 above the 95% line, ~2.2 above 99%, ~0.2 above 99.9%.

| observed | > 95% (16.92) | > 99% (21.67) | > 99.9% (27.88) |
|---|---|---|---|
| 216 tests, avg n=162 | 13 | 1 | 0 |

Top reading OH evening pos 1 (χ²=24.4, n=160) is a 1-in-300 event across 216 tests — unremarkable. No jurisdiction shows a mechanical bias. This re-confirms ENG-PERSTATE-P0 (8/13, 117 tests) on 27% more data. The "long-horizon per-state mechanical bias" door that SIGNAL-INFO-01 left theoretically open is now closed at n≈160 per cell; a true 5pp digit bias would have shown at ~5σ.

### 1c. Same-day repeat (midday set → same evening), singles, universe level

n = 3,273 midday set-days. A set that drew at midday drew again that evening **21.51%** of the time; the unconditional rate for any singles set that evening was **21.70%**. Flat. Consequence for the operator convention "a midday hit closes the leg": it neither forfeits nor protects anything in expectation — the replacement set is exactly as likely. It only matters when the leg is dropped without a replacement (that is a coverage loss, not a rate loss).

### 1d. Draw-mix sanity

Singles 71.70% / doubles 27.51% / triples 0.79% vs the i.i.d. expectation 72.0 / 27.0 / 1.0. The generating process looks exactly like fair independent draws.

## 2. The verdict ledger (everything already tested — do not re-run)

| Lever | Verdict | Where |
|---|---|---|
| Signal weights, any scope (CO, BOX, PBURST, DGC re-weights; inversion; negation) | universe AUC 0.500; weight configs = noise | SIGNAL-INFO-01 |
| History freshness / window length / depth | refuted | SIGNAL-INFO-02 |
| Overdue / draws-since / reversion | flat, pooled and per-state | COHORT-01 |
| Pressure rescale (amplify or remove) | both lose | ENG-OBS-05 |
| Recent hotness in any form (WARMING, anti-CO, STATE_STR) | anti-predictive at the margin, 3× | STATE-STR |
| Per-state channel (recency, comboset frequency, positional digits) | no estimable substrate; digits uniform | ENG-PERSTATE-P0, §1b above |
| Synergy boost, doublesTopN, doubles floor relaxation | dead | synergy/doubles ledger |
| Cooldown relaxation (midday 10→7/5/3; allday cd30) | loses or noise | ENG-TOP30-01 |
| Post-hit block 3→2 / 3→4 | refuted / noise | ENG-BLOCK-2D-01 |
| Rotation levers (3-day block + stale2) | measured neutral (allday/evening), cost accepted (midday) | ENG-ROT-MID-01 |
| Adaptive weights (ENH-AFL) | no lift | ENH-AFL |
| Slate-position bet band (midday pos 3–5) | inversion gone in rotation era | ENG-MIDDAY-POS-02 |
| Best-order straight selection | ≈ control (21.4%) | BESTORDER-SWEEP |
| Calibrated pick probabilities as a selector | levels right, within-scope ordering noise | CALIB-02 |

Live measurement (BUG-162-safe, strict join) has said the same thing since June: engine pick rate = uniform baseline in every scope (midday ≈17% pick / ≈67% slate, evening ≈22% / ≈77%, allday ≈36% / ≈93%). The last 14 days (9/1–9/14): evening 32% pick / 12 of 14 slates, allday 39% / 14 of 14, midday 13% / 8 of 14 — at or above those lines.

## 3. What actually changes the number of matches

Because every set is equally likely, matches scale with **coverage** — how many distinct sets are on the board — and nothing else. Two places to turn that dial.

### 3a. Product side: pick count K (slate hit rate, uniform math from actual draw counts)

| scope (draws/night) | K=6 | K=8 | K=10 | per-pick rate (unchanged) |
|---|---|---|---|---|
| midday (33) | 69.6% | 79.6% | 86.3% | 18.0% |
| evening (42) | 78.0% | 86.7% | 92.1% | 22.3% |
| allday (75) | 93.4% | 97.3% | 98.9% | 36.3% |

Cost: the Grid view is a screenshot surface pinned at 6 picks on one screen (never a ScrollView), the reels and the SocialBriefCard are built around K6, and the K6 rails (`k6_singles_max`, multiplicity caps, Pass 6 "exactly 6") are hardcoded across 5 mirrors. A K change is a product/design decision with a redesign bill, not an engine tweak.

### 3b. Operator side: spread vs concentrate (same $63 on the 42-draw evening board)

| structure | P(≥1 box match tonight) | expected matches | payout per matching state |
|---|---|---|---|
| 2 sets × 3B (current) | 39.6% | 0.50 | $112.50 |
| 3 sets × 2B | 53.1% | 0.76 | $75.00 |
| 6 sets × 1B (the whole K6 board) | 78.0% | 1.51 | $37.50 |

Expected return is −10% in every row (90% RTP). Spreading triples the match frequency and shrinks each win to a third. The blank-night streak the operator is feeling is the direct consequence of concentration: at 2 sets, a blank night is 60% likely, and 3 blank nights in a row is 22%. At 6 sets it is 22% and 1%. This is the only "more matches" lever that costs nothing to build. It runs against the 1–2 combo style, so it is the operator's call.

## 4. Things that are NOT accuracy but are still worth doing

- **Backtest as-of reconstruction** (SIGNAL-INFO-01 §4, still open): the harness reads current `datasets_*` rather than as-of values, a 1–3% forward-drift leak. Only matters if a future lever needs to be judged at the noise floor; no lever is pending.
- **Per-state product surfaces** (ENG-PERSTATE-P0 re-scope): playability guidance and per-state receipts are UX, already priced as lanes.
- **Per-jurisdiction fixed-vs-pari-mutuel map** (reading-list synthesis): the one real payout lever, and only for pari-mutuel games (CA Daily 3). Payout-given-a-hit, not more hits.

## 5. Ruling requested

None required. Recommended: record this review as the year-one closure of the accuracy question (ENG-REVIEW-01), keep the verdict ledger as the pre-flight checklist for any future proposal, and treat 3a/3b as the only open "more matches" decisions.
