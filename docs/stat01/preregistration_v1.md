# STAT-01 — PRE-REGISTRATION v1 (DRAFT — NOT YET APPROVED, NOTHING HAS RUN)

**Status:** DRAFT delivered at the Phase 1+2 gate (Addition C). Phase 3 does not run until the content agent approves this text and the commit hash of the approved version is reported back. Any later change to the statistic, null, window or exclusions is a NEW pre-registration reported as a second test, never a correction to this one (order §3.1, D3, D4).

**Study:** Does the ZK6 engine's published board match the actual Pick 3 draws more often than a randomly chosen board of the same class composition, graded against the same draws? (order §1: H0 conditional on composition; draws held fixed; only our choice is resampled. No assumption that draws are uniform, independent or random.)

## 1. Inputs (frozen)
- **Ledger:** `docs/stat01/ledger.csv`, built by `scripts/stat01/build-ledger.ts` from `slate_snapshots` (all rows, soft-deleted included) and `histories` only. **sha256 = `ccf04b08af359fdd910de55be00d5dbf27d25a102749e69f6ff819fbef4e7525`**, 22,776 rows in / 4,512 excluded / **18,264 surviving**; 374 surviving boards. Reproduced byte-identically on two consecutive builds (2026-09-20). Phase 3 reads this file and never the database.
- **Grain:** one row per (board, draw_event). Distinct box classes on one board are disjoint against a single draw, so a row carries at most one box match and Σ box_match is exactly the match count.
- **Board selection (G4, frozen):** for each (scope, date) the study board is the LATEST snapshot written before the cutoff — 10:00 ET midday and All-Day, 18:00 ET evening — whether or not it was later soft-deleted; `deleted_at` is ignored. A board also fails if it was written after the first `imported_at` of that day's graded draws (data-derived guard). Timestamps are `updated_at_et` (UTC despite the suffix); whole window is EDT.
- **Exclusions (G1, G4; closed enum):** `no_board_stored` — 78 boards (backfill-only keys: the engine was re-run after the draw; G1) · `timestamp_after_draw` — 13 boards (no pre-cutoff snapshot: 4/18 ×2, 5/11 ×2, 5/17 ×2, 5/18 ×2, 6/18 ×3, 7/9 ×2) · `timestamp_missing`, `non_official_source`, `grading_era_change`, `jurisdiction_gap` — 0. The G4 margin (excluded by the fixed 10:00 ET cutoff alone, snapshot written within 60 min after it) = 4 boards (5/17, 5/18 midday + All-Day). These exclusions are frozen; nothing is added or removed after a result is seen (D2).
- **Grading rule (fixed, identical to production `run-hit-detection/index.ts:354-368`):** box = `comboset_sorted == comboSet`; straight = `result_digits == (bestOrder ?? combo)`; All-Day board graded against every draw on its date, session boards only against their own session. Stored hit flags are never read (BUG-162).
- **Windows (G5):** PRIMARY 2026-04-18 → 2026-09-19 (whole surviving history, no era cut). SECONDARY 2026-07-23 → 2026-09-19 (the corroborated era: zero backfills, independent publish-time evidence from reel rows, run logs and commits). If primary and secondary disagree materially, the secondary is the trusted one and the disagreement is reported as a finding about the Apr–Jul store.

## 2. Provenance caveats (verbatim, G3 + addendum)
- "Draw rows were manually transcribed from Lottery Post (aggregator). Provenance is uniform but unverified per row; observed and null are graded against the same rows."
- The draw store carries no source column; provenance is unrecorded for all rows. Any error in the store is an error in both the observed statistic and the null.
- `histories_unique = (jurisdiction, game, date_et, session, result_digits)`: two draws of the same digits in the same session bucket on the same day collapse to one stored row. Known under-count, affecting observed and null alike; graded here exactly as production grades it.
- The store records no draw time. `result_at` is empty in the ledger; the lookahead guard uses fixed ET cutoffs plus `imported_at`.

## 3. Primary statistic
**S = total BOX matches across all surviving ledger rows (all three boards, all dates).** S_obs from the ledger = **632** (already visible from Phase 2 — the value is fixed before the null is drawn; it cannot be revised).

## 4. Null construction (composition-matched, draws held fixed; order §3.4, G2)
For replicate r = 1..R: for every surviving board independently, draw a replacement board of DISTINCT box classes with EXACTLY the published board's composition (n_sixway, n_double, n_triple; and the same pick count — 6, or 5 for the three five-pick boards), sampled uniformly without replacement within each class stratum (120 six-way, 90 doubles, 10 triples); grade the replacement against the SAME draw pool the published board was graded against (its own scope's pool on its date, with the same exclusions). S*_r = total box matches for replicate r. Because each board is replaced independently and graded against its own pool, the All-Day/session pool overlap is reproduced identically under the null and cancels in the comparison.

