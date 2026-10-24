# Nonrandomness audit — `histories` ledger 2026-04-01 → 2026-10-23

Data: 14,510 rows (Content-Range confirmed 14,510; no duplicates, no malformed digits, no MD/PR rows). 39 jurisdictions, 205 draw days, 70 jurisdiction×session cells, 210 jurisdiction×session×position cells. Midday 6,282 / evening 8,228. Lumped two-rows-per-day cells: GA evening (198 days), DC evening (198), TX evening (161), TX midday (156), and also TN midday (170 days) — treated as separate draws; within-day order is unrecoverable (sorted by digits), which matters for §4.

## 1. Global
| | n | pos1 χ²(9) p | pos2 p | pos3 p | classes S/D/T observed | class p | digit-sum χ²(27) p |
|---|---|---|---|---|---|---|---|
| midday | 6,282 | 7.41 / .595 | 4.41 / .882 | 12.37 / .193 | .7147/.2765/.0088 | .333 | .811 |
| evening | 8,228 | 8.15 / .519 | 9.11 / .427 | 13.67 / .135 | .7207/.2715/.0078 | .126 | .575 |
| all | 14,510 | 11.85 / .222 | 9.83 / .364 | 15.85 / .070 | .7181/.2737/.0082 (exp .72/.27/.01) | .064 | .883 |

Triples 119 vs 145 expected (−26) is the only global class deviation; p=.064 overall. Mean digit sum 13.536 (exp 13.5). Nothing global.

## 2. Per cell (210 position cells)
Raw p<0.01: **2** (expected 2.1 under null): WI evening pos1 (n=197, χ²=23.15, p=.0059, digit 0 ×37 = .188) and CO evening pos3 (n=198, χ²=22.30, p=.0080, digit 2 ×29). **BH FDR 0.05 survivors: none; minimum q = 0.797.** The 210 p-values are uniform (KS D=.053, p=.58).

Pairwise position independence (3 tables × 70 cells = 210 tests, df 81, permutation p): 1 test at p<.01 (expected 2.1): NC midday pos1×pos2 χ²=127.3, perm p=.001, **BH q=.21**. Most-common-combo per cell: nothing beyond WI-ev 012 ×4 and KY-ev 080 ×4 (p_max-of-1000 ≈ .05 each — with 70 cells, 3–4 such are expected).

## 3. Replication (H1 ≤ 07-11, n=6,842; H2 ≥ 07-12, n=7,668)
Cells with H1 p<0.01: **0 of 210** (expected 2.1) — nothing to replicate. Loosened to H1 p<.05: 5 cells (expected 10.5); same-sign top digit in H2: 2/5 (chance 2.5); replicate (same digit, same sign, H2 p<.05): **0/5** (chance 0.12). Cross-half correlation of cell χ²: Spearman ρ=−.043 (p=.54). Correlation of the 2,100 per-cell-digit frequency deviations H1 vs H2: r=−.012 (p=.57). Whatever deviates in one half carries zero information about the other.

## 4. Serial dependence
Lag-1 10×10 transition (210 tests, permutation p): 8 at p<.01 (exp 2.1), 19 at p<.05 (exp 10.5), **min BH q=.12**. Lag-2: 4 at p<.01 (exp 2.1), 11 at p<.05, min q=.21. Runs test on digit≥5: 3 at p<.01, 9 at p<.05 (exp 10.5); z-scores mean −.03, sd 1.04, KS vs N(0,1) p=.79.

The one FDR survivor in the whole audit, **TX evening pos1 runs z=4.09, q=.009, is an artifact**: the two same-day TX rows are sorted by digits, so pos1 is forced low→high inside each day. Re-running with within-day order randomized (200 shuffles): runs z median 1.04 (IQR .60–1.47), lag-1 perm p median .47. The GA/DC evening pos1 and TN midday pos1 lag-1/lag-2/runs flags are the same artifact (shuffled: GA z −.25, DC z −.70, TN z .06; day-to-day transition permutation p = .26/.28/.85/.02 for TX-ev/GA/DC/TN).

Genuine-stream watch item: **NJ midday pos1** — lag-1 perm p=.001 and runs z=−2.94 (same-digit repeats 27 vs 19.7 expected). Halves: H1 lag-1 p=.28, runs z=−1.99; H2 lag-1 p=.004, runs z=−2.16. Directionally consistent but fails FDR (q=.12 / .30) and is built on 27 repeat events; not bettable (even if real, the implied straight EV with other positions fair is 900×.137×.01=1.23 on a 198-draw estimate with a 95% interval that includes 1.0).

Same-day repeats: own midday→evening box repeat 35/7,003 = .00500 vs .00514 expected (36.0), p=.93; straight repeats 8 vs 7.0. Cross-jurisdiction: midday sets re-drawn anywhere evening same day 1,088 observed vs 1,102.9 expected, z=−.50, p=.62.

## 5. Day-of-week (28 tests)
All class p ≥ .18; position p: 20 of 21 ≥ .066, one raw p=.02 (Sun pos2). **Min BH q=.565.** Nothing.

