# MKT-83 §D — WEEKLY STRAIGHTS REEL (0.6) — REPORT ONLY, NOTHING BUILT

Content agent order 2026-10-11 §D. Report by Claude, 2026-10-11. Build nothing until ruled.

## D.1 Opener — the approved Omni porch clip

**Not in the repo.** No file under `assets/marketing/` (or anywhere in the tree) matches a porch / receipt-scroll clip; the only 10/11 upload (commit 6005fb0) was `IMG_0490.jpeg`, the weekly frame. The clip exists on the operator's device only. Until it lands at a lowercase `.mp4` name under `assets/marketing/`, nothing registers.

**How it would register (precedent: `verify_midday`, MKT-62 — one kind, one pinned intro, shares with nobody):**
- `scripts/anchor-intros.ts` — add `export const RECEIPTS_INTROS = ['anchor_intro_receipts.mp4']` and a `FIXED_INTRO` entry for the new kind (:202-220; the "live kinds first" ordering note at :204-210 applies). `introCandidates()` (:236-262) then rotates inside that one-member set with `anchor_intro.mp4` as the fallback; `allIntroFiles()` (:265) pulls it into `reel:check` automatically. It never enters the slate rotation.
- **Gates it must pass** (`check-reel-assets.ts checkIntros` :200-251): ≥100 KB; an audio stream (FAIL without — "intro audio is load-bearing"); duration 3.5–6.5 s (`INTRO_MIN`/`INTRO_MAX`, reel-intro.ts:23-24, also enforced at runtime :68); ≥720×1280 (below 1920 tall = WARN + upscale, so the Omni 720×1280 ceiling is fine); <30 fps = WARN, duplicated to 60; the last 0.5 s must dissolve (luma spread ≤170).
- **Delivery law (MKT-54, handoff :4939-4966):** exact lowercase `.mp4`; `.mov` / `.MP4` are invisible to the registry (remux `-c copy`); never rename in the GitHub web UI; frame-step both ends and ffprobe on landing.
- **Narration:** the intro gates do not inspect speech. The two lines ("Sunday. Time to check the receipts." / "Every match, every miss — the whole week.") are tier-clean at every tier by the lint vocab (no forbidden term); "receipts" is not on any list. If the clip carries them as baked-in audio they ride the intro; nothing in the pipeline transcribes or checks them.

## D.2 The count — exact-order matches per week, as DISTINCT DRAW EVENTS

One draw event = one (date, session, jurisdiction) draw whose `result_digits` equals a pick's `bestOrder` on a board that grades it (the session's own board, or the all-day board). A draw matched by BOTH its session board and the all-day board counts ONCE. Same law as the brief and the verify reel (`briefResolve.ts`); no stored hit flags. Window: 8 complete weeks, Sun 8/16 → Sat 10/10.

| week (Sun–Sat) | straight draw events | distinct jurisdictions | on two boards | by day Su/Mo/Tu/We/Th/Fr/Sa | box-only events |
|---|---|---|---|---|---|
| 8/16 – 8/22 | 6 | 5 | 0 | 0/1/3/1/0/1/0 | 27 |
| 8/23 – 8/29 | 4 | 4 | 0 | 0/0/1/0/2/0/1 | 28 |
| 8/30 – 9/5 | 5 | 5 | 0 | 0/0/0/1/2/2/0 | 19 |
| 9/6 – 9/12 | 2 | 2 | 0 | 0/0/1/1/0/0/0 | 33 |
| 9/13 – 9/19 | 4 | 4 | 1 | 0/0/1/0/1/1/1 | 22 |
| 9/20 – 9/26 | 3 | 3 | 1 | 0/0/0/1/1/0/1 | 23 |
| 9/27 – 10/3 | 5 | 5 | 0 | 0/0/1/1/1/0/2 | 19 |
| 10/4 – 10/10 | 7 | 6 | 0 | 1/1/0/0/2/2/1 | 28 |

Range 2–7 events a week, median 4.5. Jurisdictions seen across the 8 weeks: AR, CA, CT, DE, ID, IL, IN, KS, LA, ME/NH/VT (Tri-State, one draw), MN, NC, NE, NY, ON, PA, SC, TN, W.Canada, WA, WI — 21 distinct; ID, MN, NY, SC, WI, ME/NH/VT recur. (Map beat note: "ME,NH,VT" and "W.Canada" are multi-jurisdiction draw keys in `histories` — a state map must light all three New England states for a Tri-State event and treat W.Canada as a region, not a province.) Last week's seven, as cards: SUN ID midday 0-7-3 · MON NY evening 5-4-6 · THU ME/NH/VT evening 4-0-8 · THU PA evening 8-9-5 · FRI ID evening 6-9-1 · FRI MN evening 1-4-8 · SAT AR midday 3-7-5. Tier 1 shows none of the digits and no session words — day + state + "EXACT ORDER".