**Decision rule:** p = (1 + #{r : S*_r ≥ S_obs}) / (R + 1). One-sided (H1 = engine exceeds the null) for the primary. Never reported as 0.
**R = 100,000**, with the R = 10,000 prefix also reported. **RNG: numpy `default_rng(PCG64)`, seed = 20260919.** Implementation: `scripts/stat01/permutation-test.py` (vectorised: precomputed `counts[board_day, 220]`; one gather-sum per replicate).
**Effect size (D5, §3.7), reported beside every p:** lift = S_obs / mean(S*); bootstrap 95% CI over board-days (B = 10,000, same seed stream) for the lift; absolute excess matches over the window; matches per 1,000 graded draws, observed vs null mean.

## 5. Sanity nulls — run and reported as DATA before the real result is looked at (§3.6)
- **(a) Random-board input:** replace our boards with randomly generated boards of matched composition and run the full harness; repeat 100 times (seeds 1..100); report the DISTRIBUTION of the 100 p-values (histogram deciles, min, median, max). Must be approximately uniform.
- **(b) Self-test:** our own boards as the null source (each board replaced by itself); p must be ≈ 0.5.
- **(c) Planted edge:** copy our boards; on a random 5% of board-days (seed 20260919) force one pick to the box class of one actual draw in that board's pool; run the harness; report p and the recovered lift against the injected lift.
If any of (a)–(c) fails, the harness is broken and the real result is void.

## 6. Pre-registered secondaries — DESCRIPTIVE ONLY, never a second bite (§3.2, G2)
Each is the same harness restricted to a subset, reported with lift + CI and a TWO-SIDED p (Addition B):
1. All-Day boards only · 2. Midday only · 3. Evening only · 4. Straights, all boards (`bestOrder ?? combo`), null = each ordered replacement pick 1/1000 with composition matching as above · 5. Days-with-≥1-match, per scope and any-board-per-calendar-day · 6. Per-jurisdiction box lift (39 codes) with Benjamini–Hochberg adjustment at q = 0.05, reported with the note that the surface is ≈ 220 × 39 series and no per-jurisdiction extreme is a finding (§3.8, D10). Secondary window (7/23→9/19) for 1–5.

## 7. DUE-01 — the operator's axiom, tested directly (Addition A; NOT conditional on Phase 3)
- **Definition (the engine's own, not a new one):** the engine's `drawsSince` is `ds_raw` from `datasets_box`, H01Y horizon preferred (`engines/zk6.ts:240-247`, `compute-slate-zk6/index.ts:1278`), which `rebuild-datasets-zk6/index.ts:126-150` computes as **calendar days between today and the most recent `date_et` on which the box class appeared in the scope-filtered `histories`** (All-Day = all sessions, midday/evening = own session), within the horizon window. `scripts/backtest/replay.ts:293-314` is the as-of-date analogue of the same rule and is the one DUE-01 reproduces: for date d, scope s, class c: DS(c, s, d) = d − max{date_et ≤ d−1 : class c drawn in pool s}. Classes with no appearance in the store as of d−1 form a separate "unseen in store" bin (the store begins 2026-04-09 for the multi-state ledger; early-window values are left-censored by the store's start, exactly as the engine's were after DATA-01).
- **Test:** for every draw date d in 2026-04-18 → 2026-09-19 and scope s, rank the 220 classes by DS into deciles (ties broken by class key, fixed). For each decile k: expected_k = Σ_dates n_draws(s,d) × Σ_{c∈k} p_c; observed_k = number of draws in pool(s,d) whose box class ∈ k. Lift_k = observed_k / expected_k, with a 95% CI from a bootstrap over DATES (B = 10,000, seed 20260919 — dates are the independent unit). Reported per scope and pooled. Under H0 every decile sits at 1.0.
- **Times-drawn ranking:** ⚠ NOT reconstructible as-of-date from stored artifacts. `datasets_box.times_drawn` is an imported aggregate overwritten in place (`hooks/useDataIngestion.tsx`; the rebuild function only patches `ds_raw`); no history of its values exists, and a histories-derived count would be a new definition, which Addition A forbids. DUE-01 therefore runs on draws-since only unless the content agent rules otherwise (gate question G8).

## 8. Reporting rules
- Negative or null result stated in the FIRST LINE (§4a). No p without lift + CI (D5). Crude Phase 2 z never quoted (D6). Per-jurisdiction/per-combo extremes never a finding (D10). No output of this study writes to any live config, registry, caption or asset (D8). Engine untouched throughout (D1).
- The primary test runs ONCE against this file's approved commit hash. Its outputs (`docs/stat01/phase3_result.json`, sanity-null distributions as data) are committed alongside.

## 9. Coverage counting rule for P4 (G6, pre-registered text)
Graded jurisdiction codes in the ledger = 39. Honest member count = 32 US states + ME + NH + VT (the tri-state code expands to three states) + ON + QC = 37; the `W.Canada` code is the WCLC draw shared by AB, SK, MB = 40; 41 if BC's Pick 3 is the same draw. DC and the territories are not counted. Bare "40+ STATES" is retired (false under any honest count: 35 states). "40+ STATES & PROVINCES" is legal only if the verified count is ≥ 40.
**Verified count:** _[placeholder — being verified separately against the game operator; filled before P4 is proved]_

## 10. Prior evidence this study must cite (R6)
ENG-ALLDAY-RAND-01 (All-Day composition-matched base rate 36/1000, live replay ×1.00); ENG-REVIEW-01 and SIGNAL-INFO-01/02 (universe AUC 0.50); ENG-PERSTATE-P0 (no per-state substrate). All predict a null Phase 3. This study's contribution is stored boards, all scopes, a permutation CI, and DUE-01.
