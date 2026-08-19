# MKT-62 — Midday Verify Reel · Phase 0 discovery report

Date: 2026-08-19 (ET afternoon) · Status: **REPORTED, WAITING ON RULINGS** — nothing built, nothing registered.
ID check: `MKT-62` absent from MASTER_AUDIT, handoff, REEL_COMMANDS, scripts/constants/lib/components → free, stamped here.

## Deliveries on disk (untracked until this commit; none registered)

| file | probe | content check |
|---|---|---|
| `anchor_intro_rise.mp4` | 720×1280 24fps, 10.000/10.005s, AAC 48k stereo | seated at 0.0 → **standing by ~1.5s** → phone raised centre ~4.5s → smoke takeover ~6.0s. Standing beat confirmed. Audio onset 0.56s; sting beats to 3.3s; tail silent from 8.94s. Cut must land ≤~6.0s (smoke); chip-zone frame-step owed at registration. |
| `verif_carrier_sameday.mp4` | same preset | VO phrases at 1.10–2.50 · 3.21–6.44 · 7.33–8.07 · 8.89–**9.69** (last word). Single-part, 9.7s of VO → short-carrier path (hum-bed from the endcard's pre-crack window). |
| `endcard_motion_confirmed.mp4` | same preset | ⚠ **delivered under `_confirmed`, not the work order's `endcard_motion_sameday`** (same 19:22 timestamp; no `_sameday` file exists). Content matches the brief: bolt standing from frame 0, gold ring sweeps in and settles ~4.5s, bolt goes gold. Treating `_confirmed` as the delivery — say if a rename is wanted (registry name is free either way). |

Until registration all three surface in `reel:check` as unreferenced strays (WARN class, not FAIL).

## PHASE 0 answers

### 1. Can the renderer produce the body? — **YES, config/rig lane, not a new screen.**
- `/track-record` queries `adaptive_tracking` from the window start, so **today's group renders as `#day-<today>` the moment hit detection writes today's matches** (the screen's `daysDen` even anticipates it). The rig's "find yesterday's date label" step simply becomes "find today's" — the ISO date is still its own text node (`app/track-record.tsx:341`), and the day label reads **"Today"** + ISO, which suits this kind.
- **Midday-only** is the one gap. The screen already has `scopeFilter: 'all' | 'midday' | 'evening' | 'allday'` state (line 103) that scopes BOTH the stream and the summary band — but it is pill-driven, and the pills are hidden under `?capture=1`. Two ways to reach it:
  - **(i) recommended — `?scope=midday` URL param, honoured only in capture mode** (~3 lines in `app/track-record.tsx`: seed `scopeFilter` from the param when `captureMode`). Invisible to members, deterministic, and the summary band + the day-header "N matches" chip scope themselves consistently. It is a consumer file under the MKT-51 rig contract → **needs your one-word go** (this work order is the work order the contract asks for; I will not touch the file without it).
  - **(ii) fallback — rig-only DOM prune**: hide today's non-midday rows before layout and rewrite the "N matches" chip (MKT-30 setCell pattern). Zero app touch, but the chip rewrite is a second injection and the summary band stays all-scope until overwritten by item 3.
- Hard gate either way: **`histories` has 0 rows for 2026-08-19 midday right now** → today's group does not exist yet; it appears after your ledger import + hit detection. Without it the renderer aborts exactly like verify does on a zero-match day (correct).
- One wrinkle: allday-scope picks that matched in the midday session are "today's midday draws" too but NOT the board the free member saw covered (that was `midday_free`). Midday scope only, as ordered — the allday matches stay for tomorrow's daily verify.

### 2. Row supply and branding ratio
Live `adaptive_tracking`, scope=midday, matched_session=midday, deduped the way the screen dedupes, 7/20–8/18 (30 days):

- **21 of 30 days have ≥1 midday row** (9 days would abort — ~30%; some may be import gaps, not checked).
- Rows/day: **median 2, mean 1.67, min 1, max 4**. Straights: mean 0.29/day; **15 of 21 days have zero straights** (boxes carry this reel most days).
- Body under the existing beat map (slate 2.5 + summary 2.0 + pan 2.0 + holds 2.0/1.6 + 0.6 travel between + 0.3 settle):

| day shape | body | with stinger (14.8 furniture) | **no stinger (12.1)** |
|---|---|---|---|
| 1 box (common floor) | 8.4s | 23.2s · **63.8%** | 20.5s · 59.0% |
| 1 straight | 8.8s | 23.6s · 62.7% | 20.9s · 57.9% |
| 2 rows (median) box+box / str+box | 10.6 / 11.0s | 58.3% / 57.4% | 53.3% / 52.4% |
| 3 rows | 12.8–13.2s | 53.6–52.9% | 48.6–47.8% |

The floor day (1 box, ~1/3 of run days) sits at **63.8% with a stinger — the same number that barred verify's stinger**. Median days are 57–58%. Reported, not decided. (Note for item 6: adding the cover-lift LOWERS the ratio — it is body, not furniture; what it costs is total length, not ratio.)

### 3. The summary band → **timestamp pair is feasible from real provenance.**
- **PUBLISHED** = `marketing_reels.posted_at` for kind `midday_free`, `reel_date = today` — the literal moment the covered board went to the free group (today: 12:14:31Z = **8:14 AM ET**; note the fleet posts ~8:12–8:16, not the schedule's 10:30 — the stamp tells the truth). Rule: **abort if midday_free has no `posted_at` today** — no published board, no gap to prove. (`created_at` is NOT an acceptable fallback: that is the admin publish, not the post.)
- **GRADED** = `max(result_at)` over today's midday matched rows in `adaptive_tracking` — the hit-detection clock (yesterday's example: `2026-08-19T11:09:32Z`). Never the render clock.
- Rendering: capture-time DOM injection into the existing `#tr-summary` band (the MKT-30/40 setCell machinery already rewrites those tiles for the public cut): tiles 1–2 become `PUBLISHED / 8:14 AM` · `GRADED / 4:47 PM` (gold), tiles 3–4 keep `MATCHES n` · `STRAIGHT n` scoped to midday; the 30-day DAYS tile drops. The app is not modified. Per-segment placement on the ribbon's safe zone (MKT-31) is the alternative if you want it persistent rather than a band beat — same data, different carrier; my lean is band-beat (it is already a 2.0s held beat at the top of the body) plus a one-line ribbon echo on the row holds.

### 4. Retention — **yes, the 30-day prune would delete it; supersession would not.**
- `supersedeOlder()` (`publish-reels.ts:243`) is per-kind, relative to the NEW row's date → a rare kind only supersedes its own older copies when it publishes again (keep-current-only holds).
- `prune()` (`:298`) is kind-agnostic: `reel_date < today−30` → a midday verify older than 30 days is pruned by ANY later publish run. **Exempt by kind test at the top of both functions (MKT-46 pattern) + a `reel:check` assert.** Cost: ~10 lines.

## PHASE 1 feasibility (report only)

### 5. ⭐ Timestamp pair — **affordable, build it.** See item 3. Cost: provenance fetch (2 queries) + band injection + assert (both stamps present, PUBLISHED < GRADED, both today ET) ≈ 60 lines in the verify renderer; no app touch, no generation.

### 6. ⭐ Cover coming off — two ways, report both:
- **(a) cheap (recommend if taken):** the verify body's first 2.5s beat is already a rendered board (`render-verify-slate.ts`) with a `publicCut` mode that masks digits with `•`. Add a `covered` mode (digits masked, result column blank — the board AS POSTED, no grading) and hold it ~2.0s, then cross-dissolve ~0.5s into the graded board. Same six picks, same rank order, same layout — not pixel-identical to the `midday_free` Home still they scrolled past, but unmistakably "that board, covered → graded". ≈ 40 lines + ~2.5s body.
- **(b) exact frame:** capture the redacted coffee-Home still via `render-allday-body`'s `openCoffeeHome` + redaction rig (`--scope=midday --redact`), then dissolve into the graded verify board. Pixel-faithful to their memory, but the dissolve crosses two layouts (Home tiles → ledger board), and `openCoffeeHome` is script-local — needs extraction to a shared module (~1h) plus a second Playwright session in the verify render. Higher cost, layout jump on the lift.
- Either adds ~2.5–3s of body; on a 1-box day totals ≈ 26s with stinger / 23.5 without. Not the beat to cut for ratio (it helps the ratio); cut it only if total length is the concern.

### 7. Row selection — unchanged; no work.

## New ask (mid-order): operator-imported "winning screenshots" for the same-day reel — **build lane, separate sub-item (MKT-62b), not in today's path.**
Feasible, minimal shape: Admin → Reels upload widget → storage bucket `reel-receipts/<date>/<session>/<STATE>.png` + small table `reel_receipts(date, session, state, path, uploaded_at)` (service-role write via admin-ops, SEC-05) → the verify renderer, per featured row, looks up `(date, 'midday', matched_state)` and, if present, adds a ~1.5s RECEIPT beat (the screenshot framed beside the row) — absent receipts change nothing. Cost ≈ migration + bucket policy + ReelsView upload (~150 lines) + renderer beat (~60 lines). Rulings needed before building: (1) source — operator-captured official state-lottery pages only (Lottery Post ToS bars reuse); (2) brand filter — screenshots carry third-party wording ("Pick 3", "winning numbers"); this kind is free-group only (tier 2) so it is a ruling, not a block — Two-Question answer wanted in writing; (3) whether the receipt also feeds the DAILY verify or this kind only. Recommend: ship MKT-62 core first, 62b as the next order.

## Phase 2/3 notes already visible
- Chip `TODAY'S MIDDAY · GRADED` + gold date = a new `CHIP_LABELS` entry with a TODAY stamp (the assembler's `assertBodyDate` chain will carry today; verify's yesterday rule is per-kind, not global) — straightforward.
- Stinger copy `SAME-DAY RECEIPTS / HITMASTER ZK6` (headline-dominant, seal-pinned like verify) — only if item 2's ratio ruling allows a stinger.
- Endcard three lines on `endcard_motion_confirmed` — `ENDCARDS` entry, free-tier, pricing permitted (tier 2 binding).
- Registration set: DB CHECK migration first → `publish-reels` Kind/mode (`verify_midday`, default date TODAY, no public variant, `--variant` refused) → caption registry offset → `KIND_UI` → pinned sets: `INTRO_SETS.verify_midday=['anchor_intro_rise.mp4']`, `CARRIERS.verify_midday` single-part, `ENDCARDS.verify_midday` (own motion, not in `ENDCARD_KINDS` tiers) — none enter `INTRO_ROTATION` / `CARRIER_KINDS` / tier pools, so `reel:rotation` arrangements do not shift.
- Manual trigger: new script `reel:verify-midday` (render `--scope=midday --today` → assemble → publish `verify_midday`); `run-daily-reels.sh` ORDER unchanged and `publish-reels` refuses the kind in daily mode → a daily run cannot draw it.

## Rulings requested (the three that change the build + two more)
1. **Item 1 route:** (i) `?scope=midday` capture param in `app/track-record.tsx` — **go / no-go**. (no-go → rig-side prune.)
2. **Item 2 stinger:** keep (63.8% floor day, 57–58% median) or **no stinger** (59% / 53%)? Also: abort or build on a 1-box day?
3. **Item 3/5:** band-beat timestamp pair (my lean) vs persistent ribbon.
4. **Item 6:** (a) cheap board-covered → graded, (b) exact Home frame, or neither.
5. `endcard_motion_confirmed.mp4` — accept under that name, or rename to `_sameday` before registration?
6. MKT-62b screenshots: confirm it is a follow-on order (not today).
