# MKT-85 — CAPTION SYSTEM v2 — PHASE 0 REPORT (report only; build on ruling)

Content agent (Ledger) spec 2026-10-11. Report by Claude, 2026-10-11. **ID: MKT-85** — 84 is the number your spec itself cites as "the MKT-84 rule" (distinct draw events) and reserved for the straight-tag order; neither 84 nor 85 is filed in MASTER_AUDIT, so this takes 85 and 84 stays yours. Nothing built; no reel, endcard, carrier or engine file touched.

**Operator ruling recorded 2026-10-11 (during this report): "the captions ARE allowed to name states for matches."** Applied in (b) and (e) below: a match fact line may carry state names on every tier, including the public page; the lint's tier-1 `public-no-state-code` rule gets a carve-out for the FACT slot at build (rule change, not a reword of your lines).

## a. Current families → the v2 anatomy

Four sources carry captions today. Mapping is by what each line DOES, line by line; "no home" means v2 has no slot for it.

**1. `scripts/reel-captions.ts` — the reel pipeline (built at publish, stored on `marketing_reels.caption` / `caption_pro`).** Whole-caption templates, `(dayOfYear + offset) % N` rotation, data contexts wired per kind.

| kind (tier) | templates | → HOOK | → FACT | → CTA | → QUESTION | no home |
|---|---|---|---|---|---|---|
| verify (2, free draft) | 12 + fallback | the opener clause of each ("Receipts are in 🧾", "The tape doesn't lie", "Grade day", "Scoreboard check 📊", "We published these before the draw…") | the `makeQualCtx` clause (qualitative scale/spread/straight words) → v2 replaces with the STATES / STRAIGHT fact line (real, distinct-draw) | none today | the closers "Watch the tape, then check your state" / "Pull your state's results and compare" / "Check it yourself" are proto-questions → Q8 | "Tomorrow's signals drop in the morning" (#6 tail) |
| verify_pro (4) | 12 + fallback | "Pro receipts, full detail" / "Numbers on the table" / "Your receipts" / "Published first, graded after" | `credLine` + `straightLine` (v of t verified, N states, STRAIGHT in GA) → v2 FACT, but **per board row, not distinct draw events** — see d | none (correct for tier 4) | none | "zero spin", "The tape's in the reel" flourishes |
| allday_free (2) | 12 | "Today's All-Day board is live 🔆", "New day, new board", "Board's set", "Full board, free" | none (ungraded board) | none — SOCIAL-13 pure value, **v2's tier-2 CTA slot must stay EMPTY on this kind** (the spec's anatomy gives tier 2 a Pro line; allday_free is the ruled exception) | "Run your state against the reel", "Grade us yourself tomorrow" → Q8/Q1 | methodology sentences ("four measures each") |
| allday_pro / midday_pro / evening_pro (4) | 12 each (session factory) | "Pro first look 💎", "You see it first", "Early access delivered", "before the crowd", "Your head start", "First in, as always", "Ahead of {when}" | `credLine` (same as verify_pro) | none | none | **the first-access family** — 12 templates already flagged unruled after F4 (regex-clean, first-access by meaning); v2's P-bank replaces them, see b |
| midday_free / evening_free (2) | 12 each | "The {label} board is up 🔆", "Everything but the digits", "Cover comes off in the morning" | none | the price clauses ("Pro reads the same board in full at $2.49/mo", "$2.49/mo, same board, nothing masked") + the MKT-77 line-one lead "Pro reads these digits before the draw: {pro_url}" → C-bank | none | the methodology clauses ("pair analysis, co-occurrence, draw-gap consistency") |
| allday_public (1) | 8, link-first + tags | "Six signals. 40+ states and provinces." (the MKT-66 scale lead) / "Four measures. Six signals." / "This is what pattern analysis looks like at scale" | none | L0 link (already the v2 shape) | none | "40+" is now "42" everywhere else — the public set still says 40+ |
| verify_public (1) | 8, link-first + tags | "40+ states and provinces, checked draw by draw" / "Six signals published yesterday" / "We grade our own analysis in public" | none | L0 link | none | #5's masking line ("The values are covered here") — the deliberate 1-in-8 dose, no v2 slot |
| verify_midday (2) | 8 + fallback, straight-led + Pro CTA | "Posted this morning. Graded this afternoon." / "Same-day receipts" / "We didn't wait until tomorrow" / "Same day. Not tomorrow." (= M1–M5 almost verbatim) | the `{elapsed}` gap line + the structural STRAIGHT lead (`samedayStraightLead`) → FACT (same-day form; not in the spec's §5 — needs a line) | `MIDDAY_VERIFY_CTA` (= C1's ancestor) | none | the multi-paragraph bodies |
| record_public (1) | 8, link-first + tags | R1–R5 are these lines compressed ("30 days on the record", "A record is only worth reading if the misses are on it", "Same six for everyone") | none by STAT-01 R-A (figures retired 9/21) | L0 link | none | — |

