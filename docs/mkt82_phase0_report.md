# MKT-82 — The Daily Pro Brief: compliance now, the anchor frame next · Phase 0 discovery report

Date: 2026-10-10 · Status: **PHASE 0 REPORTED — WAITING ON APPROVAL for Phase 1 (plus one ruling, §R1) · Phase 2 NOT STARTED · ENGINE UNTOUCHED**
ID check: `MKT-82` absent from MASTER_AUDIT headers, REEL_COMMANDS, scripts/constants/lib/components; the handoff's last five "next free MKT ID" notes all say 82; STAT-01 and ENH-FUNNEL-03 both recorded "MKT-82 stays free". **Filed as MKT-82.** Next free MKT ID = 83.
Work order: content agent ("Ledger") 2026-10-10 — asset intake + Phase 0 items 0.1–0.6, report and stop.
Operator-owed ruling before Phase 1 ships: **§R1 (the 1.3 line trips the R-B lexical lint on "odds").**

---

## A. ASSET INTAKE (done — commit `7bb0d5d`, pushed)

**a. Found.** Upload commit `8116195` ("Add files via upload", GitHub web, 2026-10-10 07:25 ET, therealzerro), two files at the marketing root:

| upload order | original name | format | pixels | now |
|---|---|---|---|---|
| 1st | `assets/marketing/IMG_6479.jpeg` | JPEG baseline, RGB, 74,856 B | 928 × 1152 (0.806:1, ≈4:5) | `brief_frame_present.png` |
| 2nd | `assets/marketing/IMG_6480.jpeg` | JPEG baseline, RGB, 69,085 B | 928 × 1152 (0.806:1, ≈4:5) | `brief_frame_point.png` |

**b. Verified by content, not order.** Opened both. `IMG_6479` = anchor SEATED at the desk, left hand raised palm-up presenting the screen → **present** (order and content agree). `IMG_6480` = anchor with index finger raised, pointing up at the screen → **point** by gesture (order and content agree on the gesture) — ⚠ but the anchor is **seated at the desk, not standing** (right hand rests on the desk; desk reflection visible). The "standing" attribute in the brief was not delivered; the gesture is what distinguishes the frames, so the name stands. Reported, not treated as a swap.

**c. Renamed.** JPEG → PNG at full 928×1152 (decoded once, written lossless), originals removed in the same commit. `check-reel-assets` only scans `.mp4` strays at the marketing root, so the PNGs land without a registry entry and without a WARN. **Not registered in BRIEF_FRAMES** (no such registry exists yet — Phase 2).

**d. Screen-detection gate (2.3), read-only, both frames.** Method: purple-glow pixel mask (B>110, R>70, G<0.85·B) → row/column projections → border line groups → outer rect; 9 edge samples per side for tilt; interior = innermost line + 6 px inset; intrusion = connected components > median + 12·MAD (floor 60 luminance); 4:5 crop = 922×1152 centred (source is 0.806:1, so 3 px off each side), ×1.1714 to 1080×1350.

| check | `brief_frame_present.png` | `brief_frame_point.png` |
|---|---|---|
| border detected | single glow line, outer rect **x67 y108 w793 h463** (7.2–92.6 % wide, 9.4–49.5 % tall) | **double** line (two strokes 11 px apart); outer rect **x42 y124 w844 h508** (4.5–95.4 % wide, 10.8–54.8 % tall); inner rect x55 y136 w818 h484 |
| axis-aligned ≤ 2 px/edge | top 2 · left 0 · right 0 · bottom 0 (the one 8-px bottom sample at mid-width is the helmet crown, not tilt) → **PASS** | top 0 · bottom 0 · left 1 · right 0 → **PASS** |
| interior uniform dark | median lum 15.6, std 7.3, p99 31 — a faint top-to-bottom glow fall-off (row bands 21.8 → 15.3); no texture, no generated content → **PASS (soft: mild gradient)** | median 14.8, std 6.3, p99 18.8 → **PASS** |
| nothing intrudes | **FAIL — helmet crown enters the rect**: component x455–533, y546–560, max lum 251 (white specular), **21 px above the inner bottom edge (567)** and it occludes the glowing border itself across x≈440–545 | **FAIL — helmet crown enters the rect**: components x691–783, y586–612, max lum 252, **33 px above the inner bottom edge (619)** |
| survives 4:5 crop | PASS — margins L64 R65 T108 B581 | PASS — margins L39 R39 T124 B520 |
| **verdict** | **FAIL (intrusion)** | **FAIL (intrusion)** |

