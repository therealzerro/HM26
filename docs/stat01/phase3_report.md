# STAT-01 — PHASE 3 REPORT (composition-matched permutation test over stored boards + DUE-01)
**Filed:** 2026-09-20 evening · **Pre-registration:** `docs/stat01/preregistration_v1.md` approved on the G7 checklist, committed **`96561d092835834c37c44e0319d91aaf57e33899`** before any run (harness log-only follow-up `39c545f`) · **Inputs:** ledger sha256 `ccf04b08…4e7525` (frozen, G9), histories snapshot sha256 `02abe5c8…9c00b` · **Harness:** `scripts/stat01/permutation-test.py`, numpy PCG64 seed 20260919, R = 100,000 · **Output:** `docs/stat01/phase3_result.json`, run log `phase3_run.log` · Engine untouched. No copy changed by this report.

**p = 0.668 (one-sided), lift 0.984, 95% CI 0.90 – 1.07 for S = pooled box matches.** The stored boards matched 632 times; the composition-matched null averages 642.5 (sd 25.0; analytic expectation 642.6). The engine does not beat chance on the stored record. Excess matches −10.5 over 18,264 graded draws; 34.6 matches per 1,000 draws observed vs 35.2 under the null. R = 10,000 prefix gives p = 0.675 — same answer. **The result is null; it agrees with ENG-ALLDAY-RAND-01 (×1.00), ENG-REVIEW-01 and SIGNAL-INFO-01/02 (universe AUC 0.50).** Nothing else in this report changes that line.

## Sanity nulls (run and written before the real result was looked at — §5 of the pre-registration)
| Check | Result | Verdict |
|---|---|---|
| (a) Random-board input, 100 runs (board seeds 1..100, null seed 20260919+s), R = 100,000 each | p ∈ [0.012, 0.997], median 0.427; decile histogram 11 · 12 · 16 · 8 · 14 · 8 · 7 · 9 · 8 · 7; KS distance from uniform D = 0.119 (n = 100, 5% critical ≈ 0.136) | PASS — approximately uniform |
| (b) Self-test (each board replaced by itself) | null-path grading of our own boards = 632 = S_obs exactly; p by the ≥ rule 1.0, strict rule 1×10⁻⁵, mid-p 0.500 | PASS — see Disclosures |
| (c) Planted edge (19 board-days = 5%, one pick forced to a drawn class, seed 20260919) | S_planted 644 (+12 injected); injected lift 1.0035 (analytic) vs recovered lift 1.0035 (CI 0.92 – 1.09); p = 0.468 | PASS — recovered = injected to four decimals |

All three were written to `phase3_result.json` before the primary block ran (harness order; see `phase3_run.log`). The full 100-run p list is in the JSON.

## Primary — pooled box matches, all three boards, 2026-04-18 → 2026-09-19
| | Value |
|---|---|
| Boards / rows / graded draws | 374 / 18,264 / 18,264 |
| S_obs (box) | 632 |
| Null mean (sd) | 642.5 (25.0) — analytic 642.6 |
| Null quantiles 1/5/25/50/75/95/99 | 585 / 602 / 626 / 642 / 659 / 684 / 701 |
| p one-sided (+1 correction), R = 100,000 | **0.668** (R = 10,000 prefix: 0.675) |
| Lift = S_obs / mean(S*) | **0.984**, 95% CI over dates (B = 10,000) **0.900 – 1.067** |
| Excess matches | −10.5 |
| Per 1,000 graded draws, observed vs null | 34.6 vs 35.2 |

S_obs sits at the 34th percentile of the null. The permutation mean and the closed-form expectation agree to 0.1 matches, which is the sampler check the smoke run predicted.

## Secondaries (descriptive only — §6; lift + CI, two-sided p)
**Primary window 2026-04-18 → 2026-09-19**

| Secondary | S_obs | null mean | lift (95% CI over dates) | p two-sided |
|---|---|---|---|---|
| All-Day only (123 boards) | 326 | 318.7 | 1.023 (0.92 – 1.12) | 0.695 |
| Midday only (123) | 114 | 137.6 | 0.828 (0.69 – 0.97) | 0.042 |
| Evening only (128) | 192 | 186.2 | 1.031 (0.88 – 1.19) | 0.682 |
| Straights, all boards (`bestOrder ?? combo`, ordered null 1/1000 per pick) | 110 | 109.4 | 1.006 (0.83 – 1.19) | 0.978 |
| — straights All-Day / Midday / Evening | 56 / 17 / 37 | 54.1 / 23.5 / 31.8 | | 0.84 / 0.22 / 0.39 |
| Days with ≥1 box match — All-Day | 112 of 123 | 113.8 | 0.984 | 0.625 |
| Days with ≥1 — Midday | 79 of 123 | 82.5 | 0.958 | 0.559 |
| Days with ≥1 — Evening | 96 of 128 | 98.7 | 0.973 | 0.637 |
| Any board matched, per calendar day | 124 of 128 dates | 125.9 | 0.985 | 0.291 |
| Per-jurisdiction box lift, 39 codes, BH q = 0.05 | — | — | none significant; min p 0.0068 (KS: 7 obs vs 17.7 null, lift 0.40); next ID 1.46 (p 0.078), MN 1.55 (0.14), IN 0.63 (0.16), TN 0.74 (0.23) | 0 of 39 pass |

