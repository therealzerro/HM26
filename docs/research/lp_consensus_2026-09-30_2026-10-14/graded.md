# Lottery Post consensus scan — graded report (window 2026-09-30 → 2026-10-13, today 2026-10-14)

**Status: research only · not adopted · the Lottery Post side was NOT obtained.**

## Run report

| item | value |
|---|---|
| pages fetched | 1 attempted (`/predictions/statistics/top`), 0 obtained |
| refusals | 1 — HTTP 403, Cloudflare JavaScript challenge ("Just a moment…"), 2026-10-14 20:39 UTC |
| retries | none (brief: stop on any refusal, never retry around it) |
| runtime | 0.1 s network; the automated pass ended at request 1 |
| lines dropped | n/a (no page content) |
| members found | TOP-HOT 0 · TOP-LIFE 0 · ALL 0 |
| raw HTML | deleted after the status check (a challenge page, no member content) |

The operator lifted the standing "no automated access to Lottery Post" rule for this STAT research
on 2026-10-14 (chat ruling). The site refuses non-browser clients at the edge, as the 2026-07-25 scope
also found. **Stop accepted by the content agent the same day:** no attempt will ever be made to pass
the challenge (no headless solving, no alternate user agents, no proxies, no retries). Lottery Post's
no to automated reading stands.

**Small-scale lane (ruled 10/14):** the operator may save a few state prediction pages from his own
browser into `research_local/lp_saved/` (gitignored) as Safari Web Archive or HTML (preferred) or PDF
(text only, weaker), named `{state}_{yyyy-mm-dd}.{ext}` plus `top.{ext}` for the statistics page.
`parse_lp_pages.py` reads them (member extraction unvalidated until a first real page);
`consensus.py --consensus-only` writes L1/L2/L3 counts. With a handful of pages the report is
consensus only: no grading claims, and the sample is stated as too small to grade. **Provided 10/14
16:52 ET: 7 state pages for 2026-10-14** (uploaded to GitHub by mistake, moved out of the tree in
2c34c00; they remain in history at 80fa014). Parsed and counted — see `today.md`. One day × seven
states is too small to grade; parts A and B stay as above.

## Required outputs — status

| output (brief §5) | status |
|---|---|
| `consensus_L1.csv` / `L2` / `L3` | present for **2026-10-14 only, 7 states (FL GA MI NY OH TX DC), ALL pool** — operator-saved pages; counts only. No past-date pages → no past-date consensus |
| `graded.md` A, B, C | this file — A: HitMaster column only; B: not obtained; C: histories side only |
| `today.md` | present — ALL consensus board from the 7 saved pages (ungraded; TOP pools empty, statistics page not saved) |
| raw `picks.csv` (local) | `research_local/lp_saved/picks.csv` — 16,875 rows, 70 members, local only |
| run report (pages, refusals, runtime, dropped lines, members per pool) | table above |

## A. Consensus boards vs HitMaster, same pool

Grading law: box = sorted set equals the draw's sorted set; straight = exact order equals
`result_digits`. Pool = every `histories` draw on the date (the All-Day pool), distinct draw
events (production dedupe key). Null = STAT-01 method: random boards of the same class composition
graded against the same draws, R = 10,000; lift = observed ÷ null mean; 95% CI = bootstrap over
dates of Σobs/Σexp (STAT-01 convention); p two-sided, +1 corrected.

| board | dates | draw events | box obs | box null mean (sd) | box lift | 95% CI | p | straight obs | straight null | straight lift |
|---|---|---|---|---|---|---|---|---|---|---|
| TOP-LIFE consensus | — | — | not obtained | | | | | | | |
| ALL consensus | — | — | not obtained | | | | | | | |
| HitMaster All-Day (published, pre-cutoff) | 14 | 1030 | 42 | 37.53 (5.89) | 1.119 | 0.923 – 1.315 | 0.49 | 7 | 6.25 | 1.12 |

Days with any box match: 14 of 14 observed vs 13.1 expected under the null.

