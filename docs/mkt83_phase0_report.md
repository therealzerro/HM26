# MKT-83 — SUNDAY RECEIPTS · WEEKLY RECAP IMAGE — PHASE 0 REPORT (scope only, nothing built)

Order: content agent (Ledger), 2026-10-11. Report by Claude, 2026-10-11. ID verified: MKT-83 is free — the 10/10 straight-tag chip fix was recorded inside MKT-82 (audit line "Operator eyeball finding (10/10)"), not as its own MKT. Engine untouched; no file outside docs/ + the audit + the handoff changed.

## 0.1 What "the Sunday receipts card" is

| where | what it does | real results? |
|---|---|---|
| `scripts/anchor-thread.ts:181-189` | `SUNDAY_CAPTIONS` — four rotating thread captions ("Post the rows your state matched off this week's boards…") + `SUNDAY_FALLBACK` | **no** — fixed copy |
| `scripts/anchor-thread.ts:201-231` | `SUNDAY_VIDEOS` — three Gemini Omni 8 s prompts (receipt unrolling / glass ledger / dawn receipt), pacing block first, exclusions last | **no** — a prompt |
| `scripts/anchor-thread.ts` `buildSundayReceipts(dayISO)` (≈:236) | returns `{caption, videoPrompt, lintNote}`; null on any non-Sunday; rotation by week-of-year | **no fetch of histories, snapshots or reportCard anywhere in the module** |
| `scripts/render-captions-pdf.ts:188, :196-203` | prints the Sunday card into the captions PDF (page 2): heading, CAPTION — COPY AS-IS, VIDEO PROMPT, a "why" line | **no** — prose only |
| `REEL_COMMANDS.txt:257-260` | describes the card ("RECEIPTS THREAD caption plus a Gemini Omni 8-SECOND video prompt") | — |

Verdict: the phrase in v7.16 E2 refers to a **caption + video prompt only**. "Fold the replies into Monday's brief" is a manual instruction with no code behind it. No surface in the app or the PDF carries weekly recap data. **This order becomes the first real recap image.**

## 0.2 Data

**Resolver:** `lib/social/briefResolve.ts` — `resolveDraws(board, draws, scope)`; BOX = sorted set ∩ `histories.comboset_sorted`; STRAIGHT = `result_digits === bestOrder`; `matchTag()` is the label law. The weekly builder is seven `fetchDay()`-shaped calls (latest non-deleted ZK6 snapshot per scope + that day's `histories` rows, per-date queries — 65–75 rows/day, inside the PostgREST 1000 cap; a single ranged query is NOT (4,122 rows for 56 days — the first measurement run was truncated at 8/29 by exactly that)).

**Window measured:** 8 complete weeks, Sun 2026-08-16 → Sat 2026-10-10, 56 days × 3 boards = 168 cells.

| finding | value |
|---|---|
| cells with NO BOARD (no snapshot for the day/scope) | **0 of 168** (all three scopes, every day) |
| cells with a board but NO DRAWS | **0 of 168** |
| Sundays — midday jurisdictions drawn | 27 every Sunday (TX/WV/PR dark; TN/SC/AR midday-dark) |
| Sundays — evening jurisdictions drawn | 38–39 every Sunday |
| tag counts, all-day (56 d) | BOX 37 · STRAIGHT 15 · no match 4 |
| tag counts, midday | BOX 33 · STRAIGHT 5 · no match 18 |
| tag counts, evening | BOX 26 · STRAIGHT 16 · no match 14 |
| matched picks per cell (chips) | 0: 36 · 1: 53 · 2: 50 · 3: 22 · **4: 7** (max 4; never 5 or 6) |

**Week window — recommendation:** posted Sunday morning → **the previous Sun–Sat** (7 rows, e.g. OCT 4 – OCT 10). Every Sunday in the window had boards and draws on all three scopes, so Mon–Sat would drop a real, graded row. Display for a no-board / no-draw cell is the content agent's ruling; the data shows it has not happened in 8 weeks, so a dim "—" with a distinct tone (not the no-match dash) is the only case to design, and it can be the `matchTag()` 'no draws' label.

Last three weeks, as the grid would read (allday | midday | evening; `*` = straight):
```
WEEK 09-20..09-26          WEEK 09-27..10-03          WEEK 10-04..10-10
Su  —    | —    | BOX 905   Su BOX 375 | —   | BOX 573 395   Su BOX 064 752 | STR 073* | BOX 691
Mo BOX ×2| —    | BOX 795   Mo BOX ×3  | —   | BOX 830       Mo BOX ×3 | — | STR 546* 670
Tu BOX ×3| BOX ×2| —        Tu BOX ×2 | BOX 154 | STR 637 861* 146   Tu BOX 195 | BOX ×2 | BOX ×2
We BOX ×3| BOX ×2| STR 805* We STR 485* 140 694 | BOX ×2 | —     We BOX 136 | BOX 319 | BOX ×3
Th STR 195 385* 681 | BOX 742 | STR 861 385*   Th STR 428* | — | —   Th STR 408* 795 | — | STR 895*
Fr BOX 736 | BOX 318 | BOX 146   Fr BOX ×3 | BOX 418 | —       Fr BOX ×3 | — | STR 861 104 691* 148*
Sa STR 325* 709 | BOX ×2 | —   Sa STR 408 185* | BOX ×2 | STR 158*   Sa STR 325 375* 706 195 | BOX 352 | BOX 670
```
(full 8-week table: scratch `weekly_data.out`, regenerable from the same two REST queries.)

## 0.3 Content model — measured as proposed, with two notes

Rendered exactly as 0.3 lists it: header (brand · SUNDAY RECEIPTS · range), 7 day rows × 3 board columns, cell = dim dash / BOX MATCH chip / STRAIGHT MATCH chip in gold, tiers 2 and 4 with the matched signal's digits at the MKT-82 digit size (17 pt logical = 34 px at 1080 ≥ the 31.5 px floor; JetBrains Mono Bold), tier 1 with no digits and the §6 column words (CONTINUOUS · DAYTIME · NIGHTTIME — if "no session words" means no column words at all, tier 1 needs column glyphs; say which), footer "Every match and every miss stays on the record." + the canonical brief footer line. No weekly total anywhere (R-A honoured; the grid is the record).

Notes from the render: (1) a cell holds up to **four** matched picks (7 of 168 cells); at 17 pt, two digit-groups fit on one line in a 137 pt column, so a 3- or 4-chip cell is a two-line cell (row 52 pt instead of 33 pt). (2) Chip colour per pick (gold = straight, green = box) carries straight from the MKT-82 10/10 chip law.

## 0.4 Fit — measured (HTML mock in the MKT-82 type metrics and the app's font files, 1 pt = 2 px at 1080 wide; expect ±5 % against the RN card)

| tier | content width | week 9/20 | week 9/27 | week 10/4 | two-line cells |
|---|---|---|---|---|---|
| 4 / 2 | 444 pt (the MKT-82 screen) | 347 pt · 694 px | 366 pt · 732 px | 366 pt · 732 px | 3 / 4 / 5 |
| 4 / 2 | 500 pt (wider screen) | 290 pt · 580 px | 290 pt · 580 px | 328 pt · 656 px | 0 / 0 / 2 |
| 1 | 444 or 500 pt | 157 pt · 314 px | 157 pt · 314 px | 157 pt · 314 px | 0 |

Row heights: 33 pt (one chip line) / 52 pt (two); tier 1 rows 14 pt. Footer one line at both widths. Worst case the data allows (every row two-line) = 7 × 52 + header/footer 47 = **411 pt**.

**Minimum screen rectangle the frame must provide** (content + the 6 pt glass inset each side):
- tiers 2/4, screen 456 pt wide (the MKT-82 width): **≥ 378 pt tall for the last three weeks, ≥ 423 pt to hold any week the 8-week distribution can produce** → **912 × 846 px** on the 1080 canvas.
- tiers 2/4, screen 512 pt wide: ≥ 340 pt for the last three weeks, ≥ 423 pt guaranteed → **1024 × 846 px**.
- tier 1: ≥ 169 pt → 912 × 338 px (fits the existing MKT-82 screen; no new frame needed for the public cut).

**4:5 holds it.** 1080 × 1350 is 675 pt tall; a screen of 423 pt is 63 % of the height, which is exactly "anchor small, screen dominant". The existing MKT-82 frames do **not**: their screens are 250 pt (present) / 263 pt (point) tall — the grid is 1.4–1.6× too tall for them. 9:16 is not needed; it would only buy anchor room, not reading room. Frame prompt spec, in the frame's own 928 × 1152 source pixels: screen inner edge ≥ 779 wide (as today) × **≥ 361 tall** (423 pt ÷ 1.1714), top edge at y ≈ 60–80, anchor below the screen from y ≈ 460, no element crossing the screen (the present frame's helmet crown would fail at this size).

