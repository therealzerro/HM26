# Lottery Post consensus — today's boards (2026-10-14) · UNGRADED · consensus only

**Source:** 7 state prediction pages saved by the operator from his own browser (FL GA MI NY OH TX DC),
all the page for 2026-10-14, saved 16:47–16:51 ET, parsed locally (`parse_lp_pages.py`, validated on
these pages: 0 lines dropped, 1,435 non-3-digit game rows skipped). The automated request earlier in
the day was refused and is not retried; the statistics page was not saved, so **TOP-HOT and TOP-LIFE
pools are empty and no top-predictor board exists.** Everything below is the ALL pool.

**Sample size ruling:** one day, seven states. Consensus only; nothing here is graded and no match
claim is made. The sample is too small to grade.

## ALL consensus board (L2: distinct members across the 7 states, box)

| rank | box set | distinct members (of 70) | distinct states |
|---|---|---|---|
| 1 | 1-2-3 | 17 | 7 |
| 2 | 5-6-7 | 16 | 7 |
| 3 | 0-1-9 | 15 | 7 |
| 4 | 5-5-5 | 15 | 7 |
| 5 | 0-0-0 | 14 | 7 |
| 6 | 1-2-9 | 14 | 7 |

8-8-8 also has 14 members and 7 states; it loses the tie to 1-2-9 on the lower-box-set rule.
Exact-order leaders are all triples: 555 (15), 000 (14), 888 (14), 222 and 444 (12), then every other
triple at 11.

## What the pages show about "consensus"

- **70 members** posted a 3-digit game on these pages. **61 post to all seven states**, and **59 of 70
  post the identical list to every state and session** they appear in. Cross-state agreement on
  Lottery Post is therefore mostly one person reposting one list; distinct-states carries almost no
  information and distinct-members is the only count that means anything.
- **Coverage is near-total.** Per (state, session) the crowd touches 217–219 of the 220 box sets;
  219 of 220 across the seven pages. The top set is backed by 17 of 70 members (24%); the median
  L2 set has 5 members. The crowd as a whole predicts almost everything.
- **Triples are over-picked.** 9.2% of unique picks are triples, against 1% of the outcome space
  (six-way 69% vs 72%; doubles 22% vs 27%).
- Median member posts 140 unique (state × session × combo) lines; the largest posts 700.

Counts-only files: `consensus_L1.csv` (per state × session), `consensus_L2.csv` (across states),
`consensus_L3.csv` (window = this one day). No member names anywhere in this folder.
