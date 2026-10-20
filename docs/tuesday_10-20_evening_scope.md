# Tuesday 10/20 evening scope — 3-night review + $60 structure

Built 2026-10-20 ~2:30pm ET, BEFORE the 10/20 midday import (operator reports a straight match on the Midday board so far). **PROPOSED — NOT PLACED.** Internal operator document. Companion to `saturday_10-17_late_scope.md`, `sunday_10-18_early_scope.md`, `sunday_10-18_late_scope.md`.

Tonight: Tuesday = 42 evening draws (10/6 and 10/13 both 42). Full board $10.50/u · early-13 $3.25/u · late-29 $7.25/u. Early cutoff 7:46pm ET, early readout ~8:24pm, late opens AZ 8:45pm.

---

## 1. What the last three nights actually did (reconciled against `histories`, evening rows)

| Night | Instrument | Pick | Placed? | Result |
|---|---|---|---|---|
| 10/17 late-29 | BOX | {2,8,9} | no | **LA 289 10:25pm — would have landed** ($112.50 on $21.75 at 3B) |
| 10/17 late-29 | STRAIGHT | 736 | no | blank |
| 10/18 early-11 | BOX ×3 | {3,6,7} {0,6,7} {2,4,5} | **yes, 3B = $24.75** | **blank −$24.75** (early rows: PA 008 SC 338 ME,NH,VT 279 GA 715/424 TN 961 MI 077 MN 911 DE 884 OH 299 AR 845 DC 059/146) |
| 10/18 early-11 | STRAIGHT | 763 | no | blank |
| 10/18 late-28 | STRAIGHT + BOX | 524 + {3,8,9} | no | blank (IA evening row missing again 10/18) |
| 10/19 (no scope asked) | ride day 2 of the 10/18 legs | {3,8,9} / {3,6,7} / {0,5,7} alt | unknown | **{3,8,9} NJ 398 (late)**; **{3,6,7} GA 673** (GA evening and night share a label — pool unknowable from the row); **{0,5,7} NC 075** (the 10/18 amend alternate); {2,4,5} drew 10/19 MIDDAY → closed by convention; {0,6,7} blank |

Boards vs evening draws: 10/18 Eve 0/6, All-Day 1/6 ({3,5,6} twice — KS 356, AZ 653, both late pool), Mid 1/6 (same set). 10/19 Eve 1/6 ({0,5,8} SC 850), All-Day 2/6 ({0,5,8}, {0,5,7} NC 075).

**What was missed, honestly:** nothing in the *selection* — four of the named sets drew once each across three nights ({2,8,9}, {3,8,9}, {3,6,7}, {0,5,7}), which is the fair-draw rate for ~2 named sets × 3 nights × 16%. What was missed was *capture*: the 10/17 box was not placed, and the 10/18 late ticket was not placed and (as far as the log knows) not ridden into 10/19. The one selection note: on 10/18 I set {3,5,6} aside as "#108 on 90d, thin footprint" — it then drew twice. Low trailing frequency is not grounds for exclusion; the frequency rule measures flat in both directions.

## 2. A different way of computing — two things tested today

**(a) Same posted order on the Evening AND All-Day boards (tonight has three: 604, 824, 694).** Walk-forward 4/18 → 10/19, hits computed from `histories` (never stored flags):

| Group | Picks | Box draws | Straight draws | Draws in window |
|---|---|---|---|---|
| Same-order Eve+AD pairs | 76 | 15 (0.47%/draw) | 3 (3.9% of picks) | 3,161 |
| All evening picks | 961 | 268 (0.67%/draw) | 49 (5.1% of picks) | 39,984 |

Flat to slightly below (z ≈ −0.9 on box). Identical posted order on two boards is not a straight lever. Dead; do not re-propose.

**(b) Ticket structure.** Every instrument at the book returns 90% (single box 6/1000 × $37.50 = $0.225 per $0.25; straight 1/1000 × $225 = $0.225; double box 3/1000 × $75 = $0.225). No selection changes that. What a different computation CAN change is the *shape* of the night — the probability the night ends positive versus the size of the win. For $60 on Tuesday:

| Structure | Stake | P(night positive) | P(blank) | Best case |
|---|---|---|---|---|
| A. Operator style, full board: 1 box 3B + 1 straight 2S | $52.50 | 25.5% | 74.5% | straight $450 (+ box $112.50 if same set) |
| B. 5 boxes × 1B, full board (42 draws) | $52.50 | 35.9% (needs 2 hits) | 28.4% (one hit = −$15) | 3 hits $112.50 |
| C. 8 boxes × 1B, late-29 only | $58.00 | 40.5% (needs 2 hits) | 24.9% (one hit = −$20.50) | 3 hits $112.50 |
| D. 2 boxes × 4B, late-29 | $58.00 | 29.4% | 70.6% | one hit $150, two $300 |
| E. Split: early-13 3 boxes 2B + late-29 1 box 3B + 1 straight 2S | $55.75 | ~31% | ~69% | straight $450 |

Expected loss is ~$6 on every row. C maximises the chance of walking away up; A maximises the size of the win. The 3-night review above is the argument for *capture* (placing and riding), not for a new selector.

## 3. Tonight's boards (slate order) and the 3-day block

Evening **639 / 320 / 604 / 824 / 694 / 634** · All-Day 286 / 604 / 831 / 369 / 824 / 694 · Midday 587 / 682 / 706 / 657 / 581 / 813.