Plain reading: over these 14 days HitMaster's All-Day board matched at the rate of a random board of
the same composition (all 14 boards were six six-way sets). The CI spans 1.0 by a wide margin on both
sides, as 14 days must; no conclusion is drawn, and this is consistent with STAT-01 (lift 0.98,
CI 0.90–1.07 over 374 boards). The Lottery Post columns stay empty until pages exist.

Per-date HitMaster rows (board in published order; matches as set:state-session):

| date | draws | board | box | exp | straight | matched |
|---|---|---|---|---|---|---|
| 09-30 | 75 | 425 758 408 485 140 694 | 4 | 2.80 | 1 | 014 TX-m · 458 DE-m · 469 CA-m · 469 IL-m |
| 10-01 | 75 | 428 240 385 315 381 691 | 1 | 2.80 | 1 | 248 CA-m |
| 10-02 | 75 | 425 758 408 563 195 375 | 3 | 2.85 | 0 | 245 NE-e · 356 FL-e · 578 OH-e |
| 10-03 | 75 | 408 195 375 185 681 064 | 3 | 2.65 | 1 | 048 TN-m · 158 CT-m · 158 WA-e |
| 10-04 | 66 | 240 385 594 681 064 752 | 2 | 2.35 | 0 | 046 AZ-e · 257 MO-e |
| 10-05 | 75 | 240 385 594 195 415 706 | 4 | 2.35 | 0 | 067 KY-e · 067 NM-e · 358 MO-m · 459 VA-m |
| 10-06 | 75 | 195 681 415 136 709 325 | 2 | 2.70 | 0 | 159 MN-e · 159 W.Canada-e |
| 10-07 | 75 | 681 136 325 485 563 408 | 2 | 3.10 | 0 | 136 DE-m · 136 NY-e |
| 10-08 | 75 | 415 485 563 408 795 694 | 3 | 2.35 | 1 | 048 ME,NH,VT-e · 579 DC-m · 579 SC-m |
| 10-09 | 75 | 681 415 325 140 375 694 | 4 | 2.55 | 0 | 014 QC-e · 145 ON-e · 168 GA-e · 168 MI-e |
| 10-10 | 75 | 325 485 563 375 706 195 | 4 | 3.05 | 1 | 067 DE-e · 159 PA-e · 235 GA-m · 357 AR-m |
| 10-11 | 64 | 485 563 428 764 094 064 | 3 | 2.70 | 0 | 458 CO-e · 467 GA-e · 467 KS-e |
| 10-12 | 75 | 428 094 752 064 794 185 | 3 | 2.80 | 1 | 049 TX-m · 248 PA-m · 479 DE-e |
| 10-13 | 75 | 563 752 185 249 140 681 | 4 | 2.50 | 1 | 014 AZ-m · 257 IL-e · 257 NM-m · 356 DC-e |

(Box count = draw events matched; a set drawn in two states counts twice, matching the null's accounting.)

## B. State-level agreement

Not obtained — requires member-level picks per (date, state, session). The harness
(`consensus.py`, section B) reports observed vs expected (.006 / .003 / .001 box by class; .001 exact)
for TOP-LIFE cells with 2+ members and ALL cells with 3+ members once picks exist.

## C. Coverage

`histories` carries 39 jurisdiction codes in the window: AR AZ CA CO CT DC DE FL GA IA ID IL IN KS KY LA
ME,NH,VT MI MN MO MS NC NE NJ NM NY OH OK ON PA QC SC TN TX VA W.Canada WA WI WV (2 sessions; 75 draw
events on a full day, 64–66 on Sundays). Lottery Post regions known from the 2026-07-25 scope that
`histories` does not carry: Atlantic Canada, British Columbia. Pick counts for them: not obtained.

## Caveats

14 days is a small sample. The HitMaster box-lift CI runs from 0.92 to 1.32, a width of 0.39, and spans
1.0 on both sides; a 14-day window cannot be narrower than this. Nothing here is a
finding. Any future lift whose CI excludes 1.0 would be a hypothesis for a pre-registered forward
test (STAT-02), decided separately by the operator; no copy, board, engine or product change follows
from this document.
