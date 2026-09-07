# Operator Bet Log

Pricing model (decoded 2026-07-22): book charges **$0.25 per jurisdiction-draw per unit**; payouts per hitting state: straight 900:1 = **$225/unit**, 6-way box 150:1 = **$37.50/unit**. Full evening board tonight = 42 live draws → $10.50/unit. Early-13 pool (pre-8:44pm ET: PA SC WV ME,NH,VT TX GA TN MI MN DE OH AR DC) → $3.25/unit. Late-29 pool → $7.25/unit.

## 2026-09-07 — midday session (Monday board, 33 midday draws / 31 jurisdictions → $8.25/unit per leg per bet type)

Slate basis: 9/7 K6 (workflow run 8:06am ET, engine v2.1, edge v53). All 32 midday DI rows are singles, so the double is sourced outside the board. Cross-scope read: {1,5,8} sits on ALL THREE boards today (third such triple overlap after 8/28 and 9/6; it boxed midday on 8/28); {1,3,6} is Midday pos 1 + All-Day pos 1; {3,5,6} is Midday pos 6 + All-Day pos 5. None of the six board sets (nor the double) drew anywhere 9/4–9/6 — every leg is clear of the 3-day post-hit window and no prior ride is closed by convention. Prior day: 9/6 midday K6 went 1/6 ({1,5,6}); 9/6 All-Day 2/6, all box.

### Positions — full midday board (33 draws, $8.25/unit), every leg 2S + 3B ($41.25/leg), placed 9/7 AM — total $206.25

| Combo (straight order) | Set | Provenance | Units | Cost | If straight hits | If box-only hits |
|---|---|---|---|---|---|---|
| **518** | {1,5,8} | On all three boards (Mid pos 4 / All-Day pos 3 / Eve pos 5); midday history 158:9 / 185:9 / 518:5 — 518 is the engine midday best order; last midday 8/30 AZ, 6 state draws in 30d; p_hit 16.8% | 2S + 3B | $41.25 | $562.50 | $112.50 |
| **316** | {1,3,6} | Mid pos 1 (overdue tag, 22 midday draws since 8/16 WI) + All-Day pos 1; cross-reference is the basis, overdue measured flat; midday orders 631:9 / 361:6 / 316:4; p_hit 16.5% | 2S + 3B | $41.25 | $562.50 | $112.50 |
| **635** | {3,5,6} | Mid pos 6 + All-Day pos 5; last midday 9/3 AR (clear of block), 5 in 30d; strongest order skew on the board — 536 drew 13 of 37 midday (engine best order 635); p_hit 18.4% | 2S + 3B | $41.25 | $562.50 | $112.50 |
| **682** | {2,6,8} | Mid pos 5, DI rank 1, indicator 0.942, most-drawn midday set over 180d (39; 7 in 30d), last 8/31 MS; caveat: TD 696 / CO 0.97 = the 6/6 popularity-ceiling quadrant (16%, n=25, hypothesis-grade); midday orders 862:14 / 628:8; p_hit 17.7% | 2S + 3B | $41.25 | $562.50 | $112.50 |
| **118** (double) | {1,1,8} | Not on any board; built from the triple-overlap digits 1 and 8 (digit 1 in 3 of 6 midday sets); 18 midday draws in 180d (top third of 90 doubles), 7 in 30d (3rd among doubles), last midday 9/3, clear of block; drew evening 9/4–9/6 twice (LA 811, W.Canada 118); orders 118:8 / 181:6 / 811:4; doubles fallback p ≈ 7.8% (pre-halved scope base) | 2S + 3B | $41.25 | $675.00 | $225.00 |

Alternates named at brief time (not placed): 473 {3,4,7} (Mid pos 3, p_hit 19.3%) in place of 682; 511 {1,1,5} as the double.

### Session math (uniform baseline — standing BUG-162 / SIGNAL-INFO-01 truth)

- Singles: ~18% P(≥1 box) each on 33 draws, ~3.2% straight. Double 118: ~9.5% box / ~3.2% straight (3 of 1000 outcomes per draw); book pays the 3-way box at $75/unit — confirm before sizing.
- All five legs together: ~59% P(≥1 box), ~15% P(≥1 straight), ~41% blank session.
- Staked: **$206.25** (5 legs × $41.25). Expected session ≈ −$21 at 90% RTP. A single box-only hit ($112.50) does not cover the ticket; a single straight ($562.50) or a boxed double plus any single does.
- EV framing: all products ≈ 90% RTP; selection chose *which* combos, not the rate. No positional filter (ENG-MIDDAY-POS-02). Calibration payload = 7/24 fit (9/1 refit failed its gate, kept by ruling).
- Ride convention: max bet, ride until hit, max 3 days; a hit closes the leg. 518, 316 and 635 are also live on tonight's boards (518 on Evening pos 5; 316/635 via All-Day) if ridden.