| Set | Boards | 90d all | 90d eve | early-13 90d | late 90d | last | eve orders 90d |
|---|---|---|---|---|---|---|---|
| **{2,4,8}** (824) | **Eve 4 + AD 5, same order** | **59 (#1 everywhere)** | 42 | 14 | 28 | 10/16 | 842:10 284:8 248:7 482:7 **824:6** 428:4 — scattered |
| **{4,6,9}** (694) | **Eve 5 + AD 6, same order** | 46 | 27 | 8 | 19 | 10/16 | 946:9 496:5 469:4 649:4 **694:4** |
| {3,6,9} (639) | Eve 1 + AD 4 (369) | 45 | 26 | 10 | 16 | 10/16 | **639:8** 369:6 396:4 693:4 |
| {0,4,6} (604) | Eve 3 + AD 2, same order | 28 | 14 | 6 | 8 | 10/15 | 046:5 460:3 604:2 |
| {0,2,3} (320) | Eve 2 | 41 | 22 | 5 | 17 | 10/15 | 203:7 320:6 032:5 |
| {3,4,6} (634) | Eve 6 | 41 | 18 | 6 | 12 | 10/16 | 346:5 643:5 |
| {2,6,8} (286) | AD 1 + Mid 2 | 42 | 19 | 7 | 12 | 10/13 | 862:6 286:5 |
| {1,3,8} (831) | AD 3 + Mid 6 | 45 | 21 | 9 | 12 | 10/15 | 831:6 183:5 |

All eight clear of the 3-day block (10/17–10/19, all sessions). **Amend after the 10/20 midday import:** any of these drawing at midday closes that leg by convention (the operator's "straight so far" is on the Midday board: 813 → {1,3,8} closes; 682 → {2,6,8} closes; 587/706/657/581 touch nothing on the Evening board).

## 4. Picks (operator style first; structure C as the alternative)

**A — operator style, full board (42 draws), $52.50:**
- **BOX {2,4,8}** 3B = $31.50. Same posted order on Eve 4 and AD 5; the #1 set on every frequency table (tie-break only, rule is flat); six evening orders scattered → box. Rate 22.3%.
- **STRAIGHT 824** 2S = $21.00. The posted order on both boards. Order edge is zero (16.6% vs 16.7%); 842 is the most-drawn order (10 of 42) if frequency is preferred — same chance. An 824 exact pays $450 + the box $112.50. Rate 4.1%.
- Remaining $7.50: nothing, or 1B early-13 on {4,6,9} ($3.25) + {3,6,9} ($3.25).

**C — coverage, late-29 only, $58.00:** 1B each on {2,4,8} {4,6,9} {3,6,9} {0,4,6} {0,2,3} {3,4,6} {2,6,8} {1,3,8}. Needs two of the eight to land to finish up (40.5%); one hit loses $20.50; blank 24.9%. Drop whichever set the midday import closes and keep the money.

**Ride ledger if A is placed:** {2,4,8} opens day 1 (10/20); carry unhit to 10/21 and 10/22; a hit closes it. The three-night review says this is where the money was left.

## 5. Data notes
- IA evening row missing again 10/18 (41-row night); 10/19 has IA (528). Fill 10/15–10/18 on a future import.
- GA/DC/TX evening vs night rows share a label and a `created_at`; pool membership of GA 673 on 10/19 cannot be recovered from the stored row.
- Reconcile after the 10/21 import. Only mark PLACED on the operator's word.

---

## 6. Free-rein plan (operator: "do your own thinking, create your own style") — TWO-STAGE CLOCK, $55.75 max

Principle: the draws are fair (every pool, every selector, every carry measured at the null), so the expected loss is 10% of whatever is staked and no pick changes it. The one thing in this game that is NOT fair-draw is the clock: the early-13 pays out at ~8:24pm and the late-29 cannot be bet until 8:45. That gap turns one $60 bet into a sequential decision. Stage 1 is sized so that a single hit locks a positive night; stage 2 is sized by what stage 1 did.

**Stage 1 — early-13 (cutoff 7:46pm), $19.50:** box the whole Evening board at 1 unit each ($3.25/u): {3,6,9} {0,2,3} {0,4,6} {2,4,8} {4,6,9} {3,4,6}. 13 draws × 6 sets: P(≥1 hit) **37.4%**, P(≥2) 7.9%. One hit = +$37.50 → stage 1 nets **+$18.00**.

**Stage 2, decided 8:24–8:45pm:**

| Stage 1 result | Stage 2 | Night outcomes |
|---|---|---|
| **1 hit** (+$18.00) | PRESS: straight **824** 2S late-29 = $14.50 (house money) | blank → **+$3.50**; exact → **+$453.50** (2.9%) |
| **2+ hits** (+$55.50) | PRESS: 824 2S ($14.50) + {2,4,8} box 2B ($14.50) | blank → +$26.50; box → +$101.50; exact → +$476.50 |
| **blank** (−$19.50) | 4 boxes 1B late-29 ($29.00) + 824 straight 1S ($7.25) = $36.25: {2,4,8} {4,6,9} {3,6,9} {0,2,3} | 0 hits → **−$55.75** (42%); 1 box → −$18.25 (37%); 2 boxes → +$19.25; exact 824 → +$169.25 or better |

Whole plan: **P(night positive) ≈ 49%** (37.4% from stage 1 alone, plus 0.626 × ~18% from the blank branch); P(worst case −$55.75) ≈ 26%; expected ≈ −$5. Compare the operator-style ticket in §4: 25.5% positive, 74.5% blank at −$52.50, expected ≈ −$5.25. Same expectation, different shape: this plan wins small often and keeps a straight on the table every night; §4 waits for the big one.

Why these sets and no others: with fair draws the six sets can only be chosen by convention, so they are the six the room sees (the Evening board), all clear of the 3-day block, singles only (a double halves the hit count in a plan that needs hits, and pays the same per dollar). The late four drop {0,4,6} and {3,4,6} — the two with the thinnest late-pool footprint (8 and 12 in 90d, tie-break only). 824 is the straight because it is the posted order on two boards; 842 (the most-drawn order, 10 of 42) is equally good.

Amend after the 10/20 midday import: an Evening-board set drawing at midday closes that leg by convention — replace it with {2,6,8} (All-Day 1 + Mid 2) at the same unit. Reconcile after the 10/21 import; only mark PLACED on the operator's word.

## 7. Pair data, tested directly (operator asked 10/20 ~3pm: "are we not utilizing our pair data?")

Walk-forward on `histories` 4/1 → 10/19 (14,210 rows), expectation computed over the uniform 1,000-combo universe for each night's actual pair set:

| Test | Obs | Exp | Ratio | z |
|---|---|---|---|---|
| Trailing-90d top-5 pairs → tonight's evening draw contains one | 1,102 | 1,118.7 | 0.985 | −0.57 |
| Trailing-90d top-10 pairs → same | 2,012 | 1,985.3 | 1.013 | +0.79 |
| Pairs drawn 2+ times at TODAY's midday → tonight's evening | 6,451 | 6,474.1 | 0.996 | −0.65 |
| Pairs drawn 2+ times LAST evening → tonight | 7,202 | 7,175.6 | 1.004 | +0.94 |
| Pair-score selector: top-6 sets by summed 90d pair counts → evening box hits (111 nights) | 176 | 166.5 | 1.057 | +0.75 |
| Same-day midday SET → evening (sanity) | 1,176 | 1,203.1 | 0.978 | −0.85 |

Pair data carries nothing an evening ticket can use: trailing pair frequency, same-day midday pair repeats, last-night pair repeats and a pair-score set selector all sit inside ±1z of fair draw. The engine already consumes pair data (PBURST + CO signals) and lands at AUC 0.50 for the same reason. The midday import therefore changes the ticket only by convention (close a leg that drew), not by information.
