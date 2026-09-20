# STAT-01 — PHASE 1 + 2 REPORT (ledger + analytic base rate) · 2026-09-20

**FIRST LINE (order §4a): observed sits AT expectation. Over the whole surviving history (374 stored boards, 18,264 graded draw events) the three boards produced 632 box matches against a composition-matched analytic expectation of 643.5 — crude lift 0.98. Straights 110 observed vs 109.4 expected — crude lift 1.00. Days with at least one match, pooled: 287 of 374 board-days vs 296.5 expected.** Nothing in Phase 2 shows the engine above its own base rate. ⚠ All z values below are CRUDE (independent-draws, unconditional null) and exist only to answer "is Phase 3 worth its cost" — they are not the result and are not to be quoted (D6).

**Status:** Phase 1 ledger BUILT and hash-reproduced; Phase 2 computed in closed form; pre-registration DRAFTED (`docs/stat01/preregistration_v1.md`); **Phase 3 has NOT run**, DUE-01 has NOT been computed. Engine untouched. Nothing committed yet by this phase (parent commits).

---

## PHASE 1 — THE LEDGER (R3)

**Script:** `scripts/stat01/build-ledger.ts` — rebuild-from-source only (`slate_snapshots` all rows incl. soft-deleted + `histories`; nothing else). Output `docs/stat01/ledger.csv` (RFC-4180; the tri-state code "ME,NH,VT" is quoted) + `docs/stat01/ledger_manifest.json`.
**Content hash (sha256 of the CSV bytes): `ccf04b08af359fdd910de55be00d5dbf27d25a102749e69f6ff819fbef4e7525`** — identical on two consecutive builds.

| Count | Value |
|---|---|
| Rows in (every (scope, date, draw_event) 4/18→9/19) | **22,776** |
| Rows excluded | 4,512 — `no_board_stored` 3,844 · `timestamp_after_draw` 668 · all other reasons 0 |
| **Rows surviving** | **18,264** |
| Board keys in window (155 dates × 3) | 465 |
| **Boards surviving** | **374** (midday 123 · evening 128 · All-Day 123) — 58 of them taken from a soft-deleted pre-cutoff snapshot under a later regen (G4), including all three 5/1 boards, which the live store lacks entirely |
| Boards excluded `no_board_stored` (G1) | 78 = the 26 backfill-only dates × 3 (6/15, 6/19–23, 6/30–7/8, 7/11–7/22) — the 3 backfill keys with a pre-draw original are substituted, not excluded |
| Boards excluded `timestamp_after_draw` | 13: 4/18 midday+All-Day (15:13 ET) · 5/11 ×2 (14:01 ET) · 5/17 ×2 (10:06 ET) · 5/18 ×2 (10:53 ET) · 6/18 ×3 (written 20:06 ET) · 7/9 ×2 (11:13 ET) |
| **G4 margin** (excluded by the fixed 10:00 cutoff alone; snapshot within 60 min after it) | **4** (5/17 ×2, 5/18 ×2) — the cost of the conservative cutoff |
| Excluded by the data-derived guard only | 0 (draws are imported the next morning; the fixed cutoff is always the binding one) |
| Keys with no draws in pool | 0 |
| Draw-store anomalies (bad session / bad digits / comboset ≠ sorted digits) | 0 / 0 / 0 |
| Pick anomalies (`bestOrder` set ≠ `comboSet`, or `combo` set ≠ `comboSet`) | 0 |
| Surviving picks | 2,241 (`bestOrder ≠ combo` on 450) |

**Composition of the 374 surviving boards** (n_sixway/n_double/n_triple): 6/0/0 ×307 · 5/1/0 ×37 · 4/2/0 ×25 · 3/3/0 ×2 · 5/0/0 ×3 (five-pick boards). Mean per-draw board probability under the class null = **0.0352** (six-way skew 96.7%; the composition trap of §2 is real and the null is per-board matched).

**ACTUAL draws per board-day (surviving boards):** midday **31.9** (monthly 31.5–32.4) · evening **41.5** (41.1–42.5) · All-Day **73.4** (72.7–74.9). Jurisdictions graded: 39 codes.

**Scope overlap (0.2c answered):** the All-Day board is graded against the union of the two session pools — the same draw events the session boards are graded against, with different boards. The ledger keeps three separate board-rows per date and never pools them into a single "matches" number without the split (G2).

