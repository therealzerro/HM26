# Sunday 10/4 late scope

Built 2026-10-04 ~6:30am ET, before any 10/4 draw. **PROPOSED — NOT PLACED.** Internal operator document.

Scope: tonight's draws **after 7:45pm ET only** — the late pool, after the early 13. Independent of the engine boards: every number below comes from a fresh pull of `histories` (13,208 rows, 4/1 → 10/3) and a walk-forward test written for this scope.

---

## 1. The picks

**Tonight's late pool = 28 draws** (Sunday: TX Night is dark). AZ · QC · IA · IN · NE · FL · CO · CA · WI · MO · OK · ID · KS · NY · MS · IL · CT · ON · LA · WA · VA · NJ · KY · NC · NM · W.Canada · GA Night · DC Night.

### 3 BOX picks (any order)

| # | Box set | Confidence: at least one match tonight | Two or more | Why this set |
|---|---|---|---|---|
| B1 | **{2,4,8}** | **16%** (fair-draw floor 15.5%, backtest reading 21%) | 1.2% | Most-drawn set of the last 90 days: 64 draws vs 39.6 expected. Also #1 in the late pool itself over the full history (47 vs 27.7) and over 90 days (30). |
| B2 | **{1,2,7}** | **16%** (15.5% / 21%) | 1.2% | #2 over 90 days (57). #2 over 30 days (21). #3 in the late pool over 90 days (22). |
| B3 | **{1,5,8}** | **16%** (15.5% / 21%) | 1.2% | #3 over 90 days (57). #4 in the late pool over the full history (39). |

### 3 STRAIGHT picks (exact order)

| # | Straight | Set | Confidence: exact order lands at least once | Set lands in any order | Why |
|---|---|---|---|---|---|
| S1 | **539** | {3,5,9} | **2.8%** | 15.5% | #4 over 90 days (54). Most-drawn set on Sunday late pools (8). Order 539 leads this set in the late pool, 11 of 31. |
| S2 | **546** | {4,5,6} | **2.8%** | 15.5% | #5 over 90 days (52), #1 over 30 days (24). Order 546 leads in the late pool (9 of 33) and across all draws (18). |
| S3 | **021** | {0,1,2} | **2.8%** | 15.5% | #6 over 90 days (51), #2 in the late pool over 90 days (24). Order 021 leads in the late pool, 9 of 31 (012 is next with 8). |

The six picks sit on six different sets on purpose: that maximises the chance that something lands.

### Whole-ticket confidence (28 draws)

| Outcome | Fair-draw | If GA/DC Night are not on the ticket (26 draws) |
|---|---|---|
| At least one of the 3 boxes matches | **39.9%** | 37.6% |
| At least one of the 3 straights lands exact | **8.1%** | 7.5% |
| Anything on the ticket matches | **44.8%** | 42.4% |
| Whole ticket blank | **55.2%** | 57.6% |

Expected matches per box pick: 0.168. Per straight pick: 0.028.

---

## 2. How to read the confidence numbers

- **15.5% is the fair-draw figure** for any single box set across 28 draws (6 orders in 1,000, 28 chances). **2.76%** is the same figure for one exact order. Every set has these numbers; no test below moved them in a way that survived checking.
- **21% is what this exact selection rule scored in the backtest** (see section 3), scaled from 26 to 28 draws. I do not believe it at face value, for the reasons in section 3.
- **16% is my stated confidence**: the fair-draw figure with a small allowance (about one chance in ten) that the backtest reading is real.
- **The straight orders carry no measured advantage.** Choosing the order that has led historically landed 17.05% of the time against 16.67% by chance.

---

## 3. What was tested

All tests use the 26 late-pool jurisdictions whose rows are unambiguous. GA, DC and TX store their evening and night draws under one label, so they are excluded from the tests but counted in the frequency tables.

### The late pool is statistically fair (4,621 draws, 4/1 → 10/3)