## D.3 Pacing — busy and quiet weeks

Using the verify reel's holds (straight card 2.0 s, render-verification-reel.ts:34) and the record body's 7.4 s envelope as the only measured reference points:

| beat | quiet week (2 cards) | median (4–5) | busy week (7) |
|---|---|---|---|
| opener (Omni clip, 3.5–6.5 s gate) | ~5.0 | ~5.0 | ~5.0 |
| cards @ 2.0 s each | 4.0 | 8.0–10.0 | 14.0 |
| map beat | 2.5 | 2.5 | 2.5 |
| stinger + endcard | ~4.5 | ~4.5 | ~4.5 |
| **total** | **~16** | **~20–22** | **~26** |

The 20.0 s figure in the pipeline is the carrier/body ceiling (reel-carrier.ts:35, :60), not a total-length gate — a 7-card week at 2.0 s holds breaches it on the body alone (14 + 2.5 = 16.5 s body is under; the 5 s opener is intro, outside the carrier). Two pacing options to rule: (a) fixed 2.0 s holds, let the total float 16–26 s; (b) a fixed ~12 s card window, holds = 12 / N (1.7 s at 7, capped at 2.5 s at ≤4) so every Sunday runs the same length. A zero-straight week has not occurred in 8 weeks (min 2) — if it ever does, the verify reel's precedent is to ABORT on a zero-match day; the weekly would need its own ruling (skip the cards, map all dim, or no reel).

## D.4 Reuse — what the record / verify renderers give us

Carries:
- **Page/frame harness** — Playwright HTML, `setT(f/fps)` + screenshot per frame (render-record-body.ts:399-404) and its gates (three-digit assert, count gate, tier-1 lint :155-213).
- **Straight grading in the three-row body** (:238-296: boards from `slate_snapshots`, draws from `histories`, straight = `result_digits ∈ bestOrder`) — but it only COUNTS straights (no per-event list) and keys jurisdictions off box matches (:272). The weekly needs the per-event list from §D.2 (one query shape, already written in the scratch harness `straights_weekly.ts`); it should be built on `briefResolve` like the image, not on a third grading.
- **Card HTML precedent** — render-verify-slate.ts `html()` (:144-173): a pick row with combo, result, `hitState · hitSession`, `•••` masking on public. Closest thing to a (day, state, board, digits) card; no standalone component exists.
- **Strike overlay (MKT-63)** — strike-config.ts; fires ONCE per reel when the first hold is a straight (render-verification-reel.ts:676-689, assemble-verification-reel.ts:278-288). Every card of this reel is a straight: rule whether the bolt fires on the first card only (the law) or is withheld.
- **Assembly template** — assemble-verification-reel.ts (:171 intro, :215 stinger, :127 endcard, :301-326 single-pass xfade) is the intro + body + stinger + endcard graph to copy; shared pieces `probeAnchorIntro`, `probeStinger`, `resolveEndcard`, `bedWindow`, provenance tags. There is no shared joiner — each assembler owns its ffmpeg graph.
- **Endcards** — `ENDCARDS[kind]` (endcard-config.ts:41-180): tier-1 copy precedent `record_public` (:168-178, no pricing); tier-2 free-group-with-Pro-line precedent `verify_midday` (:155-160). Tier is `tierFor` (brand-motion.ts:280): only `PRO_KINDS` get the pro motion; the weekly is free (tier 2) + public (tier 1).

Does not exist (new):
- **Map beat** — no map asset or renderer anywhere (the only SVG is `bolt_mark.svg`); jurisdiction code lists exist (lib/parseLedger.ts:40 `STATE_MAP`, includes ON/QC). A US + Canada outline (states + provinces, keyed by the ledger codes, Tri-State and W.Canada handled as groups) is a new asset — the brand-law constraint is lit vs dim only: no counts per state, no ranking, no "hot".
- **A new reel kind** costs: a migration widening `marketing_reels_kind_check` (template migrations/2026_09_11_mkt79_record_public_kind.sql:9-11), a `KIND_UI` entry (components/admin/ReelsView.tsx:59 — reel:check FAILs without it), `ENDCARD_KINDS` placement, captions in reel-captions.ts, the `run-daily-reels.sh` ORDER (checklist check-reel-assets.ts:1315-1321), a label in render-captions-pdf.ts:93. Two kinds (free + public) = two of each.

Rulings owed before any build: opener file (deliver it); pacing (a) or (b); strike-bolt law on an all-straight reel; the zero-straight week; map asset source (hand-drawn SVG vs generated) and the Tri-State / W.Canada lighting rule.