Rotation memory today: none beyond the day index (same date → same caption); no per-line ids; nothing recorded on the row except the rendered text.

**2. `lib/social/captions.ts` — the Publish console (Admin → Publish; brief / report card / slate drop / signal announce / custom per surface).** Line-structured already: emoji + date opener → one body sentence → closer → `proCta` on free. Map: openers ("📊 Yesterday's report card — {md}", "{e} {md} daily brief — published.") → HOOK (all under 80); the report-card body ("{v} of {t} signals matched … across {jx} jurisdictions" + per-jurisdiction STRAIGHT/BOX lines) → FACT, **per jurisdiction deduped, exact-beats-box** (`reportCard.ts:107-126`) — a jurisdiction count, not a draw-event count; `proCta` ("Not in the Pro tier yet? {url} — $2.49/mo for inner-circle drops first.") → C-bank, ⚠ "inner-circle" is the F4 word on a tier-2 line — legal at tier 2 but worth your eye; `CTA_FREE` pool ("👇 Free community link in bio.") → L0 on public; closers "Every day goes on the record, match or miss." / "On the record, like every day." → record lines, no v2 slot (could be the FACT variant for N = 0). No questions anywhere. **No home:** `signalAnnounce` and `slateDrop` method phrases ("Pattern recognition engine run complete.", "Real-time signal processing across 30+ jurisdictions." — note "30+") and the cross-post block ("Posting with permission…").