### Resolution — pending (results import ~4:30pm ET; reconcile vs histories 2026-09-07 session=midday)

| Leg | Result | Payout |
|---|---|---|
| 518 | — | — |
| 316 | — | — |
| 635 | — | — |
| 682 | — | — |
| 118 | — | — |

## 2026-09-03 — midday session (Thursday board, ~33 midday draws → $8.25/unit)

Slate basis: 9/3 K6 (workflow run 12:29am ET, engine v2.1, edge v53). Boards are all singles on every scope; Midday ∩ All-Day share no set today, so the cross-reference comes from pairs and from the evening board. Prior night for context: 9/2 evening — operator's own picks 106 and 654 both boxed (SC 016, WI 645), 2 of 3; the evening K6 itself went 0/6 and the only board set to land was FL 236 (midday r6).

### Positions — full midday board (~33 draws, $8.25/unit). Units not stated at log time — fill in from the ticket.

| Combo (straight order) | Set | Provenance | Units | Cost |
|---|---|---|---|---|
| **385** | {3,5,8} | All-Day r1 (overdue) + Evening r2 = set-level convergence; pair {5,8} → midday 825, pair {3,5} → midday r1 354; 385 = engine best order on both boards | — | — |
| **825** | {2,5,8} | Midday r4; its {5,8} pair is the only pair on Midday that also sits on two All-Day sets (385, 058); 6 midday draws in 30d (at expectation) | — | — |
| **146** | {1,4,6} | All-Day r6 + Evening r6 = set-level convergence; digit spread vs a third 5-8 set; 146 = engine best order on both boards | — | — |
| **335** (double) | {3,3,5} | Deep-scope doubles read (within-class): All-Day doubles #1 (z +2.4, PBURST flag), Midday DGC flag (z +2.3), 4th-longest midday gap (1228 draws, last 7/26 IN 533); all-session 27 vs 19.9 expected (1.36x); order 335:11 / 353:9 / 533:7 | — | — |

### Session math (uniform baseline — standing BUG-162 / SIGNAL-INFO-01 truth)

- Singles: ~18% P(≥1 box) each on 33 draws, ~3.2% straight; the three singles together ~45% any box / ~9% any straight.
- Double 335: ~9.4% box / ~3.2% straight (3 of 1000 outcomes per draw). Book pays a 3-way box at its own rate — confirm before sizing.
- EV framing: all products ≈ 90% RTP; selection chose *which* combos, not the rate. No positional filter (ENG-MIDDAY-POS-02 retired it 9/1).
- Ride convention: max bet, ride until hit, max 3 days; a hit closes the leg. 385 and 146 are also explicitly live on tonight's Evening board if ridden.

### Resolution (results imported; verified vs histories 2026-09-03 ~4:29pm ET — board ran 33 midday draws)

| Leg | Result | Payout |
|---|---|---|
| 385 | 0 — {3,5,8} absent from all 33 midday draws | $0 |
| 825 | 0 — {2,5,8} absent | $0 |
| 146 | 0 — {1,4,6} absent | $0 |
| 335 (double) | 0 — {3,3,5} absent | $0 |

**0/4. Net = −(units × $8.25) — units still pending from the ticket.** The boards themselves: Midday K6 1/6 (r5 567 boxed NM 576), All-Day K6 1/6 (r4 **249 STRAIGHT** TN 249, engine best order) — 249 leg CLOSED by convention (it was never an operator leg; not re-bettable tonight under hit-closes-leg). All four operator legs unhit → eligible to ride into 9/3 evening (385 = Evening r2 + All-Day r1; 146 = Evening r6 + All-Day r6; 825 and 335 carry no evening-board presence). Blank session was priced at ~50% pre-placement (~45% any-box on the three singles ⊕ ~9% on the double) — ordinary-bad, not an anomaly.

## 2026-07-26 — evening session (Sunday board)

Slate basis: 7/26 K6 (workflow run 9:28am ET, engine v2.1). Sunday board: TX (×2) + WV dark → **~39 evening draws, $9.75/unit**. Midday (27-draw Sunday board): midday K6 0/6 (2nd straight — tripwire watch if Monday repeats); allday r1 {1,4,6} boxed AZ midday 416 → **146 leg CLOSED by convention** (day 2, no payout — wager was evening-board only; same structural forfeit as {2,3,5} on 7/22).

### Core position — full evening board (~39 draws, $9.75/unit)

| Combo (straight order) | Provenance | Units | Cost | If straight hits | If box-only hits |
|---|---|---|---|---|---|
| **195** {1,5,9} | **RIDE day 2 of 3** (opened 7/25); ad r3 today, 90d top-10 = 13 (**DC:4**, NM:3) | 3S + 4B | $68.25 | $825 | $150 |
| **706** {0,6,7} | fresh leg replacing closed 146; **T1 Standout × Convergence** (ad r6 + mid r5), 90d top-10 = 15 (NY:3, TN:3), engine 14d = 6 | 3S + 4B | $68.25 | $825 | $150 |

