# MKT-76 — The Receipts Photo Lane · Phase 0 discovery report

Date: 2026-09-09 · Status: **REPORTED, WAITING ON RULINGS** — nothing built, no migration, no table, no bucket.
ID check: `MKT-76` absent from MASTER_AUDIT, handoff, REEL_COMMANDS, scripts/constants/lib/components → free, stamped here.
Supersedes: the MKT-62b reel-beat order (handoff §8b, 8/19). The 62b label is retired; the source ruling from 62b carries forward unchanged and is re-encoded below.

Work order: content agent briefing + work order 2026-09-09 (Findings 1–5 + Phase 0 items 1–6). Findings recorded in the handoff v6.5 block J and in MASTER_AUDIT MKT-76.

---

## The one discovery that reshapes the build: a photo pipeline already exists

**Admin → Publish** (`components/admin/PublishView.tsx`, SOCIAL-01…13) is already a photo-post console, not a reel surface. Live today:

| capability | where | note |
|---|---|---|
| 1080×1920 PNG capture of app surfaces, client-side, no server | `lib/social/publishImages.ts` → `lib/captureExportImage.ts` | hidden stage + html-to-image; the reel body capture's sibling |
| multi-image "kits" (slate + 6 signal cards + brief card) | `imagePlan()` | a multi-photo post is already the shape of every group drop |
| surface model `public / free / pro / cross` with per-content allowed surfaces | `CONTENT_SURFACES` | the tier binding item 4 asks for is a one-line entry in an existing map |
| caption compose + tier lint (2 free / 4 pro) + copy-to-clipboard | `lib/social/captions.ts`, `lib/social/brandLint.ts` | a SEPARATE caption engine from the reels' `scripts/reel-captions.ts` |
| "Prep & Open": copy caption · download all images in composer order · open the group | `photosSaveOrder`, `downloadAllSequential` | camera-roll ordering already handled so image 1 lands first |
| handoff log to `social_posts` (service-role, via `fb-publish log_assist`) with image meta + same-day duplicate-caption flag | `logHandoff` | the "log the handoff" step exists |
| one-tap Pro chain after a free handoff | SOCIAL-12 | free → Pro re-post of the same kit |
| Page API photo publish with mandatory Two-Question NO/NO ack | `fb-publish publish_page_photo` | **the lane must be unreachable from this path** (item 4) |

Consequence: **no assembler work, no bucket for the composed output, no Reels-card work.** The composed images never need to live on a server — they are captured in the operator's browser and dragged into the Facebook composer, exactly as every group drop is today. The only genuinely new pieces are (i) the operator's screenshot entering the system with a source field and a reviewed flag, (ii) the board image for a PAST date, and (iii) the match assertion.

Also already on disk: the graded **board card** (`scripts/render-verify-slate.ts`) — six picks as published, matched ones marked with `DREW 618 · NC · MIDDAY`, foot `N OF 6 LANDED · RECEIPTS BELOW` — rendered from `slate_snapshots` and **cross-checked against `adaptive_tracking` with a fatal abort on disagreement**. That is the "our published board" image for option (c) and it already carries the discipline item 9 demands.

---

## 1. What does the post contain — three options, costed honestly

Costs are engineering days at this repo's pace; none includes copy.

### (a) The raw operator screenshot, cropped, posted as-is
- **Build:** upload path (file picker → private bucket → row with source + reviewed) + the review thumbnail + the handoff button. ≈ **1 day.**
- **What it proves:** nothing of ours. There is no HitMaster element in the frame; the post is LotteryPost's or the state's pixels with our caption under it. The match assertion (item 9) cannot apply because the post makes no claim in its own pixels — the caption makes it, and a caption is not checkable against the image.
- **Vocabulary:** the whole surface is third-party pixels — the crop/overlay/check ruling decides everything.
- Cheapest, weakest. This is the 8/6 format literally reproduced — and note what 8/6 was: realtime results photos on the PUBLIC PAGE with real digits, the surface and content the rules now bar (see the tier note under item 4).