Midday at 0.83 with p = 0.042 is the same number Phase 2 showed crude (0.83); it is one of nine secondary two-sided tests here and is not corrected for that, is descriptive by the pre-registration, and sits in the direction of the engine matching LESS than chance — nobody's hypothesis. It is not a finding. "Any board matched on 124 of 128 dates" — the "29 of 30 days" figure — sits at its null mean of 125.9.

**Secondary (corroborated) window 2026-07-23 → 2026-09-19 — 177 boards, 8,712 draws**

| | S_obs | null mean | lift (95% CI) | p |
|---|---|---|---|---|
| Pooled box (descriptive here, one-sided p) | 329 | 312.9 | 1.052 (0.92 – 1.19) | 0.184 |
| All-Day / Midday / Evening | 168 / 61 / 100 | 156.4 / 68.4 / 88.1 | 1.074 / 0.892 / 1.135 | 0.37 / 0.40 / 0.21 (two-sided) |
| Straights all boards | 51 | 52.2 | 0.978 (0.71 – 1.25) | 0.947 |
| Days ≥1 — All-Day / Midday / Evening / any-board | 54/59 · 40/59 · 46/59 · 58/59 | 54.8 · 40.4 · 46.0 · 58.7 | 0.98 · 0.99 · 1.00 · 0.99 | 0.80 · 1.00 · 1.00 · 0.54 |

The two windows agree in kind: both CIs contain 1.0, the point estimates straddle it (0.98 whole-history, 1.05 corroborated era). No material disagreement, so the primary stands as the trusted number.