### Night totals

- Staked: **$136.50** at 39-draw pricing
- P(≥1 leg boxes tonight): ~37% (each ~20% on the 39-draw board) · P(≥1 straight): ~7%
- EV framing (standing BUG-162/SIGNAL-INFO-01 truth): all products ≈ 90% RTP; expected night ≈ −$13.65. Footprint/convergence chose *which* combos, not the rate.
- Ride convention: max bet, ride until hit, max 3 days; hit closes the leg. 195 must hit by 7/27 evening or it expires.

### Resolution (results imported; verified vs histories 2026-07-27 — board ran 40 draws, one over the 39 estimate)

| Leg | Result | Payout |
|---|---|---|
| 195 (3S+4B) | 0 — {1,5,9} absent from all 40 evening draws | $0 |
| 706 (3S+4B) | **BOX — DE drew 760** (bet order 706, so box only) | **$150.00** (4B × $37.50) |

**Net: +$13.50** at the logged 39-draw stake ($136.50); if the book charged the live 40-draw board ($140.00), net +$10.00 — confirm ticket cost. **706 leg CLOSED by hit** (convention). **195 unhit through day 2 — 7/27 evening is its final ride day (day 3 of 3), then it expires.** First positive night in the log (7/22 −$407.75, 7/25 −$147.00, 7/26 +$13.50).

## 2026-07-25 — evening session

Slate basis: 7/25 evening K6 + allday K6 (workflow run 5:05am ET, engine v2.1). Midday (33 draws): midday K6 0/6; allday r2 {1,4,5} boxed (AR 154) and r5 {0,2,4} hit **straight** (CT 240, engine best order) — both legs closed by convention, excluded tonight.

### Core position — full evening board (~42 draws, $10.50/unit; last Saturday ran 43 → $10.75/unit, confirm at placement)

| Combo (straight order) | Provenance | Units | Cost | If straight hits | If box-only hits |
|---|---|---|---|---|---|
| **146** {1,4,6} | **ev r1 + ad r1 double rank-1**, overdue both scopes; 90d top-10 = 10 (NE:3, TN:2); 7/22 core loser — fresh leg on new-slate evidence | 3S + 4B | $73.50 | $825 | $150 |
| **195** {1,5,9} | ad r6, 90d top-10 = 13 (**DC:4**, NM:3); highest live p tonight ~24% (allday CALIB-02 p_hit 39.0% conditioned on midday blank); DC in early-13 pool → early read by ~7:45pm | 3S + 4B | $73.50 | $825 | $150 |

### Night totals

- Staked: **$147.00** at 42-draw pricing ($150.50 if board is 43)
- P(≥1 leg boxes tonight): ~37% (146 ~17%, 195 ~24%, independent-ish) · P(≥1 straight): ~7%
- EV framing (standing BUG-162/SIGNAL-INFO-01 truth): all products ≈ 90% RTP; expected night ≈ −$14.70. Convergence/footprint chose *which* combos, not the rate.
- Ride convention: max bet, ride until hit, max 3 days; hit closes the leg.

### Resolution (results imported; verified vs histories 2026-07-26)

| Leg | Result | Payout |
|---|---|---|
| 146 (3S+4B) | 0 — {1,4,6} absent from all 42 evening draws | $0 |
| 195 (3S+4B) | 0 — {1,5,9} absent from all 42 evening draws | $0 |

**Net: −$147.00.** Both legs unhit → eligible to ride (day 2 of max 3) into 7/26 evening.

## 2026-07-22 — evening session

Slate basis: 7/22 evening K6 + allday K6 (backfilled prod-parity chain, OPS-04). {3,5,6} and {2,3,5} excluded — drew midday 7/22 (NY 635 straight on allday r6; SC 532), legs closed by convention.

### Core position — placed ~5:30pm ET, full 42-draw board, $294.00

| Combo (straight order) | Provenance | Units | Cost | If straight hits | If box-only hits |
|---|---|---|---|---|---|
| **146** {1,4,6} | ev r2 + ad r3, both DI top-20, CO 1.000 | 3S + 4B | $73.50 | $825 | $150 |
| **564** {4,5,6} | ev r3 + ad r5, ev DI 5, energy 99 | 3S + 4B | $73.50 | $825 | $150 |
| **965** {5,6,9} | ev r1 (overdue ds 11), ev DI 9 / ad DI 26 | 3S + 4B | $73.50 | $825 | $150 |
| **150** {0,1,5} | ad r4, DI ad 16 / ev 22, evening-scope order | 3S + 4B | $73.50 | $825 | $150 |