### (b) The screenshot composed onto a branded card, our matching signal beside it
- **Build:** (a) + a card template (HTML, rendered by the same Playwright path as the board card, or client-side on the Publish stage) + the assertion gate. ≈ **2 days.**
- **Data we hold for the card:** our signal (`slate_snapshots` pick, rank, energy), the official result AS IMPORTED (`histories.result_digits` for date/session/jurisdiction), the match kind (`hit_straight` / `hit_box` via the faithful join — never a stored-flag count alone, BUG-162), PUBLISHED time (`marketing_reels.posted_at` of that session's free row, the verify_midday join in `scripts/reel-sameday.ts`), GRADED time (`adaptive_tracking.result_at`).
- **The one thing we cannot do:** read the screenshot. No OCR is proposed (a second fragile system, and the classifier lesson cuts both ways). So the card asserts OUR record against OUR import of the official result; the screenshot sits beside it as the independent witness and the operator is the only reader of both. That is the same trust shape as verify's ledger — plus a witness.
- Single image → the single-photo bucket (0.85% interaction rate in the export) unless paired.

### (c) A multi-photo carousel: our published board first, then the official result — **engineering agrees with your lean, and it is the CHEAPEST of the three**
- **Build:** (a) + a `--still` single-frame export from `render-verify-slate.ts` (the board card exists; ≈30 lines) or the Publish stage's slate capture extended to a past date (≈15 lines in an admin-only module, see item 2) + optional thin attribution strip on image 2 (copy is yours) + the assertion gate. ≈ **1.5 days.** Materially LESS than (b): no new composition template, the composed half already exists and is already cross-checked.
- **The method in the format's own shape:** image 1 is what we published before the draw (with the landed pick marked from our data), image 2 is what officially drew, captured by a human from a source we do not control. Two frames, one claim, checkable by the reader in the order the claim was made.
- Facebook keeps attachment order; the console's `photosSaveOrder` already reverses camera-roll saves so image 1 presents first on a phone.
- Multi-photo bucket (1.66% interaction rate — note this is only about equal to reels' 1.71%; the photo advantage in the export is VIEWS PER POST, i.e. distribution, not interaction quality — recorded under Finding 1).
- (b)'s card can be added later as image 3, or replace image 1 on a same-day midday receipt where the two timestamps are the story. Not in this order.

**Engineering recommendation: (c).** It is the product argument AND the cheapest build. No operator ruling on cost is needed — (c) < (b).

---

## 2. Where it lives and who triggers it

**Admin → Publish, as a sixth content kind `receipts`.** Not Admin → Reels: that is a video registry (mp4 + contact sheet + MKT-15 platform rows, none of which apply to a PNG pair) and its "posted" flag drives the verify_midday provenance join — a photo row there would pollute the reel record. Not a new screen: Publish already owns surface selection, kit build, caption, lint, copy, download-in-order, open-group, handoff log and the Pro chain. The receipts kind plugs in as `imagePlan(surface,'receipts') → [board still, official screenshot]`.

**Two sub-surfaces inside it:**
1. **Receipt intake** — date · session (midday | evening) · state (2-letter, the COMPLETE 50+DC set, not lint's partial set) · source · file picker (`<input type=file>` on web; `expo-image-picker` is already a dependency for native) → upload → thumbnail → the operator ticks **REVIEWED** (attestation text on screen: official page or results board · crop rule applied · no dollar amounts / slips / balances in frame). One row per (date, session, state).
2. **Compose + hand off** — pick a reviewed receipt → the gate runs (item 9) → the pair renders on the stage → Prep & Open (copy caption · download 2 images · open group) → log. Free first, Pro chain second, same as every drop.

**Trigger: operator-manual by construction.** The lane cannot start without a file chosen from the operator's device in that session; there is no data path a scheduler could run. Groups have no publish API (Meta, 4/2024) so nothing can auto-post even in principle. The Page API scheduling path (`scheduled_publish_time`) exists in the console — the tier binding (item 4) makes it unreachable for this kind. No cron, no `reel:daily` hook, no `run-daily-reels.sh` line (OPS-01 stands).

**Board image for a PAST date:** the Publish stage captures TODAY's slate only (`loadSlatePicks` queries `slate_date=eq.today`, mirroring `explore.tsx`). Same-day midday receipts (the common case — midday results land ~12:30–3:30 PM ET, the board is today's) need nothing. D−1 evening receipts (posted next morning) need either (i) a `date` parameter on `loadSlatePicks` — an ADMIN-ONLY module in `lib/social/`, not a consumer data path, ≈15 lines, plus the snapshot-vs-tracking cross-check ported from `render-verify-slate.loadSlate` (≈20 lines); or (ii) the node `--still` export dropped into the intake as a second upload. (i) is cleaner and keeps the whole lane in one surface. Recommend (i).

---

## 3. Storage + schema

**Table `marketing_receipts`** (new; NOT a kind on `marketing_reels`):

| column | type | note |
|---|---|---|
| id | uuid pk | |
| receipt_date | date | ET draw date |
| session | text CHECK in (midday, evening) | two-bucket rule |
| state | text CHECK ~ '^[A-Z]{2}$' | validated against the complete set in code |
| source | text CHECK in ('official_state_results','results_board') | see the ruling conflict below |
| image_path | text | bucket-relative |
| image_sha256 | text | the reviewed bytes are the reviewed bytes |
| width, height | int | crop sanity at review |
| reviewed | boolean default false | operator attestation |
| reviewed_at | timestamptz | |
| crop_attested | boolean default false | the third-party-wording ruling, if (a)/(c) below |
| hit_scope, hit_combo, hit_state | text, nullable | the linked hit row key — written BY THE GATE at compose, never by hand (join by date+scope+combo+state, never slate_hash) |
| posted_free_at, posted_pro_at | timestamptz | the handoff log in `social_posts` remains the record; these are the per-room flips |
| note | text | |
| created_at, updated_at | timestamptz | |
| UNIQUE (receipt_date, session, state) | | |

RLS on, **no anon policies** (unlike `marketing_reels`, which is anon-read: a third-party screenshot with real digits must not be anonymously readable). Writes: PATCH (reviewed, posted flips) through `admin-ops` (add the table to `ALLOWED_TABLES`, one line); INSERT + upload through a new `fb-publish` action (it already carries the admin-key auth and the `social_posts` writer).

**Bucket `marketing-receipts`, PRIVATE** (the reels bucket is public by design — pre-publication marketing content served by URL; a raw results-page screenshot is not that). 10 MB cap, `image/png` + `image/jpeg`. Upload path: the edge action returns a **signed upload URL** (`createSignedUploadUrl`) + inserts the row; the client PUTs the bytes directly, so a 3–4 MB phone screenshot never rides through a function body as base64. Reads via signed URLs (short TTL) for the review thumbnail and the compose stage. The tier binding gets a storage-layer twin for free: nothing in the bucket has a public URL to leak.

**Migration cost:** one SQL file, ≈45 lines (table + CHECKs + RLS + bucket insert + two storage policies). A DDL path EXISTS this session (Supabase MCP `apply_migration`; the MKT-62 "no DDL path" note is stale). Client + edge ≈ 150 lines. `reel:check` gains one probe (bucket reachable, every reviewed row's object present, no row with an unknown source) — the 62b shape, ≈40 lines.

**Retention — no kind test needed.** `supersedeOlder()` and `prune()` in `publish-reels.ts` operate on `marketing_reels` + the `marketing-reels` bucket only; a separate table and bucket never enter their candidate set, so the MKT-46 / verify_midday exemption pattern (and `reel:check`'s source-asserted test at line 738) does not apply. Receipts are the record: keep-forever by default. If the operator wants a prune it is a NEW function with its own test, not a widening of the reel prune. Had the lane been modelled as a `photo` kind on `marketing_reels`, ALL of that would have been owed (CHECK widening, `KIND_UI`, `RETENTION_EXEMPT_KINDS`, the kind test) — the separate table is why it is not.

**⚠ Source ruling conflict to resolve in writing.** The 8/19 ruling (handoff §8b) said "no Lottery Post (ToS) … `official_state_results` the only accepted value at launch." Today's ruling says "official state lottery results pages, OR third-party results boards such as LotteryPost showing draw results." The repo's standing note on LotteryPost is that its ToS bars scraping — an operator screenshot for a post is not scraping, but reposting their page image is a different question (their copyright, their branding in our post). Engineering encodes BOTH values in the CHECK and gates compose on a code-side allowlist (`RECEIPT_SOURCES_ALLOWED`) so the tighter rule can be applied without a migration; launch value = whatever you rule. Recommend: `official_state_results` only at launch, `results_board` admitted per-source after a look at one real capture.

---

## 4. Tier — FREE GROUP AND PRO ONLY: expressible, three layers

1. **Type layer:** `CONTENT_SURFACES.receipts = ['free','pro']`. The console cannot offer Public or Cross for this kind; the `Surface` union stays as is, the map excludes them. Existing pattern (e.g. brief kinds).
2. **Server layer:** `fb-publish publish_page_photo` refuses `kind='receipts'` (422) regardless of any Two-Question ack — defense in depth for a future console change. Same shape as the tier-1 lint refusal it already does.
3. **Storage layer:** private bucket, no public URL exists to be pasted anywhere.

Cross-post is barred for the same reason as verify_midday: real digits + state attribution + a third party's pixels; no relabel or mask exists for a screenshot (`--redact --relabel` operates on OUR DOM, not on pixels). A public version = a separate MKT with its own masking build, as you said.

**One thing to say out loud:** the per-post numbers in Finding 1 are PAGE data (the export's 150 reels YTD is the page's count — the groups post ~9 reels a day). The 8/6 649-engagement day was PAGE photos with real digits. The lane as tiered reproduces the FORMAT on the GROUPS, not the surface where the format was measured. The groups are opted-in rooms of ~485 / ~63 members; the page is 14K followers. Expect the group-side read to be small in absolute terms (free room today: 3.3 reactions/day, 60 active members/day). This is not an argument against the lane — the product argument stands on its own — it is the honest expectation for the number.

---

## 5. Caption — its own family, registered in the Publish console's engine

Recommend a **small dedicated family (4–6 templates)**, not a variant of the verify free-group set, because the structure differs: one state, one draw, one signal, two images in order — not "N of 6" over a board. Slots available from data: `{date}` `{session}` `{state}` `{combo}` `{match}` (STRAIGHT MATCH / BOX MATCH, locked vocab) `{published_at}` `{elapsed}` (the reel-sameday join gives PUBLISHED; GRADED = `result_at`) `{source_label}` (your attribution copy). Tier-2 lint on free, tier-4 on Pro (no pricing in Pro copy; `social_pro_price` stays out). Registered in `lib/social/captions.ts` — the Publish console engine — NOT `scripts/reel-captions.ts` (a different engine; the receipts post is not a reel). Whether the MKT-71 rotating question line rides on it is your call; the engine can append it.

Also owed from you (unchanged from 62b): the attribution line under/over image 2, and the Two-Question record for the pair even though it is tier 2/4 — the record, not the gate.

---

## 6. Cadence — the cost and the risk, stated together; nothing encoded

**Supply (live data, 8/10–9/8, 30 days, deduped scope|combo|state, balanced mode):**

| session | days with ≥1 match | median matched rows/day | mean distinct states/day | days with a STRAIGHT |
|---|---|---|---|---|
| midday | 24 of 30 | 2.5 | 2.1 | 6 |
| evening | 26 of 30 | 3 | 3.0 | 10 |

So on a typical day there are 2–3 states to choose from per session; one post per session is the natural unit (one state, one draw, your pick of the straight if there is one). **Ceiling ≈ 2 posts/day per room (midday ~4 PM, evening next morning or ~11 PM), floor 0 on ~20% of days.** Per post, manual: capture 1–2 min · upload + review 1 min · compose + hand off 2 min · Pro chain 1 min ≈ **5–6 min operator time.** Two per day ≈ 10–12 min/day, on top of the 9-reel morning run and the verify_midday afternoon.

**What it stacks on (Group Insights, 8/24–9/6):** free room **3.9 posts/day** (all ours: allday_free, midday_free, evening_free, verify, some days verify_midday, the Morning Brief photo), 3.3 reactions/day, 1.8 comments/day, 60 active members/day; Pro room 4.0 posts/day, 3.1 reactions, 0.7 comments, 30 active. Two receipts posts → **~6 posts/day per room, +50%.**

**Finding 4, read against this lane:** the 13 hides are PAGE feedback ("Hide this post" on page content in followers' feeds). This lane never touches the page, so it cannot move the page's hide count — the tier binding is also the cadence shield for the surface that is under review. The risk transfers to the GROUPS, where the equivalent signals (mute group, leave, hide-from-feed on group posts) are NOT in any series we hold — `fb_group_daily` carries posts/comments/reactions/active_members only. So the group-side risk is real and unmeasured; the measurable proxies are `active_members/day` and `reactions per post` before/after, which the Funnel dashboard already reads from `fb_group_daily`. Recommend: if the operator rules the lane on, start at ONE post/day (the session with the straight, else evening), read active/day and reactions/post over two weeks against the 8/24–9/6 baseline above, then decide the second. **This is a report of cost and risk, not a frequency — the operator rules.**

**And it does not enter the 9/9→9/23 window.** Build, gate, hold — same as the verify_public cold open. A held build here is trivial: the content kind is simply absent from the console's kind list until a flip.

---

## Item 9 — the match must be asserted, not assumed (Phase 1 spec, recorded now so the gate is ruled before the build)

At compose, for (receipt_date, session, state) and the board scope chosen (midday | allday | evening):
1. `slate_snapshots` for (date, scope) must exist → the board still renders from it; its per-pick `hitType` set is cross-checked against `adaptive_tracking` (the `loadSlate` discipline) — disagreement = abort with both sets printed.
2. `adaptive_tracking` (balanced, deduped) must contain ≥1 matched row with `matched_state = state` and `matched_session = session` on that scope; the linked hit key is written to the receipt row from THIS join.
3. `histories` must contain the row (date_et, session, jurisdiction=state); its `result_digits` are the only digits our pixels may show; its `comboset_sorted` must equal the matched pick's comboset — a second, independent equality (the same join `render-public-hook.ts` uses for `hm_hook_verified`).
4. Any of 1–3 missing or unequal → **the pair does not compose** and the console shows both figures. No override switch.

What the gate cannot do: read the screenshot. The reviewed thumbnail is displayed beside our digits at REVIEWED so a disagreeing import is seen by a human before anything composes.

---

## Third-party wording — options, not a choice (brand ruling)

| option | cost | checkable? | note |
|---|---|---|---|
| (a) mandatory crop to the draw line (date · session · digits); operator attests at REVIEWED | ≈0 code (a checkbox + attestation text); review thumbnail shows the crop | yes — the thumbnail IS the check | the 8/19 engineering lean; the least third-party surface |
| (b) a mask we paint over a declared header zone | ≈100 lines + a per-source zone table; breaks when a page layout changes | partly | a second system; fragile per source |
| (c) an operator checklist ack at upload ("no WINNING / JACKPOT / PAYOUT wording visible · no dollar amounts · no slips / balances") — the Two-Question shape | ≈20 lines | yes — mechanical, logged on the row | pairs with (a); the brief's own lesson is that judgment must be mechanical |

Engineering lean, offered not chosen: **(a) + (c)** — the crop keeps the wording out, the checklist makes the attestation mechanical and logged. Rule in writing.

---

## What the content agent owes for Phase 1 to start
1. Item 1 ruling (c recommended; no cost objection exists).
2. Source ruling resolved in writing (LotteryPost boards in or out at launch).
3. Third-party wording ruling (a / b / c / combination).
4. Attribution copy for image 2 + the caption family (or the go-ahead for engineering's provisional 3-line set, tier-2 linted, to be replaced).
5. Two-Question record for the pair (tier 2/4 — a record, not a gate).
6. Operator: the cadence ruling (cost + risk above), and the review-window read (after 9/23) — the lane holds until then regardless.

Phase 1 build list is items 7–11 of the order, unchanged; Phase 2 verify is 12–15, with the 9/7 receipts (4 of 6, all box — no straight day) as the first compose target.