**Regeneration note for the operator (both frames, same fix):** the screen's bottom edge must clear the top of the helmet by a margin — either the screen sits higher / ends higher in frame, or the anchor sits lower / further back. Everything else is close to spec. Spec deviations to carry into the prompt: present's screen is shorter than the brief's ~6–64 % height band (it ends at 49.5 %); point's screen is wider than ~7–93 % (4.5–95.4 %) and has a double border; the two screens are **not in the same position** (788×458 vs 818×484 inner, aspect 1.72 vs 1.69 — one layout at a shared aspect still serves both with a per-frame scale, which is what a per-frame `screenRect` in the registry is for); "standing" was not delivered.

---

## B. WHY (confirmed against the code — every breach string exists as written)

The 10/10 image the operator posted is the **Pro variant of `SocialBriefCard`** (`variant="group"`, `groupTier="pro"`, kicker "INNER-CIRCLE BRIEF · 10/10"). Every string the order quoted is a constant or template in that component (§0.2 table). The order's reading of R-A/R-B is correct against `lib/social/brandLint.ts` and the STAT-01 Phase 6 ruling text in MASTER_AUDIT.

---

## 0.1 Where the brief is rendered, when, size, where published, to whom

- **Renderer:** `components/social/SocialBriefCard.tsx` — a React Native view, fixed **960 × 960 logical**, captured by html-to-image at pixelRatio 2 → **1920 × 1920 PNG** (`captureNodeToPngNatural(node, 2)`). Three variants from one component: `public` ("DAILY INTELLIGENCE", aggregate only), `group`+`free` ("MEMBER BRIEF"), `group`+`pro` ("INNER-CIRCLE BRIEF"). The 10/10 image is the Pro variant.
- **Data:** `lib/social/socialBrief.ts` `buildSocialBrief()` → `lib/brief/computeBrief.ts` (today's plays, yesterday's faithful outcomes, `allocation`, `reorder`) + `lib/social/reportCard.ts` (aggregate counts, `verified30d`) + a faithful intraday resolution (slate ∩ histories, never stored flags). Built live at tap time.
- **When:** it is **NOT in `reel:daily`** — `scripts/run-daily-reels.sh` has no brief step; nothing scripted produces it. It is produced **on an operator tap**, from two admin surfaces: (1) Admin → 🎬 Reels → "📰 Social brief — PNG" (`SocialBriefExport`, `components/admin/ReelsView.tsx` ~L830–960; one tap per tier 💎 Pro / 👥 Free / 📡 Public; download on web, Save to Photos / Share sheet on native); (2) Admin → Publish console (`components/admin/PublishView.tsx` `generateBriefImage` L420–433; content kind `brief`, or inside the Pro "kit" L123 / free All-Day kit L126).
- **Pixel size on the wire:** 1920 × 1920 (1:1 — MKT-50 addendum 3, 2026-08-07, "photo format"; the reels' 1:1-cut retirement does not apply).
- **Published where / to whom:** **manually by the operator** — the Pro-tier PNG is the "Morning Brief photo" posted to the **Pro Facebook group (tier 4)** with the drafted caption (`lib/social/captions.ts` `briefCaption`, pro L266 "inner-circle brief — first access."); the captions sheet's DAILY ANCHOR THREAD question goes under it as the first comment (REEL_COMMANDS, MKT-73). Nothing auto-posts.
- **Pro-only?** The *Pro variant* is Pro-group-only by surface. The *component* also serves the free group (MEMBER BRIEF, locked today-plays) and the public page (aggregate hero) — and the footer line "Intelligence is your edge. Use it." renders on **all three** variants (L109, unconditional), so the R-B breach is on the free and public briefs too.

## 0.2 Every string on the Pro brief, file:line, kind, author

⚠ Provenance limit: the repo is **shallow (90 commits, oldest `3abde6a` 2026-09-11)** — `git log -S` attributes every string to that boundary commit. Authorship below is from MASTER_AUDIT entries, which are the record. None of these strings went through the content agent; all were written in Claude Code sessions under operator rulings on the dates given.

| # | string (as rendered) | file:line | kind | origin |
|---|---|---|---|---|
| 1 | `HITMASTER ZK6` | SocialBriefCard.tsx:93 | constant | SOCIAL-01 (2026-07-09) |
| 2 | `INNER-CIRCLE BRIEF · {date}` (pro) / `MEMBER BRIEF` / `DAILY INTELLIGENCE` | :95 | template | SOCIAL-01/05 (7/09) |
| 3 | `💎 PRO` / `⚡ MEMBERS` / `⚡ LIVE` badge | :100 | constant | SOCIAL-01/05 |
| 4 | **`Intelligence is your edge. Use it.`** (all variants) | :109 | constant | SOCIAL-01; the same footer is on the slate composites, see F3 |
| 5 | **`First access — inner circle 💎`** (pro) / `Pro members see it first ⚡` (free) | :111 / :112 | constant | SOCIAL-01/05 (§6 "first-access framing" was the Pro discipline at the time — `brandLint.ts:190-195` still says so, see F4) |
| 6 | `YESTERDAY · {date}` | :206 | template | SOCIAL-01 |
| 7 | `{verified}/{total}` **aligned** · `{n}` **juris.** · **`{verified30d}` 30d** | :208–210 | generated (`reportCard`) | SOCIAL-01 (7/09); dense labels MKT-53 (8/09) |
| 8 | per-session yesterday row: `Daytime` / `Nighttime` / `Continuous` + chips `{1,6,7}` + `STRAIGHT MATCH` / `BOX MATCH` / `no match` | :374, :380–396; labels socialBrief.ts:81–85 | generated | SOCIAL-01 (labels), BRAND-04 vocab (5/26). ⚠ see F1: the yesterday "STRAIGHT MATCH" is a rank-1 BOX test |
| 9 | `TODAY` | :216 | constant | SOCIAL-01 |
| 10 | `● LIVE` / `✓ RESOLVED` | :223 | constant | SOCIAL-06 (7/09, intraday) |
| 11 | resolved: `STRAIGHT MATCH` / `BOX MATCH` + chips; `no match yet — session live` / `no match this session` | :232, :241 | generated | SOCIAL-06 |
| 12 | `— no signal surfaced —` | :244 | constant | MKT-50 (8/07, replaced "no play surfaced") |
| 13 | today plays: `4-8-5` (bestOrder, mono 28 pt) + `{4,5,8}` + **`SGL`/`DBL`/`TRP`** chip | :249–253; `multBadge()` :71–76 | generated | SOCIAL-05; Pro-only since MKT-50 addendum 2 |
| 14 | **`WHERE THE MODEL CONCENTRATES`** | :268 | constant | MKT-50 Ruling 1 (8/07) — relabel of "RECOMMENDED PLAY" |
| 15 | **`ALL STATES · ANY ORDER · 3-DAY WINDOW`** | :269 | constant | MKT-50 Ruling 1 |
| 16 | **`HIGHEST CONCENTRATION` / `LOWER CONCENTRATION` `· ANY ORDER`** + **`×2` / `×1`** chip | :276, :278 | generated (`allocation.units`) | MKT-50 Ruling 1 — relabel of "2 UNITS · BOX + STRAIGHT" / "1 UNIT · BOX" |
| 17 | digits + set + **`+ EXACT ORDER`** | :281–284 | generated (`withStraight`) | MKT-50 |
| 18 | **`CONTINUOUS + DAYTIME · 90-DAY ACTIVITY {n}`** | :288 | generated (`footprint90`) | MKT-50 |
| 19 | **state footprint `NM:7, MI:3, AZ:2`** | :293 | generated (`topJx`) | MKT-50 item 5 |
| 20 | `— no concentration surfaced today —` | :298 | constant | MKT-50 |
| 21 | **legend: `The model concentrates on 1–2 combinations and carries them up to 3 days; a match closes that leg. State codes show where a combination appeared in the last 90 days — recent activity, not a recommendation.`** | :301–302 | constant | MKT-50 Ruling 1 (ride footer relabel) |
| 22 | `ANALYST NOTES` | :307 | constant | MKT-50 Ruling 2 |
| 23 | **`Daytime structure: ranks 1–2 in the Daytime session have underperformed ranks 3–5 — a pattern confirmed four separate times. The combinations above already reflect that exclusion.`** | :310–312 (gated by `daytimeNote` = "a midday slate exists today", socialBrief.ts:201) | constant | MKT-50 Ruling 2 item 1 (8/07). **FALSE since 2026-09-01**, see 0.4 |
| 24 | `Rank-1 check: rank-1 signals matched in {hit} of {total} sessions yesterday.` | :317–318 | generated (`reorder`) | MKT-50 item 3 (the "evidence" for #23) |
| 25 | **`What the ranking means: these signals are ranked to maximise match probability. They are not ranked for profitability, and no analysis changes the underlying odds.`** | :322–324 | constant | MKT-50 item 2 (8/07) — pre-dates STAT-01 |
| — | format 960×960, pro two-column layout | :19–20, :22–33 | — | MKT-50 addendum 3 (8/07); **MKT-53 (8/09) — still code-stamped with NO audit entry** (the orphan MKT-54 recorded) |

Bold = named in the order as a breach, or newly flagged here.

## 0.3 "Daytime / Nighttime / Continuous" and "SGL"

**Not a rename of the scopes.** The scopes are `midday | evening | allday` everywhere in code, data, reels ("All-Day 3 of 6" on verify), and the app. The three words come from the **Brand Rehab Skill Brief v2 §6 translation table** (`assets/HitMaster_Brand_Rehab_Skill_Brief_v2.md:350`): *"Midday / Evening / All-Day (with numbers) → Daytime / Nighttime / Continuous (or omit time-of-day labels entirely on public posts)"* — a **tier-1 (public) rule**, written because a session label next to a 3-digit number is the Meta tell. `brandLint.ts:127–143` enforces it only for tiers 1/3 and only suggests the words.

**When / which ID it reached the brief:** SOCIAL-01 (2026-07-09) applied the public translation to **all** variants of the card (`socialBrief.ts:81–85 SCOPE_LABEL`), i.e. to the free and Pro groups where the rule does not apply. MASTER_AUDIT SOCIAL-01 records it in one line ("Consumer session labels Daytime/Nighttime/Continuous"), no separate ruling.

**Other surfaces carrying them:** exactly one — the Publish-console **slate composite header** (`components/social/PublishStage.tsx:28–30 SESSION_LABELS` → "DAYTIME · 10/10"), used on the free/pro/public slate-drop images. The reel bodies, the Home grid, the track-record screen and all captions say Midday / Evening / All-Day. So the Pro brief and the slate composite are the only tier-2/4 surfaces with the public-tier words; members see two vocabularies for the same session. **Nothing is renamed under this order** (DO NOT list); recorded for a separate ruling.

**SGL as rendered** = the **multiplicity badge**: `multBadge()` (SocialBriefCard.tsx:71–76) maps the engine's `multiplicity` class → `SGL` (singles, three distinct digits) / `DBL` (doubles) / `TRP` (triples). It is the engine's rail class, not a session. The same `DBL`/`SGL` chip is on `SlatePosterCard.tsx:131` (slate-drop images). The box set beside the digits already shows it (a double is a repeated digit), so **members do not need the badge** — recommendation for 2.4: omit.

## 0.4 ⛔ The rank-exclusion note — does the engine act on it?

**No. The engine never did; the brief layer did, and stopped on 2026-09-01; the sentence has been false on every Pro brief since.**

- **Engine:** `engines/zk6.ts`, `lib/engineCore.ts`, `supabase/functions/compute-slate-zk6/index.ts`, `constants/zk6.ts` contain **no rank/position exclusion** (grep for rank/position/skip/exclude/inversion: the only "inversion" is CONFIG-02's negative pressure weight, unrelated). Slate composition and order were never changed by the finding — ENG-MIDDAY-POS-01 itself says "bet-selection rule only — subscriber slate composition/order unchanged".
- **History of the rule (decision layer, `lib/brief/computeBrief.ts`):** ENG-MIDDAY-POS-01 (2026-07-23) — 4th confirmation of the midday pos-1–2 inversion on 5/1→7/22, 82 slate-days: pos 1–2 11.0 % vs pos 3–6 20.5 %, z≈2.6 — operator's bet-selection rule "midday bets from positions 3–5". MKT-50 (2026-08-07, commit cd49906) applied `middayPosRule` to the Pro brief's published plays (the "FINDING" at the top of MKT-50: 8 of 14 days' published Daytime plays differed) and wrote note #23 and the Rank-1 check as its evidence.
- **Retired:** **ENG-MIDDAY-POS-02 (2026-09-01)** — rotation era 8/3→8/31, 29 midday draw-days: pos 1–2 **19.0 %** vs band pos 3–5 **13.8 %**, inversion z **+0.73** (wrong sign); verdict "**rank position is uninformative; the pos-3–5-only restriction is RETIRED** — it *cost* hits". Same-day addendum, operator-instructed: `MIDDAY_EXCLUDED_POS`, `BriefPick.excluded`, the `middayPosRule` opt and all three inversion flags were **stripped from computeBrief**; both callers (`useBrief.ts`, `socialBrief.ts`) updated; `computeBrief(date)` is now one unfiltered path (`computeBrief.ts:24–27, 151–153`; `socialBrief.ts:158–162` comment records the retirement).
- **What was not done on 9/1:** the Pro card's note text (#23) was left in place, gated only by "a midday slate exists today" (`socialBrief.ts:201`), so **"The combinations above already reflect that exclusion" has been untrue for 40 days (9/1→10/10)**, and "a pattern confirmed four separate times" cites confirmations the 5th measurement reversed. A stale-copy defect, not a live lever.
- **STAT-01 (closed 9/21):** midday lift 0.83, p 0.042 = one of nine uncorrected secondaries, engine-worse direction, "NOT a finding"; the finding of record is chance (lift 0.98, CI 0.90–1.07).
- **Consequence:** nothing is live → **no new ENG item and no STAT-02 test are needed**; the note is removed in Phase 1 (1.1 already lists it) and the audit records the 9/1→10/10 stale window.

## 0.5 The concentration panel — what feeds it, what the words mean in the engine, where else members see it

- **Feed:** `computeBrief().allocation` (`computeBrief.ts:403–424`), surfaced as `pro.concentration` (`socialBrief.ts:189–198`). Input = **today's SINGLES picks across all three slates**, deduped by comboSet; ranked by `tierOf()` (`:142–150`: footprint90 ≥ 10 & on ≥2 slates → T1×Conv · ≥ 10 → T1 · on ≥2 slates → T2·Conv · engine tag `overdue` → T2·Overdue · ≥ 6 → T3 · tag `strong` → T3 · else T4), then by footprint90, then by calibrated pHit; the top three receive `UNITS = [2, 2, 1]`.
- **"×2 / ×1"** = **`units`** — literally *"stake units, top-down from T1 (2/2/1)"* (`computeBrief.ts:53`): the operator's bet-sizing allocation, relabelled "concentration weighting" by MKT-50 Ruling 1 (which kept "every number"). The engine has no such quantity.
- **"3-DAY WINDOW" / "carries them up to 3 days; a match closes that leg"** = the **operator's personal ride rule** (bet 1–2 combos, ride ≤ 3 days, a hit closes the leg — the bet-log convention). **Not in code anywhere:** `allocation` is recomputed from *today's* slates only; there is no carry state, no 3-day window, no "leg" in the engine or in the brief layer. The sentence describes what the operator does, not what the model does.
- **"ALL STATES"** = the operator plays all jurisdictions (header comment `computeBrief.ts:10–13`).
- **"90-DAY ACTIVITY n"** = `footprint90` = box appearances of the comboSet in `histories` over the last 90 days, **restricted to the top-10 jurisdictions by 30-day box correlation** (`:240–249`); the state codes = `topJx`, the top-5 per-jurisdiction counts (`:250–255`). **"+ EXACT ORDER"** = `withStraight = (i === 0)` — the first row always, by construction, not a per-combo signal.
- **What it is, in engine terms:** a recency-first ladder — footprint90 ≥ 10 makes T1, the engine's `overdue` tag makes T2 — i.e. the draws-since / recent-appearance class that **DUE-01 measured flat** (deciles D1 0.963 … D10 1.057, 2 of 40 CIs off 1.0 in the anti-overdue direction) and STATE_STR falsified. The order's reading stands: the panel presents recency as signal.
- **Where else members see it:** **nowhere.** Grep over `app/` and `components/` excluding admin for allocation / concentrat / footprint90 / topJx / "carries them" / "3-day": no consumer surface. The admin BriefView (operator-only, `useBrief`) shows the same allocation as raw "units". The engine's own outputs (slate, DI top-30, adaptive tracking) carry none of it.

## 0.6 Is the brief inside the caption/brand lint today?

**Half-inside, and the half it is inside cannot catch the breaches.**

- `scripts/check-brand-voice.ts` IN_SCOPE **does** include `SocialBriefCard.tsx` + `socialBrief.ts` (MKT-50 Ruling 4). Run today: **"✅ 36 files scanned, 0 forbidden-vocab findings"** — green with every breach present, because that scanner carries only the gambling-vocab phrase list (CLAUDE.md / BRAND-03 / BRAND-05 / MKT-03). It has **none of the 9/21 universal classes** (no-edge-claim, no-streak, no-aggregate-count).
- Those classes live in `lib/social/brandLint.ts` `lintCaption()` and run on **captions** (PublishView.tsx:199, 704; ReelsView.tsx:179, 362; captions.ts) and on **reel-rendered text at build** (render-reel-stamp, render-record-body, endcard-config, reel-relabel, check-reel-assets). **The card's rendered strings are never passed through it; nothing gates the capture.**
- **Why:** STAT-01 Phase 6 inventoried script-rendered and caption surfaces (record body, hooks, captions, YouTube metadata, Home meta, site); the brief PNG is produced by an admin tap, not a script, and was not on that list; `check-brand-voice` was never extended with the 9/21 classes.
- **Measured, tier-4 `lintCaption` over the Pro card's strings (this session):** BLOCK on L109 (`edge`, no-edge-claim) and L322–324 (`odds`, no-edge-claim). **Everything else passes lexically** — the 30d tile ("125 · 30d" is not an R-A regex shape), "maximise match probability", the Daytime-structure note, the whole concentration panel, "First access". So **1.5 cannot be satisfied by piping the strings through `lintCaption` alone**: the gate needs (a) structural removal (Phase 1) and (b) brief-specific blocking rules (bare `N · 30d` / `N 30d` stat forms, `probability`, `underperform`, `pattern confirmed`, `concentrat`, the sales-line shapes) in a `lintBrief(data, variant, tier)` that both capture paths call **before** capture and throw on.

---

## F. Additional findings (not in the order; stated, not acted on)

- **F1 — yesterday "STRAIGHT MATCH" is a rank-1 BOX test.** `socialBrief.ts:180` `yPick1Straight = !!(pick1Hit && preflight)`, and `computeBrief.ts:388` `pick1Hit = yDraws.some(d => d.comboset_sorted === yp1Set)` — a comboset (any-order) match of yesterday's #1. The YESTERDAY rows (`SocialBriefCard.tsx:374`) therefore print **STRAIGHT MATCH whenever rank-1 box-matched**, exact order or not, while the TODAY resolved rows use a true exact-order test (`socialBrief.ts:145`). Under 1.4 ("KEEP STRAIGHT MATCH / BOX MATCH labels") the kept labels must be made true: Phase 1 computes yesterday's straight flag faithfully (any yesterday draw `result_digits === pick.bestOrder` over the hitting picks), same law as the verify reel. Data-honesty class (cf. DESIGN-03 F1).
- **F2 — the overlap defect, mechanism (inferred from the styles; not re-rendered this session).** `card` is fixed 960 with `overflow:hidden` (:439); `cols` is `flex:1` with **no overflow clip** (:441); `col` has `flexShrink:1` (:442); the `.grow` panels have `flexShrink:0` (:445). When the right column's content exceeds the band (three concentration rows with 2-line state footprints + three note paragraphs), the panels overflow the column's box, the band keeps its flexed height, and the footer is laid out at band-height + 12 and **paints over the overflowing panel** — "Intelligence…" and "First access…" over the cards. MKT-50 addendum 3 recorded "overflow: hidden on the column band"; it is **not in the current styles** (lost in MKT-53's rewrite). Phase 1 removes the overflow source (1.1/1.2) **and** restores a clip on the band **and** asserts fit (measured layout ≤ band) so an overflow fails the render instead of painting over — 1.6's "nothing drawn over a card, ever" needs the assert, not just the clip.
- **F3 — "Intelligence is your edge. Use it." is also the slate-composite footer:** `components/social/PublishStage.tsx:74` and `app/admin-image-export.tsx:518` — the free / Pro / public **slate-drop images**. Same R-B breach, outside this order's surface; needs its own ruling (one-line removal).
- **F4 — "first-access framing" is still the Pro rule in the linter:** `brandLint.ts:190–195` ("no pricing on the Pro group — first-access framing only"). The order now rules "First access — inner circle" a sales line; when 1.1 ships, that rule comment/suggestion text should be aligned so the next session does not re-add it.
- **F5 — MKT-53 is still an orphan** (code-stamped `SocialBriefCard.tsx:22`, no `### MKT-53` in MASTER_AUDIT). Carried; the Phase 1 layout work lands under MKT-82 and the audit entry notes MKT-53's provenance.
- **F6 — digit floor for 2.4, measured:** the 10/10 "4-8-5" = `playDigits` 28 pt on the 960 card → 56 px on 1920 → **2.92 % of frame width** → ≥ 31.5 px at 1080 output. In the present frame's screen after the 4:5 scale (~923 × 536 px), header + three TODAY rows + three YESTERDAY rows + footer at that floor needs ≈ 410–450 px of 536 — feasible, tight; the fit assert (F2) is the same mechanism that reports "does not fit" instead of shrinking.

## R. Rulings owed before Phase 1 ships

- **R1 — the 1.3 line trips R-B.** *"…No ranking changes the odds."* contains **`odds`**, which `brandLint.ts:79` blocks at every tier (no-edge-claim). Under 1.5 ("the brief does not render if it fails") the verbatim line would never render. Options: (a) the content agent rewords the last sentence without a listed word (e.g. *"No ranking changes what the draw will do."* / *"No ranking makes any combination likelier."*); (b) an exact-sentence allowlist for the canonical line (precedent: none — the 9/21 canonical line was written to pass the lint). **Recommendation: (a)** — a lint exception on the one surface that just failed the lint is the wrong precedent. Phase 1 ships with whichever sentence the agent returns.
- **R2 (minor) — the free and public variants.** The order addresses the Pro brief; the footer (#4) is on all three variants and the free footer "Pro members see it first ⚡" is a sales line on tier 2 (where it is allowed). Proposed: Phase 1 removes #4 on all variants (it is R-B everywhere), leaves the free CTA, touches nothing else on free/public. Say no and Phase 1 scopes to the Pro variant only.
- **R3 — F3's slate-composite footer:** remove under this ID in Phase 1 (one line, two files) or hold for its own order.

## P1. Phase 1 plan (ships on approval of this report + R1)

1. `SocialBriefCard.tsx` Pro body: remove #4, #7's 30d tile, #14–21 (concentration panel), #22–25 (analyst notes) → replace with the one 1.3 line (agent's final wording) as the footer; remove #5 on pro; keep #6–13 (yesterday per-session rows with true labels per F1; today plays in exact order with box sets). Two-column layout collapses to the single-column stack (the free composition, already built) — nothing left to fill a second column.
2. `socialBrief.ts`: drop `pro` insights from the data (`SocialBriefProInsights`, `allocation` mapping, `reorder`, `daytimeNote`) — the brief no longer reads `computeBrief().allocation`; add the faithful yesterday-straight flag (F1).
3. `lib/social/briefLint.ts`: collect the rendered strings for (data, variant, tier) → `lintCaption(tier)` + brief-specific blocking rules (0.6) → both capture paths (`ReelsView.tsx` `SocialBriefExport.generate`, `PublishView.tsx` `generateBriefImage`) call it first and refuse to capture on a block, with the violation shown in the status line. `check-brand-voice.ts` gains the 9/21 universal classes for the two brief files (static backstop).
4. Layout: `overflow:hidden` on the band + a fit assert (onLayout: content height ≤ band height, else the capture throws "layout defect: content does not fit — never shrink").
5. Verification: filtered tsc 0; `check:brand-voice` green; `lintBrief` unit list (the 25 strings above + the 1.3 line) blocks exactly the removed set and passes the kept set; one capture per tier eyeballed by the operator; MASTER_AUDIT MKT-82 Phase 1 block with the string-by-string diff; handoff v7.15.

Phase 2 (anchor frame) does not start until Phase 1 is live and both frames pass the gate (§A.d).