### Early-pool hedge — placed ~6:00pm ET, early-13 draws only (resolve 6:25–7:45pm), $113.75

| Combo | Provenance | Units | Cost | If hits (early pool) |
|---|---|---|---|---|
| {3,6,7} | ev DI **#1** (6 perms in top-12); rode slates 7/20+7/21, stale2-rotated | 8B | $26.00 | $300 box |
| {4,6,9} | ad DI **#1**, ds 18; rode 7/20+7/21, rotated | 8B | $26.00 | $300 box |
| {3,4,7} | ev K6 r4, ev DI 11 | 8B | $26.00 | $300 box |
| {0,5,7} | ev K6 r5, ev DI 20 | 8B | $26.00 | $300 box |
| **637** straight | unanimous ev best order across all 6 DI perm rows | 3S | $9.75 | $675 (+$300 boxes = $975 total) |

### Bonus hedge — $25 DRY POWDER, decision point 8:26pm ET (post-early-pool, pre-AZ 8:45)

Branch plan agreed ~6pm:
- **Early hedge missed (all 4 unhit, ~72%)** → place as designed: 3B × {3,6,7} late-29 ($21.75) + optional $3.25 13-draw box {4,6,9} on the 9:15–10:14 block. AZ included since placement beats the 8:45 cutoff.
- **One hedge combo boxed early (~27.6%, $300 banked)** → that leg CLOSED per convention; redeploy decision at 8:26 with $325 in hand (default lean: bank ≥$200, late-pool ≤$125 on remaining unhit convergents).
- **637 straight early ($975)** → bank it; night objective exceeded, no redeploy.

### Night totals

- Staked: $294.00 + $113.75 (+ bonus ≤ $25) ≈ **$430**
- P(≥1 early-pool hedge hit, known by ~7:46pm): ~27.6% → $300–975 roll capital before FL 9:15 / CA 9:15 / NY 10:00 / IL 10:05
- P(≥1 core hit across 42 draws): ~59% (any) / ~14% (straight)
- P(complete blank night): ~30% pre-bonus
- EV framing (standing BUG-162/SIGNAL-INFO-01 truth): all products ≈ 90% RTP; expected night ≈ −$43; convergence chose *which* combos, it does not change the rate.

### Resolution (results imported 2026-07-23 ~4:30am ET, 43 evening draws)

| Leg | Result | Payout |
|---|---|---|
| Core 146 / 564 / 965 / 150 | 0/4 — no box or straight in any of 43 evening draws | $0 |
| Hedge 367 / 469 / 347 / 057 / 637S | 0/5 in early-13 pool | $0 |
| Bonus (branch A: 3B×367 late-29 + opt. 469 — confirm if placed) | {3,6,7} and {4,6,9} absent from late-29 too | $0 |

**Net: −$407.75** (−$429.50 if bonus placed per branch A). Blank night was priced at ~30% pre-bonus — an ordinary-bad outcome, not an anomaly.

### Post-mortem (2026-07-23)

- **The slates were not blank — the selection layer was.** Allday K6 went **3/6** on the day: r1 {2,3,5} (SC midday), r2 {5,6,8} (**boxed twice in the evening** — MI 658, W.Canada 586), r6 {3,5,6} (NY 635 straight midday). Evening K6 went 0/6. The four core combos were exactly the allday misses (r3 146, r4 150, r5 546) plus ev r1 965 — the convergence filter (ev∩ad + DI support) kept the losers and dropped the one live evening pick, {5,6,8}, because it sat on the allday+midday slates (both r2) but not the evening K6. Per SIGNAL-INFO-01 convergence has no edge either way; one night of anti-selection is symmetric noise, not a signal to invert. Recorded, not actionable.
- **The exclusion convention cost one box.** {2,3,5} was closed after SC 532 midday — then drew again at DC evening (235 straight). At core sizing (4B) that repeat was a forfeited $150. EV-neutral by design (every skipped bet saves ~10% vig), but note the structural interaction: allday-sourced picks are *defined* to hit on any draw of the day, so a midday hit closing the leg forfeits exactly the evening exposure the allday scope exists to capture. Same-day repeats also occurred for {1,5,6} (MI midday → AR evening 615) and {1,2,5} (CA and ON both drew 152 straight). One night; do not re-litigate hotness (anti-predictive, confirmed 3×).
- **Near-miss texture:** AR 615 {1,5,6} brushed three of four core combos 2-of-3. Core sets averaged ~6–7 two-digit brushes each across 43 draws — normal density, feels closer than it is.
- **Digit skew:** 8 tied for hottest digit (in 17/43 draws); none of the 8 bet combos contained an 8. Not predictable ex-ante, just explains the texture.
- **Base rates intact:** evening 0/6 slates occurred 3 of the last 8 days (7/16, 7/19, 7/22); allday has ≥1 hit every day this week. No tripwire condition met.