**3. The captions sheet (`scripts/render-captions-pdf.ts`).** Brief family = `generateCaption('brief', …)` per surface (source 2 above); anchor thread = QUESTION bank already (the Q-bank's ancestor, rotating by date, tier-4 linted); Sunday receipts thread caption + Omni prompt (no v2 slot — a thread opener, not a post caption); **Sunday receipts image captions (10/11, approved) = S1, kept verbatim**, already in the v2 shape (public: L0 link → hook → fact → question; free: hook → CTA → question). The Pro receipts caption is still unwritten.

**4. The YouTube set (`constants/socialPlatforms.ts` `YT_SHORTS_SETS`).** allday_public: 8 titles / 4 descriptions · verify_public: 6 titles / 3 descriptions · record_public: 6 titles / 3 descriptions. Titles are HOOK-shaped (≤ 80, tier-1 clean, e.g. "Six signals, ranked before the draw"); descriptions are body + link. No question, no fact. v2 can feed the YouTube title from the H-bank at tier 1 and keep the description as today.

**Kept verbatim regardless:** the 10/11 Sunday receipts captions (S1), the 16 delivered public templates (MKT-24/40/67), the eight verify_midday lines (8/19), the MKT-37 #9–12 sets, R1 of record_public (the agent's STAT-01 line) — every operator- or agent-delivered line stays as the fallback family until v2 is eyeballed a full week per kind.

## b. Lint of every v2 bank line (live rules: `lintCaption` at the tier + the brief rule-set `BRIEF_RULES` incl. R-A / R-B / F4; placeholders filled with Friday · 10/10 · NY, PA · the live links)

| id | bank | chars | verdict under the CURRENT rules |
|---|---|---|---|
| V1 | verify | 71 | PASS t2/4 |
| V2 | verify | 55 | PASS t2/4 |
| V3 | verify | 35 | PASS t2/4 |
| V4 | verify | 54 | PASS t2/4 |
| V5 | verify | 55 | PASS t2/4 |
| V6 | verify | 53 | PASS t2/4 |
| V7 | verify | 50 | PASS t2/4 |
| V8 | verify | 51 | PASS t2/4 |
| M1 | verify_midday | 52 | PASS t2 |
| M2 | verify_midday | 53 | PASS t2 |
| M3 | verify_midday | 59 | PASS t2 |
| M4 | verify_midday | 49 | PASS t2 |
| M5 | verify_midday | 43 | PASS t2 |
| F1 | session_free | 43 | PASS t2 |
| F2 | session_free | 53 | PASS t2 |
| F3 | session_free | 48 | PASS t2 |
| F4 | session_free | 38 | PASS t2 |
| F5 | session_free | 46 | PASS t2 |
| F6 | session_free | 56 | PASS t2 |
| P1 | pro | 44 | PASS t4 |
| P2 | pro | 44 | PASS t4 |
| P3 | pro | 26 | PASS t4 |
| P4 | pro | 52 | PASS t4 |
| P5 | pro | 39 | PASS t4 |
| P6 | pro | 31 | PASS t4 |
| A1 | allday_public | 53 | PASS t1 |
| A2 | allday_public | 43 | PASS t1 |
| A3 | allday_public | 53 | PASS t1 |
| A4 | allday_public | 43 | PASS t1 |
| A5 | allday_public | 48 | PASS t1 |
| R1 | record_public | 53 | PASS t1 |
| R2 | record_public | 47 | PASS t1 |
| R3 | record_public | 56 | PASS t1 |
| R4 | record_public | 39 | PASS t1 |
| R5 | record_public | 44 | PASS t1 |
| B1 | brief | 61 | PASS t4 |
| B2 | brief | 39 | PASS t4 |
| B3 | brief | 27 | PASS t4 |
| S2 | sunday | 50 | PASS t1/2/4 |
| S3 | sunday | 57 | PASS t1/2/4 |
| C1 | cta | 70 | PASS t2 |
| C2 | cta | 58 | PASS t2 |
| C3 | cta | 64 | PASS t2 |
| C4 | cta | 61 | PASS t2 |
| C5 | cta | 56 | PASS t2 |
| K1 | cta_pro | 42 | PASS t4 |
| K2 | cta_pro | 43 | PASS t4 |
| FS1 | fact | 52 | PASS t2/4 |
| FS2 | fact | 46 | PASS t2/4 |
| FE1 | fact_public | 45 | t1 BLOCK public-no-state-code:"NY" |
| FX1 | fact_states | 30 | t1 BLOCK public-no-state-code:"NY" · t2 PASS · t4 PASS |
| Q1 | question | 39 | PASS t1/2/4 |
| Q2 | question | 46 | PASS t1/2/4 |
| Q3 | question | 37 | PASS t1/2/4 |
| Q4 | question | 47 | PASS t1/2/4 |
| Q5 | question | 35 | PASS t1/2/4 |
| Q6 | question | 60 | PASS t1/2/4 |
| Q7 | question | 50 | PASS t1/2/4 |
| Q8 | question | 33 | PASS t1/2/4 |
| Q9 | question | 35 | PASS t1/2/4 |
| Q10 | question | 48 | PASS t1/2/4 |
| Q11 | question | 66 | PASS t1/2/4 |
| Q12 | question | 43 | PASS t1/2/4 |
| Q13 | question | 50 | PASS t1/2/4 |
| Q14 | question | 45 | PASS t1/2/4 |
| Q15 | question | 49 | PASS t1/2/4 |
| Q16 | question | 42 | PASS t1/2/4 |
| Q17 | question | 64 | PASS t1/2/4 |
| Q18 | question | 65 | PASS t1/2/4 |
| Q19 | question | 48 | PASS t1/2/4 |
| Q20 | question | 48 | PASS t1/2/4 |

**Blocks under the current rules (2) — OVERRULED by the operator 10/11:** `FE1` and `FX1` at tier 1 trip `public-no-state-code` (§6, public page: no state codes). The operator ruled during this report that captions ARE allowed to name states for matches. So: not a block on your lines; a rule change at build — `brandLint`'s tier-1 state-code rule gets a carve-out for the FACT slot (match lines only; hooks, CTAs and questions stay under the rule), recorded as the operator's ruling in the audit, and `check-reel-assets` lints the assembled caption accordingly. Everything else in the bank is PASS at every tier it claims.

**Regex-clean, flagged by meaning (yours to rule, not reworded):**
- `P2` "First look is yours." and `P4` "before the free group sees it." — first-access framing on tier 4, the class the F4 ruling retired ("never commercial, no first-access framing"); the regex catches `first-access` / `see it first` / `inner-circle`, not these phrasings. Same class as the 12 unruled Pro templates (handoff v7.17).
- `F3` "Pro just sees them first." and `F5` "Pro found out at 8:30." — first-access framing on tier 2, where selling the gap is sanctioned; fine by the rules, noted for consistency.
- `Q5` "the daily numbers", `Q6` "your own numbers", `Q14` "followed the daily numbers", `Q15` "checks the numbers", `Q18` "one of your numbers" — §5 bars *numbers* as the product noun (the system says signals / digits; the ruling is recorded in reel-captions.ts). The lint has no rule for it. These five are the warmest lines in the bank and they are about the reader's numbers, not ours — your call whether §5 reaches the reader's own vocabulary.
- `Q3` "past draws", `Q12` "the results" — clean; "draw" is group- and tier-1-legal in captions (only tags ban it).
- `V1`, `A3`: "42 states & provinces" — the brief's form; the public reel sets still say "40+ states and provinces" — pick one (R-C says 42).
- `C1` is `MIDDAY_VERIFY_CTA` minus "at 8:30 AM, every day" — same claim, fine.
- Two-Question filter: applies to images/videos, not caption text — N/A here; its caption analogue is the tier-1 strict lint, and every tier-1 hook passes it. No hook contains a 3-digit run.

## c. Hook character counts
All 42 hooks are ≤ 80: longest `V1` at 71, then `B1` 61, `M3` 59, `S3` 57, `R3` 56, `F6` 56; shortest `P3` 26. (CTA lines run 56–70, questions 33–66; neither has the 80 rule.) Counted in code points, an emoji = 1.

## d. Fact-line data per kind — is the distinct-draw count available at caption time?

| kind | when the caption is built | data in hand | distinct draw events (MKT-84 rule) available? |
|---|---|---|---|
| verify / verify_pro | `publish-reels` at publish, `fetchReceiptsData(reelDate)` | every `histories` row of the day with `jurisdiction, session, result_digits` + the boards (slate ∩ histories, no stored flags) | **YES with one change**: today `straightJx` is keyed by jurisdiction (a jurisdiction with straights in both sessions = 1); v2 needs the (session, jurisdiction) draw key — the §D harness `straights_weekly.ts` already computes it; ~15 lines in `fetchReceiptsData` |
| allday_pro / midday_pro / evening_pro | publish, receipts date = D−1 | same join | yes, same change (the fact line is "yesterday"; D−1 is resolved) |
| midday_free / evening_free, allday_free | publish, no receipts fetched (`realNumbers: false`) | nothing | needs the receipts fetch switched on for the kind (`kindNeedsReceipts` derives from the spec flags — one flag) |
| verify_midday | publish, `SamedayCtx` from the renderer's own join (`reel-sameday.ts`) | elapsed gap + straights count (deduped rows, BOTH boards) | **partially** — `sd.straights` is a row count over both boards, not draw events; §5 has no same-day form anyway → needs a line and a (session, jurisdiction) count from `reel-sameday.ts` |
| allday_public / verify_public / record_public | publish, static | nothing | with the state ruling the STATES / EXACT lines can run on tier 1 once the receipts fetch is switched on for the public kinds |
| brief (captions sheet) | `render-captions-pdf` at sheet build; the sheet only gets `briefCfg` | `reportCard.matches` (per jurisdiction, exact-beats-box) is one call away | yes if the sheet calls the resolver per draw (same shape as the weekly builder) |
| Sunday receipts | S1 verbatim — no fact line | — | — |
| Publish console `report_card` | on demand, `fetchReportCardData` | per-jurisdiction deduped | needs the (session, jurisdiction) key too |

Rule of silence: every path above degrades to "omit the line" on a missing read today (fallbacks exist on every receipts kind); v2 keeps that.

## e. Proposed storage

**Banks — one versioned JSON, the lexicon pattern** (`docs/freshcut/lexicon.schema.json`: a semver `lexicon_version`, dimensions of fragments with ids, a conflict table; owned by the content agent, stored and versioned by Claude Code, changes affect only future builds):
- `constants/captionBanks.v2.json` + `constants/captionBanks.schema.json`. Shape: `banks_version` (semver) · `hooks[kind][] {id, text, tiers[], since, retired?}` · `ctas[tier][]` · `facts {straight, exact_public, states}` · `questions[]` · `rules {hook_max_chars: 80, no_same_hook_consecutive_days, question_once_per_day, question_cooldown_days: 7, cta_no_consecutive}` · `live_kinds[]` (the week-per-kind eyeball switch). Ids are stable forever (a retired line keeps its id with `retired: <date>`), so the later hook/question ranking joins on them. Lint at build: a `check-reel-assets` section loads the JSON and lints every line at every tier it claims (today's harness, promoted) — FAIL on a block, with the FACT-slot state carve-out per the operator's ruling.
- Approved verbatim families (S1, the delivered public sets) are referenced by id from the same file so one place says what rotates.

**Per-post ids — on the row that is the post:**
- `marketing_reels`: add `caption_meta jsonb` (one column, not four): `{v: "2.0.0", hook: "V3", cta: "C2", q: "Q7", fact: {on: true, type: "straight"}, hook_pro, q_pro}` — verify rows carry two captions so the meta carries both sides. Migration `scripts/migrations/2026_10_1x_mkt85_caption_meta.sql` (the MKT-79 file is the template; applied FIRST via the MCP as every kind-check change was). `lib/marketingReels.ts` gets the field; publish-reels writes it beside `caption` / `caption_pro`.
- Rotation memory = the rows: at build, read the kind's last 7 days of `caption_meta` (hook ≠ yesterday's, question not within 7 days on the kind, CTA ≠ yesterday's) and the day's rows across kinds (question once per day). No new table.
- Posts without a reel row (brief photo, Sunday receipts image, Publish console): the captions sheet prints the ids beside each caption, and the Publish console's `log_assist` row (the same-day duplicate-caption trail) takes the same `caption_meta`. Nothing more until the ranking table exists.
- Admin: the Reels row's caption card shows `hook V3 · cta C2 · q Q7 · fact straight` under the draft (one line in `components/admin/ReelsView.tsx`, no new screen).

**Assembler** (on approval): `lib/social/captionAssembler.ts` — pure, `(kind, tier, date, facts, memory) → {text, meta}`; `{link_pro}` = `app_config.social_pro_url` (the Pro pinned-comment URL, the same source as today's `{pro_url}`), `{link_free}` = `social_free_group_url`; `buildReelCaption` calls it for kinds on `live_kinds` and falls back to the old family otherwise.

Rulings owed before the build: P2/P4 and the five "numbers" questions (b), the allday_free CTA exception, the verify_midday same-day fact form, 40+ vs 42, the scope of the state carve-out (fact slot only, as proposed), and the ID (85).
