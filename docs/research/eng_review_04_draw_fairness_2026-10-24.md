# ENG-REVIEW-04 — Draw-fairness audit and edge search (2026-10-24)

Operator ask: "go online, study advanced mathematics, and give another shot at seeking any real signal or edge that may enhance ZK6." Six months of live data; every prior selection test at the uniform rate (ENG-REVIEW-01/02/03, SIGNAL-INFO-01, information ceiling). Three parallel agents + inline tests. Nothing in this review touches engine code or config.

## The framing that changed
Every edge ever documented in a fixed-odds daily-number game came from the DRAW not being uniform (ball-set rigging 1980 PA; RNG code faults AZ 2013, DC 2026; RNG hardware fault AZ 2017), never from patterns in past results. All prior HitMaster tests were pattern tests. This review tests the draw mechanism itself. By definition a uniform independent draw carries no information about the next draw; the only door is non-uniformity.

## 1. Ledger audit (`eng_review_04_ledger_audit_2026-10-24.md`, code in `eng_review_04/`)
14,510 draws, 39 jurisdictions, 2026-04-01→10-23, 70 jurisdiction×session cells (min 131 / median 198 / max 396 draws), 210 position cells.
- Per-position digit χ²(9): 2 cells raw p<.01 (expected 2.1); BH FDR .05 survivors: **none** (min q .80). Position independence (df 81): 1 cell p<.01, q .21. Class rates S/D/T .718/.274/.008 (exp .72/.27/.01). Digit sums, weekday: nothing.
- Split-half replication (≤7/11 vs ≥7/12): 0 cells p<.01 in H1; deviations H1 vs H2 correlation r = −.012. Zero carry-over.
- Serial (lag-1/lag-2 transitions, runs): the only FDR survivor (TX evening pos1 runs, q .009) is a within-day SORT artifact of the two-rows-per-day games (GA/TX/DC evening, TX/TN midday); vanishes under within-day shuffle. Watch item: NJ midday pos1 same-digit repeats 27 vs 19.7 (q .12, both halves same sign) — not bettable.
- Same-day repeats (own midday→evening box .0050 vs .0051; cross-jurisdiction 1,088 vs 1,103): fair.
- Effect-size screen: combo **575 ×32** vs 14.5 (q .050; fair-ledger max median 28, 95th pct 31) across 22 jurisdictions, both halves; siblings 557/755 at 14/14 → the maximum of 1,000 Poissons, no mechanism. No box set ≥1.17×. WI evening pos1 digit 0 at .188 = P≈1/6 for the max of 2,100 cell-digits.
- **Power:** after BH, smallest detectable digit probability is .25 at n=131, .22 at n=198, .19 at n=396. The bettable threshold (.111 in one position at 900:1) needs ~30,000 draws per cell (~150 years of one daily draw). Absence of findings is a fairness-consistent SAMPLE-SIZE statement.

## 2. Gross-fault screen (`eng_review_04/gross_fault.py`) — the only screen with power at our n
AZ-2013 signature (digit missing from a position ≥30–40 draws): longest absent run 94 draws (TX midday pos1 digit 5, P≈.5 somewhere in the ledger); digits absent from a position over each cell's last 40 draws: 30 of 210 flagged vs 29.4 expected. AZ-2017 signature (exact repeat within 7 draws): 110 vs 99.6 expected (p .32); no combo 3× in a week; consecutive identical draws 21 vs 14.4. **Clean.**

## 3. Steering / countermeasure test (`eng_review_04/steering.py`)
If draws were steered away from public favourites, overbet classes would be under-drawn. Triples 119 vs 145.1 (ratio .82, p(under) .014; H1 .83 / H2 .81; eve .78 / mid .88); descending runs .84 (p .048); date-like .98 (p .036); but 777/711/911/420/666/123/321/369 at 1.06, ascending runs 1.03, doubles 1.01, odd/even/sum classes ≥1.0. Nine one-sided tests → best BH q ≈ .13. Split by draw method: triples ratio **1.07 in ball-drawn games (n 4,593), .71 in RNG/unknown (n 9,917)**. Not a steering pattern (the most-bet specific combos are not suppressed) and not bettable even if real: suppressing 10 triples lifts the other 990 combos by .02% against the 11% needed at 900:1.