## DUE-01 — the operator's axiom, tested on the engine's own draws-since definition (G8: draws-since only)
Times-drawn ranking: NOT reconstructible as-of-date — `datasets_box.times_drawn` is an imported aggregate overwritten in place with no history; not run, per G8.
**Setup.** Draws-since as-of d−1 from the frozen histories snapshot (store starts 2026-04-09; left-censored exactly as the engine's were after DATA-01). Deciles formed WITHIN stratum over classes seen as-of d−1; D1 = most overdue, D10 = most recently drawn; unseen classes in their own bin. Statistic = observed draws ÷ expected (n_draws × Σ p_class), bootstrap CI over dates (B = 10,000, seed 20260919). 155 dates per scope; graded draws All-Day 11,388 · Midday 4,946 · Evening 6,442.

**Six-way — PRIMARY READ, pooled across the three scope series (top decile first)**

| Bin | observed | expected | lift | 95% CI |
|---|---|---|---|---|
| D1 (most overdue) | 1,575 | 1,636.0 | 0.963 | 0.909 – 1.019 |
| D2 | 1,594 | 1,634.1 | 0.976 | 0.930 – 1.022 |
| D3 | 1,631 | 1,633.4 | 0.999 | 0.949 – 1.048 |
| D4 | 1,594 | 1,635.7 | 0.975 | 0.927 – 1.022 |
| D5 | 1,577 | 1,634.4 | 0.965 | 0.918 – 1.013 |
| D6 | 1,638 | 1,634.0 | 1.002 | 0.959 – 1.047 |
| D7 | 1,617 | 1,635.3 | 0.989 | 0.941 – 1.036 |
| D8 | 1,660 | 1,633.8 | 1.016 | 0.973 – 1.059 |
| D9 | 1,628 | 1,634.5 | 0.996 | 0.947 – 1.046 |
| D10 (most recently drawn) | 1,728 | 1,635.6 | 1.057 | 1.002 – 1.114 |
| unseen as of d−1 | 54 | 52.1 | 1.037 | 0.867 – 1.263 |
| **engine threshold DS ≥ 100** | 0 | 0.0 | — | **0 (date, class) cells — unreachable** |

Per scope, six-way: All-Day D1 0.961 (0.90 – 1.02) … D10 1.061 (1.00 – 1.12); Midday D1 1.009 (0.91 – 1.12) … D10 1.075 (0.97 – 1.18); Evening D1 0.930 (0.84 – 1.02) … D10 1.034 (0.95 – 1.12). Every per-scope decile CI contains 1.0 except All-Day D2 (0.924, 0.86 – 0.98) and pooled D10 (1.057, 1.00 – 1.11). Two of forty six-way decile intervals exclude 1.0 at 95%, which is what forty intervals do under H0; both sit AGAINST the overdue axiom (the most-overdue decile is at 0.96, the least-overdue at 1.06). The full per-scope tables are in `phase3_result.json` → `due01`.

**Doubles — secondary, pooled:** D1 0.957 (0.87 – 1.05) · D2 1.011 · D3 1.024 · D4 1.104 (1.03 – 1.18) · D5 1.036 · D6 1.042 · D7 1.046 · D8 1.069 · D9 1.005 · D10 0.952 (0.86 – 1.06) · unseen 0.937. Flat; the one CI off 1.0 is a middle decile.
**Triples — descriptive, pooled:** D1 0.378 (8 obs vs 21.2) · D2 1.15 · D3 0.69 · D4 1.08 · D5 0.84 · D6 0.96 · D7 0.88 · D8 0.70 · D9 0.66 · D10 0.79 · unseen 0.93 · DS ≥ 100: 2 obs vs 2.0 (0.98). Ten classes, counts in the tens — reported, not read.

**The engine's own threshold row, stated exactly as built:** the live rule is `pressure_threshold = 100` on the legacy curve (no `pressure_scale_mode` row; peak pressure at DS = 100, ramp `(DS/100)×0.5` below it). **No six-way or double class ever reached DS ≥ 100 in the study window** (0 cells in all three scopes; only 42 triple cells did). With 32–74 draws per day the longest six-way gap in the store is well under 100 days, so the pressure channel operates entirely on its first branch (pressure ≤ ~0.13 for >95% of combos, as ENG-OBS-05 recorded in June). The threshold the operator's axiom names is not a point on the actual draw calendar. Context: the live pressure weight is +0.40 on All-Day and −0.40 on midday/evening (CONFIG-02), so the engine already treats overdue-ness with opposite signs on the two board types, and DUE-01 shows neither sign has anything to act on.

**DUE-01 read:** draws-since carries no information about the next draw in either direction — the most-overdue six-way decile matches at 0.96× expectation, the least-overdue at 1.06×, both within noise of 1.0 and both against the axiom. Consistent with COHORT-01 and the overdue/reversion analyses already in the audit.

## G7 checklist — yes/no
| # | Required in the pre-registration | Present | Where |
|---|---|---|---|
| i | H0 / H1 from §1 of the 9/19 order | **YES** (as carried into the rulings; verbatim equality against the order text is the content agent's to confirm — the order is not a repo artifact) | Hypotheses block |
| ii | G3 provenance caveat, verbatim from the addendum | YES | §2 bullet 1 |
| iii | histories_unique under-count caveat | YES | §2 bullet 3 |
| iv | exclusion enum with frozen counts 3,844 / 668 / 0 ×4 and the 4-board G4 margin | YES | §1 Exclusions |
| v | ledger hash | YES | §1 Ledger |
| vi | P4 counting rule text and the verified 42 | YES | §9 |
| vii | secondaries: All-Day / Midday / Evening / straights two-sided `bestOrder ?? combo` / days-with-≥1 / 7/23 window | YES | §6, §1 Windows |
| viii | DUE-01 spec per G8 (draws-since only, within-stratum deciles, six-way primary, threshold row) | YES | §7 |
| ix | no primary re-run under this registration; further statistics = new numbered registration | YES | §8 bullet 1 + status line |

Nine of nine present at commit `96561d0`; the primary ran once against it.

## Disclosures
- **Smoke run before the pre-reg commit.** While building the harness (before `96561d0`), a smoke run at R = 2,000 with two sanity-a runs printed a primary line to stderr (S_obs 632, null mean 641.8, lift 0.985, p 0.67). It was the crude Phase 2 picture at low resolution; nothing about the statistic, null, window or exclusions changed afterwards. Reported so the "sanity nulls before the real result" sequence is stated exactly as it happened: the real R = 100,000 run executed the sanity nulls first and wrote them before the primary.
- **Bootstrap unit.** The draft pre-registration said board-days; the approval said dates. Dates are the independent unit (All-Day pools are the union of the session pools). Changed before commit, nothing had run.
- **Sanity (b) semantics.** With every board replaced by itself, S* ≡ S_obs for all replicates; the ≥ rule gives p = 1.0 and the strict rule ≈ 0. The "≈ 0.5" the pre-registration names is the mid-p (ties counted half). The substantive check is that the null-path grading of our own boards reproduces S_obs exactly.
- **Sanity (c) size.** The pre-registered plant (one pick on 5% of board-days) injects only ≈ 1–2% extra matches by construction, so it tests that the recovered lift tracks the injected lift, not that the harness rejects H0 at that plant size.

## Phase 6 inventory — unchanged, awaiting rulings (no copy changed here)
The list in the Phase 0 report stands minus the "official"-source strings, which BUG-181 has already removed on the content agent's 9/20 evening ruling. Still on the list: record_public body "N OF 30 DAYS · E EXACT-ORDER MATCHES · J STATES & PROVINCES" and its captions ("{days} of {of} days matched"), the public hook/stamp strings, the "verified"/"30-day record" caption families, the consumer Home meta (hands-off; flagged), hitmasterzk.com landing copy (nothing live), the parked MKT-46 ad copy, the three public pins and both FAQs (not in the repo). Ruled in one pass after the CI and DUE-01 are in front of the operator.

## Side-filings status
BUG-181 fixed (marketing surfaces) · BUG-180 hold lifted, awaiting operator approval · ARCH-09 and CONFIG-19 scoped, not built.
