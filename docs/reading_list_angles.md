# Reading-List Angles — what the 15 books actually give us

**Generated:** 2026-06-26 · deep-research run `wf_993bd717-b6c` (109 agents, 26 sources, 91 claims → 24 verified / 1 refuted).
**Grounding:** filtered through HitMaster's established reality — fair/memoryless draw, full-universe singles AUC = 0.500 ([[project_signal_info_01_settled]]), ~−10% EV at uniform 90% RTP fixed payouts ([[project_bug162_hit_inflation]]). The books do **not** change fair-draw odds; value is in measurement rigor, the decision layer, and positioning.

## Headline finding (the one genuinely new lever)

Every prior angle tried to **predict the draw** — all flat. The only book idea that survives is about **payout *given a hit*, not prediction**: Haigh's "pick unpopular combinations." It splits on payout structure:

- **Fixed-payout games → NO-OP.** A $1 straight pays a flat $500 (P3) / $5,000–6,000 (P4) regardless of how many share it. NJ switched pari-mutuel→fixed **2022-11-14** explicitly so winners "no longer have to split." Most US daily games are fixed. Do **not** build an "unpopular combo pays more" feature for these. (This exact over-generalization was the one claim the harness **refuted**.)
- **Pari-mutuel games → REAL but marginal.** **California Daily 3 is pari-mutuel** — prizes split among winners, so a less-played winning combo is shared with fewer people. Here unpopular-combo selection genuinely raises per-winner share. Must be **per-jurisdiction**, never global.

## Prioritized angles

### Tier 1 — real, net-new lever `[decision-layer]`
1. **Per-jurisdiction payout-structure awareness + pari-mutuel-only "unpopular combo" steering.** Prerequisite: a maintained **fixed-vs-pari-mutuel map** (CA pari-mutuel; MO, NJ post-2022 fixed — confirmed). Magnitude open: likely variance-shaping, probably not enough to flip the −10% base EV. *(i) real, testable.*

### Tier 2 — decision-layer discipline (reframes what we have) `[decision-layer]`
2. **Kelly-ground the stake-share (CALIB-01).** Kelly maximizes E[log wealth] and returns **zero/negative on a −10% EV game**. Whelan (peer-reviewed) + Samuelson: aggressive sizing with no edge provably loses more, and even half-Kelly over-bets risk-averse users. → Frame `stake_share` as **entertainment-budget fractional allocation, never EV/growth optimization**; conservative default; say so in copy. *(i) real but constraining.* See [[project_calib01_pick_probabilities]].
3. **Liability "sell-out" UX nudge** `[product]` — even fixed games cap per-combo liability (MO $2M; `2000` sold out 2000-01-01) so popular combos can become unbuyable. Not EV — a nudge away from culturally-popular dates/patterns. *(ii) neutral UX.*

### Tier 3 — measurement + positioning `[engine/measurement | product]`
4. **"Fairness audit" credibility asset.** Literature independently confirms our findings (memoryless geometric gaps; no detectable mechanical bias under corrected chi-square; "unlucky 13" = data-snooping). Turn the null into positioning: a pre-registered, MC-corrected goodness-of-fit report per jurisdiction. ⚠️ Use a **multinomial** model (digits drawn *with replacement*), **not** the hypergeometric 6/49 audit model. *(i) testable, model-mismatched if copied naively.*
5. **Pre-registration + multiple-comparison correction as harness standard** — we already do this ([[project_overdue_reversion_tested_flat]] COHORT-01); formalize so no future digit/pattern test manufactures false patterns. *(i) methodology.*

### Tier 4 — vocabulary only (low-confidence track) `[product]`
6. Workbook terms (twins, mates, mirrors, resistant digits, rundowns 9-2-7/730/962/369) → reuse as **neutral user-facing labels only**, never implying predictive power. *Caveat: the workbooks were NOT independently verified by the research — rests on the brief's framing.* *(ii) vocabulary.*

## Tests worth running next
1. Build the **fixed-vs-pari-mutuel jurisdiction map** (gates #1 and #3).
2. For pari-mutuel states, **quantify per-winner-share uplift** from unpopular combos (co-winner count distribution) — variance-only or ever EV-positive?
3. **Pre-registered, MC-corrected AUC test** of the workbook patterns — expected flat → settles them as vocabulary-only.
4. **Corrected multinomial goodness-of-fit** per jurisdiction — credibility asset; expected null.

## Claims our data already falsifies (now corroborated by the literature)
- Overdue / hot / gap / **centrality** signals predict → **NO** (geometric memoryless; AUC 0.5; see [[project_signal_info_01_settled]] + MASTER_AUDIT CEN-01).
- Systems / rundowns / pairs change fair-draw odds → **NO**.
- Unpopular combos pay more in **fixed-payout** games → **NO** (refuted).

## Per-book one-liners
| # | Title | Leverage | Verdict |
|---|---|---|---|
| 1–6 | Pick 3/4 system & pattern workbooks (Maynu, Walsh, Numeris, Power of Pairs, rundowns) | product | (ii) vocabulary only — unverified track |
| 7 | Packel — Mathematics of Games & Gambling | engine/measurement | expectation/EV math; supports honest framing |
| 8 | Barboianu — Probability Guide to Gambling | engine/measurement | rigorous lottery math; supports audit framing |
| 9 | **Haigh — Taking Chances** | decision-layer | **Tier 1** — unpopular combos (pari-mutuel only) |
| 10 | Mosteller — Fifty Challenging Problems | engine/measurement | combinatorial intuition; no direct lever |
| 11 | Feller — Probability Theory Vol.1 | engine/measurement | Markov/geometric → confirms memorylessness |
| 12 | Mlodinow — The Drunkard's Walk | product/positioning | signal-vs-noise honest copy |
| 13 | Silver — The Signal and the Noise | product/positioning | calibration, base rates → on-brand copy |
| 14 | **Poundstone — Fortune's Formula** | decision-layer | **Tier 2** — Kelly bet-sizing (says bet 0) |
| 15 | Wheelan — Naked Statistics | product/positioning | distributions/inference for honest copy |

## Caveats
- Payout structures are **state-specific and change** (NJ flipped 2022; CA still pari-mutuel) — any unpopular-combo/sell-out feature must read **live per-jurisdiction rules**, not a hardcoded assumption.
- Geometric-gap mean and the hypergeometric audit model are **6/49-specific** — re-derive for with-replacement Pick 3/4 digits before use.
- The workbook-vocabulary track is unverified; treat as separate/lower-confidence.

**Sources:** NJ Lottery press release (pari-mutuel→fixed 2022-11-14), Missouri Lottery payout/liability pages, CA Daily 3 pari-mutuel confirmation, plus probability literature. Full claim set + 26 cited sources in the run transcript.