**`histories_unique` collapse:** production grades whatever rows exist; so does the ledger. Same-digits-same-bucket-same-day repeats are one event. Known under-count on both sides of the comparison.

## PHASE 2 — THE ANALYTIC BASE RATE (closed form; §2.1–2.2)

Per surviving row, null p = exact sum over the board's picks of class p (.006 six-way / .003 double / .001 triple); straights = distinct ordered picks / 1000. Days-with-≥1 expectation = Σ over board-days of 1 − Π(1 − p). **z = crude Poisson, DO NOT QUOTE.**

### Primary window 2026-04-18 → 2026-09-19

| Scope | Boards | Draw events | BOX obs | BOX exp | lift | crude z | per-1k obs / exp | STRAIGHT obs | exp | lift | crude z | days≥1 box obs / exp / of | days≥1 str obs / exp |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| All-Day | 123 | 9,029 | 326 | 318.9 | 1.022 | +0.40 | 36.1 / 35.3 | 56 | 54.1 | 1.035 | +0.26 | 112 / 114.1 / 123 | 46 / 43.9 |
| Midday | 123 | 3,923 | 114 | 138.2 | 0.825 | −2.06 | 29.1 / 35.2 | 17 | 23.5 | 0.723 | −1.34 | 79 / 83.6 / 123 | 17 / 21.4 |
| Evening | 128 | 5,312 | 192 | 186.5 | 1.030 | +0.41 | 36.1 / 35.1 | 37 | 31.8 | 1.162 | +0.92 | 96 / 98.8 / 128 | 34 / 28.3 |
| **Pooled (3 boards)** | **374** | **18,264** | **632** | **643.5** | **0.982** | −0.46 | 34.6 / 35.2 | **110** | **109.4** | **1.005** | +0.05 | 287 / 296.5 / 374 | 97 / 93.6 |

Any-board-per-calendar-day (128 dates with ≥1 surviving board): expected straights/day **0.855**; days with ≥1 straight on any board **73 observed vs 73.1 expected**; days with ≥1 box match on any board 124 vs 126.1.

### Secondary window 2026-07-23 → 2026-09-19 (corroborated era)

| Scope | Boards | Draw events | BOX obs | exp | lift | crude z | STRAIGHT obs | exp | lift | crude z | days≥1 box obs / exp / of |
|---|---|---|---|---|---|---|---|---|---|---|---|
| All-Day | 59 | 4,356 | 168 | 156.8 | 1.071 | +0.89 | 24 | 26.1 | 0.918 | −0.42 | 54 / 55.0 / 59 |
| Midday | 59 | 1,898 | 61 | 68.3 | 0.893 | −0.89 | 8 | 11.4 | 0.702 | −1.00 | 40 / 40.8 / 59 |
| Evening | 59 | 2,458 | 100 | 88.5 | 1.130 | +1.22 | 19 | 14.7 | 1.288 | +1.11 | 46 / 46.2 / 59 |
| **Pooled** | **177** | **8,712** | **329** | **313.6** | **1.049** | +0.87 | **51** | **52.3** | **0.976** | −0.18 | 140 / 142.0 / 177 |

Any-board-per-day (59 dates): straights/day expected 0.886; days with ≥1 straight 32 obs vs 34.7 exp; days with ≥1 box 58 vs 58.7.

Primary and secondary agree in kind (pooled 0.98 vs 1.05; both inside crude ±1σ); no disagreement to report about the Apr–Jul store on the primary statistic. Midday is below expectation in both windows (0.83 / 0.89), evening above in both (1.03 / 1.13) — crude, pre-registered two-sided secondaries will read them properly; MASTER_AUDIT already carries the midday cold streak as closed-variance.

### "148" / "29 of 30" — the record reel's window reproduced with the split (G2 copy rule)

Window 2026-08-20 → 2026-09-18 (the 9/18 record_public reel), 90 surviving boards:

| | All-Day | Midday | Evening | Pooled | Exact-order | Days ≥1 (any board) | Jurisdictions |
|---|---|---|---|---|---|---|---|
| Reel rendered (stored flags, live boards) | 75 | 29 | 55 | **159** | 15 | 29 of 30 | 38 |
| Ledger re-graded (G4 boards) | 79 | 29 | 55 | **163** | 16 | 29 of 30 | 39 |
| Crude expectation (class null) | — | — | — | **159.1** | 26.5 | **29.9** of 30 | — |