## 0.5 Reuse — what carries, what does not

Carries as-is: `briefFrames.ts` registry shape (file, measured `screenRect`, status, gate verdict, `outputRect()`), the 2.3 gate `scripts/brief-frame-gate.py` for the new frames, `lintBrief`'s rule set (`BRIEF_RULES` + `lintCaption` per tier), the fit assert pattern (card reports natural height vs glass; never shrink; 20 s clock from BUG-183), `tagPngDataUrl` (add `hm:weekly_range`), tier variants + `sessionLabel()` by tier, `captureNodeToPngNatural` with the BUG-183c fixes (fonts, includeQueryParams, warm-up), the `/brief-capture` route and `render-social-brief.ts` rig pattern, the Reels page card (new button row), the Sunday-only timing from `buildSundayReceipts` (week-of-year, ET).

Needs a small change: `frameForDate()` walks every ACTIVE frame — the registry needs a `set: 'daily' | 'weekly'` (or a second array) so the weekly rotation never picks a daily frame and vice-versa; `BRIEF_FRAME_IMAGES` static-require map gains the two new files; `lintBrief(model)` is typed to the daily `BriefModel` and enumerates its fields via `briefModelStrings` — either a `weeklyModelStrings` + a `lintStrings(tier, strings)` core (10 lines, `lintBrief` becomes a wrapper) or a weekly model that fills `BriefModel` fields, which is a lie; the rig's `LABEL` map and tier list are hardcoded.

Does not carry (new): `buildSocialBrief` (one day + the reportCard aggregate) → `buildWeeklyReceipts(endSat)` = 7 per-day fetches through the same resolver; `BriefFrameCard`'s content (sessions + yesterday rows) → a `WeeklyFrameCard` grid; `SocialBriefExport`'s tier table + data cache are daily (the weekly exporter is a sibling or the exporter takes a `kind`); the daily rotation law (never the same frame two days running) → weekly is per Sunday; `BRIEF_FRAME_FROM` flip logic (weekly has no classic hatch to flip from — rule whether it needs one); the captions-PDF Sunday card could then say "the weekly image from Admin → Reels" the way the anchor card names the framed brief.

Stopped here. The frame prompt is yours to write to 0.4's rectangle.