| Test | Result | Fair-draw expectation |
|---|---|---|
| Singles / doubles / triples mix | 71.9% / 27.2% / 0.8% | 72% / 27% / 1% |
| All 120 single sets, chi-square | 120.9 | 119 |
| Digit by position, pooled (3 tests) | 8.0 / 7.7 / 12.3 | 9 each |
| Digit by position per jurisdiction (78 tests) | 6 above the 95% line | 3.9 |

### Walk-forward: 12 ways of choosing 3 sets a night (6/3 → 10/3, 123 nights)

Each rule chose its sets using only data available before that night's late pool. Expected rate on those nights was 14.5%.

| Rule | Picks | Matched | Rate | z |
|---|---|---|---|---|
| **Most-drawn, last 90 days (the rule used tonight)** | 369 | 73 | **19.8%** | **+2.90** |
| Most-drawn, last 30 days | 369 | 64 | 17.3% | +1.57 |
| Most-drawn in the late pool, full history | 369 | 64 | 17.3% | +1.57 |
| Most-drawn, last 7 days | 369 | 60 | 16.3% | +0.98 |
| Least-drawn in the late pool, full history | 369 | 63 | 17.1% | +1.42 |
| Least-drawn, last 90 days | 369 | 51 | 13.8% | −0.35 |
| Least-drawn, last 30 days | 369 | 44 | 11.9% | −1.39 |
| Least-drawn, last 7 days | 369 | 35 | 9.5% | −2.72 |
| Longest absent from the late pool | 369 | 52 | 14.1% | −0.20 |
| Most recently seen in the late pool | 369 | 52 | 14.1% | −0.20 |
| Engine Evening board (all 6 slots) | 726 | 101 | 13.9% | −0.43 |
| Random 3 | 369 | 49 | 13.3% | −0.65 |

### Why the 19.8% is not trusted

Checked across all 120 sets, ranked each night by 90-day count:

| Rank band | Share of late draws vs fair |
|---|---|
| 1–3 | 1.42× (z +3.2) |
| 4–10 | 0.84× (z −1.9) |
| 11–30 | 0.93× |
| 31–60 | 0.99× |
| 61–90 | 1.02× |
| 91–110 | 1.04× |
| 111–117 | 1.07× |
| 118–120 | 0.91× |

- A real "hot" effect would fade gradually down the ranks. This one is confined to the top three and reverses immediately below them.
- The top three are the same few sets for weeks at a time, so the result rests on a handful of sets, not 369 independent picks.
- It is the best of twelve rules tried; one result near z 2.9 among twelve is not rare.
- It is uneven across the two halves: 1.26× (z +1.4) in 6/3–8/2, 1.57× (z +3.1) in 8/3–10/3.
- Earlier work on recent frequency (STATE_STR) found it carries nothing.

It is used tonight only because some rule has to choose among equal sets, and this is the one with a positive record.

### Things that do not change the picks

| Question | Result |
|---|---|
| Does a set drawn earlier the same day (midday or early pool) show up more or less in the late pool? | 1.000× (507 vs 506.8 expected) |
| Does a set drawn in the last 3 days show up more or less? | 1.011× (z +0.9) |
| Does last night's late pool repeat? | 1.018× (z +0.3) |

**So there is no amend rule for the 8:24pm early-pool readout.** If one of these sets draws at midday or in the early 13, its late-pool chance is unchanged.

---

## 4. Notes for placement

- {2,4,8} and {1,5,8} both drew on 10/3 (158 landed straight at WA evening), and {1,2,7} drew 10/2. The engine's 3-day block would exclude them; the table above shows that block is rate-neutral, so it is not applied here.
- Overlap with today's engine boards, for reference only (the engine's BOX signal is also frequency-based, so this is not separate evidence): {1,2,7} is Evening position 1 (128), {3,5,9} is Evening position 4 (395), {4,5,6} is Evening position 6 (645).
- If stacking is preferred over spread, the late-pool leading orders of the box sets are 842, 172 and 185 (or 815, tied at 8).
- Alternates, next by 90-day count: {3,7,9} (51), {0,2,4} (49), {5,6,8} (49).
- Reconcile after the 10/5 import: late-pool rows only; check draw time on any GA or DC match.