So "148" (an earlier window) and "159" were pooled three-board counts, and the pooled count sits at the chance baseline; "29 of 30 days" is the baseline (expected 29.9). Per-board: All-Day ≈ half the pooled figure. The 4-row delta between reel and ledger is explained, not interpreted: (i) +4 All-Day = same-day multi-state matches of one pick where `adaptive_tracking` stores only one state — 8/26 `571` (SC stored, MS midday missing), 9/3 `249` (TN stored, AZ missing), 9/14 `140` (NM stored, AZ and TX missing); the stored flags under-record these, the ledger re-grades from draws; (ii) 8/27 All-Day: G4 substituted the 10:23 ET pre-draw original (carries {0,7,9} → matched `709` ON) for the 17:46 ET post-draw regen the reel used (carries {0,1,7} → matched `071` DE): −1 +1. ⚠ (i) is an observation about the stored-flag store for the parent to file separately; not fixed here (D1/D8).

### Straights — two-sided read (Addition B) and the definition check
Whole-history straights are AT expectation (110 vs 109.4; secondary 51 vs 52.3). The record window's 16 vs 26.5 crude is a 30-day slice of a 155-day series at lift 1.00 — window fluctuation, not a deficit to explain. Definition checks run anyway: grading straights against `combo` instead of `bestOrder ?? combo` gives 109 (no change in kind; 450 of 2,241 picks diverge); straight ⇒ box holds on every row (0 violations); the `histories_unique` collapse removes events from observed and expected alike. Midday straights 17 vs 23.5 (crude z −1.3) is inside noise and gets its two-sided permutation read in Phase 3.

### 0.5 strike instrument, re-referenced (Addition B)
Correct reference for the verify reel (three boards, ~18 ordered picks against overlapping pools): expected straights/day 0.855–0.886, P(≥1 straight on some board that day) ≈ 0.57–0.59 (expected 73.1 of 128 days). Observed days-with-≥1-straight: 73 of 128 (0.570). The logged strike fraction 0.45 (31 run-days) is the same instrument over a shorter, retention-limited window. ⚠ Smoke test only; no conclusion.

## Is Phase 3 worth its cost? (the only question Phase 2 answers)
Feasibility is seconds. The crude read is null in both windows. Phase 3 is still warranted for the reasons the content agent gave: a permutation CI over STORED boards (not replayed ones) is the statement nobody has, the per-scope two-sided secondaries settle the midday/evening asymmetry properly, and DUE-01 tests the axiom itself. Recommendation: approve the pre-registration and run.

## Data / definition anomalies surfaced (report only — nothing fixed)
1. `adaptive_tracking` holds one `matched_state` for picks that matched in more than one state the same day (3 picks / 4 rows in the record window alone) — the stored flags under-count multi-state matches. Affects the track-record screen and record reel counts (both read stored flags), not this study.
2. The live store lacks any 5/1 board; three pre-cutoff 5/1 boards exist soft-deleted and are used by the study (G4).
3. `datasets_box.times_drawn` has no as-of history (imported aggregate, overwritten in place) → DUE-01 times-drawn ranking is not reconstructible without inventing a definition (G8).

## GATE QUESTIONS OWED BACK (Phase 1+2 → Phase 3)
- **G7 — Approve `docs/stat01/preregistration_v1.md` as written?** Specifically: seed 20260919, numpy PCG64, R = 100,000 (+10,000 prefix), bootstrap over board-days for the lift CI, planted-edge construction in §5(c), BH q = 0.05 for the per-jurisdiction secondary. On approval the parent commits it and reports the hash; Phase 3 runs once against that hash.
- **G8 — DUE-01 times-drawn:** run draws-since only (recommended), or rule that a histories-derived appearance count is an acceptable stand-in for the engine's imported `times_drawn` (it is a new definition and Addition A forbids inventing one)?
- **G9 — Ledger acceptance:** accept hash `ccf04b0…e7525` with the 13 `timestamp_after_draw` exclusions and the 4-board G4 margin as frozen (D2)?
- **G6 (still open):** verified W.Canada membership → 40 or 41; the placeholder in pre-registration §9 is filled by the parent, not by this phase.