## 4. Draw method by jurisdiction (agent report, confidence-graded)
Physical balls: FL, GA, MI, NC, NJ, NY, SC, TX, WV (inferred), CT (medium), PA evening only, IN evening only; VA/OH/ON/QC/WA unresolved. Everything else RNG (Smartplay Origin: IL KY MO CA DC; Szrek: AR; MUSL process: Tri-State since 2024, AZ). No ball set anywhere reported replaced for measured bias since 2015 (NC "weighed and measured"; TX pre-tests fail a set only on 5-of-5 repeats — zero power vs a .13 digit). Pooled position χ² within ball games 6.2/9.3/6.4, within RNG 12.7/7.9/15.3 (p<.05 needs >16.9).

## 5. Mathematics (agent report)
- Break-even at 900:1 straight: P(combo) > 1/900 → one biased position needs q > .1111; two positions q > .1054 each; three q > .1036. Box 150:1: one position q > .1333. Kelly at a real q=.13 single position: EV 1.17, f* = .019% of bankroll per combo (≈$0.19 per $1,000 per draw).
- Sample sizes (two-sided α .05, 80% power, one cell): q=.13 → 843 draws; .12 → 1,855; .11 → 7,248; Bonferroni over 2,400 cells: 2,703 / 6,008 / 23,718.
- Shrinkage: Dirichlet(α=50–100/digit) posterior; an n=370 cell at raw .149 shrinks to ≈.123 — the honest number for any EV.
- Monitoring without inflation: Lindon–Malek anytime-valid Dirichlet-mixture Bayes factor (martingale under H0; reject at BF ≥ 1/α after any draw).
- Only other documented legitimate edge: pari-mutuel unpopular numbers (Chernoff 1981, MA Numbers) — does not exist against a fixed 900:1 book and decayed within years. CA Daily 3 pari-mutuel straight prizes ≈$435–774 < 900: no arbitrage.

## 6. The DC incident — a real, bettable fault, inside our live window, visible in our own ledger
DC Lottery disclosed (newsroom 4/2026; Lottery Post 359024) that a Smartplay recertification coding error on 3/31/2026 stopped the DC-3/4/5 midday and evening draws from producing repeated digits until 4/21/2026; the 11:30pm night draw was unaffected; players with two matching digits were compensated with coupons. **Our ledger shows it:** DC 4/09–4/21 — all 13 midday draws singles; the evening bucket (evening+night lumped) 22 singles + 4 doubles (200, 433, 737, 533), i.e. the doubles sit where the unaffected night draw lives. ≈26 affected draws with zero doubles/triples: P(fair) = 2×10⁻⁴. A singles-only draw puts each single at 1/720: **straight at 900:1 returned 1.25, box at 150:1 returned 1.25 — a +25% edge for three weeks, on the singles ZK6 already favours, disclosed only after the fact.** Detectable in-ledger after ~20 affected draws (P(no double in 20 fair draws) = .0014). Nobody — including us — was looking.

## Verdict
1. Six months of draws are consistent with independent uniform three-digit draws in every dimension tested; nothing survives correction and replication. The pattern layer (frequency/overdue/pairs/convergence) cannot and will not move the rate — settled by definition, not by fatigue.
2. The sample is too small to see a bias of bettable size (.111) in any single game; it never will be at one or two draws a day.
3. The one edge class that has actually existed in 2026 (DC, +25% for three weeks) is a GROSS FAULT: missing classes or digits, repeated draws. That signature IS detectable at our sample sizes within days, and we had the data and did not look.
4. Steering/countermeasures: testable, tested, not supported, and worthless at fixed odds even if true.

## Actionable (proposal only — nothing built)
A **draw-fault monitor** in the Daily Workflow preflight (read-only, fail-open, operator-informed): per jurisdiction×session, flag (a) zero doubles+triples over the trailing 20 draws (P .0014), (b) any digit absent from a position over the trailing 40 draws AND the prior 40 (P 2×10⁻⁴), (c) an exact repeat within 7 draws twice in 14 days, (d) the anytime-valid Bayes-factor on each cell's digit vector at α .01. A flag means "a state has a fault, bet singles/box there at full size until it is fixed" — the only mathematically positive bet this game has ever offered. Expected frequency: a few per decade across 40 games; cost: a few hundred lines, zero engine change. Decision is the operator's.