## 6. Effect-size screen for the bettor
Max-digit frequency per position cell: ≥.111 in 210/210, ≥.13 in 139/210, ≥.15 in 28/210 — this is what max-of-10 at n≈200 produces (null simulation at the actual n's: mean P(null max ≥ observed)=.55). Top cells by exact binomial p:

| cell | n | digit | count | freq | binom p | ×10 digits | H1 freq | H2 freq |
|---|---|---|---|---|---|---|---|---|
| WI evening pos1 | 197 | 0 | 37 | .188 | .0001 | .001 | .151 (p .08) | .221 (p<.001) |
| CT evening pos1 | 198 | 4 | 34 | .172 | .0013 | .013 | .191 | .154 |
| NY midday pos1 | 198 | 0 | 34 | .172 | .0013 | .013 | .170 | .173 |
| NC evening pos3 | 204 | 5 | 34 | .167 | .0022 | .021 | .146 | .185 |
| IN midday pos1 | 198 | 5 | 33 | .167 | .0025 | .024 | .181 | .154 |

WI-ev-pos1-0 Bonferroni over 2,100 cell-digits: p=.28; null simulation P(any of 210 cells shows a digit ≥.188) = .167. A ~1-in-6 event in a fair ledger. If the raw .188 were real it would mean straight EV 1.69 at 900:1; a Beta(10,90)-shrunk estimate is .158 → EV 1.42; the H1 half alone (.151) says EV 1.36 on 93 draws with CI covering 1.0. Not established.

Full combos (expected 14.51 each; threshold 3× = 43.5): **none** reach it; max count 32. The 1,000 counts are exactly Poisson (var/mean .998, χ² 998.5 p=.50, 0 zero-count combos). Top: **575 ×32** (Poisson tail p=1.3e-5, **BH q=.050**; P(max over 1,000 ≥32 | fair)=.049 by simulation). It is spread over 22 jurisdictions, both sessions (17/15), both halves (15 vs 6.8 exp, p=.005; 17 vs 7.7, p=.002) — so not duplicate ingestion. But its box set 557 is 60 vs 43.5 (q=.89) and the other two orderings sit at 14 and 14 (expected 14.5 each): the entire excess lives in one physical ordering drawn from 22 independent machines, which is not a mechanism, it is the maximum of 1,000 Poissons. Naive EV at 900:1 = 1.99; a prospective test at the observed rate would need ~5,600 fresh draws (~80 ledger-days) for 80% power, ~28,600 at p=.0015. Box sets ≥2× expected: **none** (singles mean 86.8, range 68–107, χ² over 220 sets p=.83). Lowest set q = .89.

## 7. Power
Draws per jurisdiction-session: 70 cells, **min 131, median 198, max 396**. BH-effective α for a lone true effect ≈ .05/210 = .00024.

| digit p | power n=131 raw/BH | n=198 raw/BH | n=396 raw/BH | n for 80% raw / BH |
|---|---|---|---|---|
| .11 | .05/.000 | .06/.000 | .06/.000 | 14,085 / 29,773 |
| .12 | .07/.000 | .08/.001 | .11/.001 | 3,522 / 7,444 |
| .13 | .10/.001 | .12/.002 | .22/.006 | 1,565 / 3,309 |
| .15 | .21/.005 | .31/.014 | .61/.083 | 564 / 1,191 |
| .20 | .76/.17 | .93/.44 | 1.00/.95 | 141 / 298 |

Smallest digit probability detectable at 80% power after BH: **.251 at n=131, .223 at median n=198, .187 at n=396**. The bettable threshold (.111) needs ~30,000 draws per cell after correction — 150 years of one daily draw. Correspondingly, every cell screen above was essentially unpowered for an edge of bettable size; the absence of findings is consistent with fairness but is primarily a sample-size statement.

## Verdict
Survives FDR 0.05: **one test** (TX evening pos1 runs, q=.009) and it is a within-day sort artifact that vanishes under shuffling. Survives FDR AND replicates across halves: **nothing**. Cells with a digit at the bettable .111 with other positions fair cannot be distinguished from noise at these n; the two numerically largest signals (WI evening pos1 digit 0 at .188; combo 575 at 2.2× expected) are each about a 1-in-6 / 1-in-20 draw from the maximum of 2,100 / 1,000 fair statistics and have no mechanism (575's siblings 557 and 755 are at expectation). **No cell a bettor could use.** The data is consistent with 14,510 independent uniform three-digit draws in every dimension tested: position, class, digit sum, position independence, serial order, same-day repeats, weekday.

## Files (all under /tmp/claude-1000/-workspaces-HM26/4bb5462d-5790-4ece-917c-fc23bb33614b/scratchpad/audit/)
- `fetch.py` — REST pagination; `data/histories_raw.json` (14,510 rows)
- `profile.py` — data profile (dup/format/lumping check)
- `audit.py` — §1–7; `results/audit_log.txt`, `results/audit_results.json`, `results/cells.csv`, `results/replication.csv`, `results/combos.csv`, `results/sets.csv`
- `followup.py` → `results/followup_log.txt` — 575 breakdown, half-splits of top cells, within-day-shuffle serial retest
- `followup2.py` → `results/followup2_log.txt` — NJ midday half-split, prospective n for 575
- `REPORT.md` — this report
