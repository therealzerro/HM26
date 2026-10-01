# FRESHCUT — PRODUCT, DELIVERY AND ASSEMBLY PLAN

Pre-work-order design document · content agent (Ledger) · 2026-09-24
Status: PLAN. Nothing here is built or ordered. Operator reads, marks up, then a Phase 0 work order goes to Claude Code.
Stored verbatim by Claude Code on 2026-10-01 as a source document for the FreshCut scope (see `SCOPE_2026-10-01.md`). Companion: `intake_concept_2026-09-24_ledger.md`, which replaces §4 F4's questionnaire and §6 `intake` below. Not edited.

⛔ SEPARATE ENTITY. FreshCut is not HitMaster. Separate repo, separate Supabase project, separate Stripe account, separate domain, separate handoff file, separate audit. HitMaster code is never imported; HitMaster KNOW-HOW is (asset laws, rotation logic, gates). Claude Code must be told this in the first line of the first order.

## 1. THE PRODUCT, IN ONE PARAGRAPH

A creator records or uploads a clip of themselves talking (a "body"). FreshCut wraps it in a broadcast package built for that creator alone — a rotating set of custom intros, stingers and endcards generated from their brand — and hands back a finished vertical reel, captioned, named, ready to post. They never open an editor. Their feed looks like a show.

What we sell: a SHOW PACKAGE (the kit, made once) plus an ASSEMBLY SERVICE (reels per month). What the client experiences: upload → wait a few minutes → download.

What it is NOT: a template store (CapCut), an editor (Descript), a generic AI video tool. Every kit is bespoke to one client. That is the whole moat, and it is exactly the HitMaster asset pipeline pointed at a paying stranger.

## 2. WHAT THE CLIENT RECEIVES

**2.1 THE KIT** (built at onboarding, revised once, refreshed quarterly)

| asset | count by tier | spec |
|---|---|---|
| INTROS | 5 / 8 / 10 | 4–6s, the creator's name and show, motion in their palette, ends on a level note for the seam |
| STINGERS | 5 / 7 / 10 | 3s brand hits between intro and body |
| ENDCARDS | 3 / 4 / 5 | 6.5s, CTA text from intake (follow, subscribe, link, sponsor slot) |
| IDENTITY CHIP | one | name/handle lockup, first 2s of body |
| BED | one | a low hum under intro/stinger, ducked under body |
| LOWER THIRD | one | optional, tier 2+ |

Every asset: 1080×1920, 30fps, .mp4 H.264/AAC, exact lowercase name, ffprobe'd on landing. The HitMaster asset laws apply verbatim.

**2.2 THE REELS (monthly credits).** 5-PACK / 10-PACK / 20-PACK reels per month. One credit = one body wrapped and delivered. Unused credits roll one month. Re-roll of the same body with different rotation members is free once.

**2.3 PER REEL, DELIVERED**
- the .mp4 (9:16 primary; 1:1 and 16:9 renditions tier 2+)
- burned-in captions (on by default; whisper-transcribed, client can edit the text before final render)
- a thumbnail
- a suggested caption + hashtags (text, editable)
- a signed download link + "copy caption" — nothing auto-posts. (Same law as HitMaster: nothing FreshCut does touches a platform.)

**2.4 THE TEST REEL (the funnel hook — see §4).** A prospect uploads one 20–60s clip and gets, in minutes, a watermarked reel wrapped in the FreshCut HOUSE KIT with their name text-overlaid. No custom assets, no card, no account beyond an email. It exists to make the purchase decision obvious.

## 3. TARGET CLIENT AND PRICING SHAPE (numbers are placeholders to rule on)

Fitness coaches, podcasters, YouTube show hosts, streamers — anyone who already produces talking-head footage and posts inconsistently because finishing is the bottleneck. They have the body. They lack the package.

| item | price |
|---|---|
| KIT SETUP (one-time) | $X — covers the Omni production + QA |
| 5-PACK | $Y/mo |
| 10-PACK | $Z/mo |
| 20-PACK | $W/mo |
| KIT REFRESH (quarterly) | add-on |

⚠ Pricing is ruled after client #1 tells us the real production hours. Do not publish prices until then.

## 4. THE FUNNEL — discovery to renewal

- **F1 DISCOVERY** — Fiverr gig ("custom branded reel package"), DMs to creators who post raw talking-head, the HitMaster reels themselves as the portfolio ("we make these daily").
- **F2 LANDING** — freshcut.works — three before/after pairs (raw clip vs wrapped reel), the packages, one button: TRY IT FREE.
- **F3 TEST REEL** — email → upload one clip → house kit assembly → watermarked reel on-page + emailed in ~5 min. This is the first time the machine runs for them and it is the sale. Capture: email, category, handle.
- **F4 PURCHASE** — pick a pack → Stripe Checkout → account created → INTAKE QUESTIONNAIRE (the one already written: brand words, colors by description, vibe, references, logo, CTA, handles). Kit setup fee charged here. _[Superseded by the Intake-as-a-Mirror concept: the nine screens replace the questionnaire as the client-facing surface.]_
- **F5 KIT BUILD** — HUMAN-IN-THE-LOOP, 3–5 business days. Content agent writes the Omni prompts from the intake; operator generates; QA gates; assets land in the client's kit. Client reviews in-app: APPROVE or one revision round. ⛔ No assembly with a custom kit before APPROVED.
- **F6 STEADY** — upload bodies → CREATE MY REELS → notified → download. Credits decrement on successful delivery only.
- **F7 RETENTION** — monthly renewal (Stripe), kit refresh offer at day 75, upsell prompt when credits run out before month end.

Conversion instrumented at every arrow: landing→test, test→purchase, purchase→kit approved, first reel→second month. Four numbers, from day one, in a table — the lesson HitMaster paid for.

## 5. SERVICES — what the stack needs and what we pay for

Principle: the web app is thin; the WORKER is the product. Video work needs ffmpeg and minutes of runtime, which serverless hosting cannot do. So two tiers of infrastructure, and nothing exotic.

- **5.1 WEB APP** — Next.js, hosted on Vercel (or the AWS path MKT-81 lands on, if the operator wants one console for both businesses; Vercel is faster to first client). Pages: landing, test-reel, dashboard, upload/record, kit review, reels library, billing, admin.
- **5.2 DATABASE + AUTH + STORAGE** — Supabase (separate project). Postgres for everything relational; Auth with magic-link email; Storage buckets `bodies`, `kits`, `reels`, `thumbs` with resumable (TUS) uploads so a 500MB phone clip survives a bad connection. Row-level security so a client sees only their rows. If storage egress grows, move `reels` to S3 + CloudFront later; not on day one.
- **5.3 RENDER WORKER** — a Docker container with Node + ffmpeg + whisper, on Railway or Fly.io (≈$10–30/mo idle, scales by instance count). It polls a `jobs` table (Postgres SKIP LOCKED — no separate queue service needed at this size), renders, writes results, exits the job. One worker serves the first fifty clients.
- **5.4 TRANSCRIPTION** — whisper in the worker (open-source, local; no per-minute API cost) or OpenAI's API if quality/speed on the worker is poor. Decide at Phase 1 with one real body.
- **5.5 PAYMENTS** — Stripe Checkout + Customer Portal + webhooks. Products: kit setup (one-time), three subscriptions, refresh (one-time). Webhook → `credits_ledger`. Stripe is the source of truth for billing state; our DB mirrors it.
- **5.6 EMAIL** — Resend or Postmark: magic links, "your test reel is ready", "your reels are ready", kit-approval request, renewal notices.
- **5.7 ASSET GENERATION** — MANUAL. Gemini Omni run by the operator from prompts the content agent writes, exactly as HitMaster works today. ⛔ No generation API in the loop at launch, and the compromised Higgsfield tooling is never touched. Automation of generation is a Phase 3 question, if ever.
- **5.8 DOMAIN/DNS** — GoDaddy → Vercel (CNAME). Email sending domain verified at Resend.

Running cost before the first client: Supabase Pro $25 + worker ~$20 + email $0–15 + Vercel $0–20 ≈ $50–80/mo. Stripe takes its cut per sale.

## 6. DATA MODEL — the tables that make it a machine

| table | columns |
|---|---|
| clients | id · name · category · handles · plan · status |
| users | id · client_id · email · role (owner/admin) |
| intake | client_id · answers JSON · references[] · logo · submitted_at _[superseded by the brief record in the concept §6]_ |
| kits | id · client_id · version · status (BUILDING/REVIEW/APPROVED/RETIRED) · approved_at |
| kit_assets | id · kit_id · kind (intro/stinger/endcard/chip/bed/lowerthird) · file · duration_ms · probe JSON · status (LANDED/QA_PASS/QA_FAIL/ACTIVE/RETIRED) |
| rotation_state | client_id · kind · walk JSON (order + cursor) — the MKT-49 lesson: shuffled per cycle, never repeat consecutively, lane-spread if two reels ship a day |
| bodies | id · client_id · src file · normalized file · duration · probe JSON · transcript · status (UPLOADED/READY/FAILED) · expires_at |
| jobs | id · client_id · body_id · type (test/reel/reroll) · recipe JSON · status (QUEUED/RUNNING/RENDERED/QA_PASS/QA_FAIL/DELIVERED) · attempts · worker · timings |
| reels | id · job_id · file · thumb · renditions[] · caption text · delivered_at · downloaded_at |
| credits_ledger | client_id · delta · reason (purchase/render/reroll/rollover/refund) · job_id · stripe_ref |
| events | the funnel table: every arrow in §4, with timestamps |

## 7. THE ASSEMBLY LOGIC — from upload to "creating your reels now"

This is the core of the order that will eventually go to Claude Code.

**7.1 GATE.** Dashboard shows the kit status. CREATE MY REELS is disabled unless kit = APPROVED (or the job is a test reel using the house kit) AND credits ≥ bodies selected. The button tells them why if not.

**7.2 UPLOAD OR RECORD**
- Upload: drag/drop or file picker. Client-side checks BEFORE the bytes move: type (mp4/mov/webm), size cap (2GB), duration window (15s–5min). Resumable upload to `bodies/{client}/{uuid}`.
- Record: browser MediaRecorder, front camera, 9:16 guide frame, optional teleprompter box (Phase 2), countdown, stop → same upload path. Records as webm; the worker transcodes.
- Per body, three fields: working title (optional), CTA choice (from the kit's endcards), captions ON/OFF (default ON).
- Bodies expire 30 days after upload; reels are kept 90 days. Stated in the UI, not hidden in terms.

**7.3 INGEST (worker, automatic on upload complete).** ffprobe → reject if corrupt or out of window → NORMALIZE:
- geometry: to 1080×1920. Vertical source: scale/crop. 16:9 source: client's default from settings — CENTER CROP (face-safe) or PAD with blurred fill. 1:1: pad.
- frame rate to 30fps, pixel format yuv420p
- audio: mono→stereo, loudness to −16 LUFS (EBU R128), true peak −1.5 dB, so every body sits at the same level as the kit
- trim leading/trailing silence >0.7s (the "1.94s silent head" lesson from the coffee intro — bodies have it too)

→ thumbnail at 1.0s → transcript (whisper) → status READY. The client sees "Ready" with the thumbnail and a caption-text box they can correct before rendering.

**7.4 CREATE MY REELS (the click).** For each selected READY body:
- a. credit hold (not decrement) → `credits_ledger` pending row
- b. rotation pick: intro, stinger, endcard from `rotation_state` — advance the walk; if two bodies are submitted together, lane-spread so they get different members
- c. write the RECIPE — a JSON edit-decision list, the single input the renderer reads:

```
{ intro, stinger, body, endcard, chip, bed,
  xfade_intro_stinger: 0.3, cut_stinger_body: hard,
  chip_window: [0.0, 2.0], captions: {on, style, text},
  bed_gain_db, duck_db, target: 9x16, renditions: [] }
```

- d. job QUEUED. The UI flips to "Creating your reels now" with a per-reel progress row (queued → rendering → checking → ready). Estimated time shown from the last ten jobs' timings.

**7.5 RENDER (worker).** One ffmpeg filtergraph per job — no intermediate files except the normalized body:
- video: intro ─xfade 0.3s─ stinger ─hard cut─ body(+chip 0–2s, +captions) ─xfade 0.3s─ endcard
- audio: kit audio as authored; bed under intro+stinger at bed_gain, ducked −12 dB under body; body audio clean; endcard audio as authored; loudnorm pass on the output
- encode: H.264 high, CRF 20, AAC 192k, faststart, 30fps

Provenance tags in the container (client, job, kit version, rotation members) — the HitMaster hm_* pattern.

**7.6 QA GATE (automatic, before the client ever sees it)**
- duration = sum of parts ± 50ms
- no black-frame run > 0.3s anywhere
- loudness within ±1 LU of target, true peak ≤ −1 dB
- first frame of body is not silence > 0.7s
- captions, if on, have ≥ 1 cue and none exceeds 2 lines

FAIL → retry once with the same recipe; second FAIL → job FLAGGED to admin, credit released, client told "we're checking this one" with no jargon. No failed render is ever delivered.

**7.7 DELIVER.** reels row written; thumbnail; signed URL (7-day, re-issuable); suggested caption from the transcript (first sentence + CTA + hashtags from intake); credit DECREMENTED now, not before; email "your reels are ready"; the dashboard row flips to READY with Download / Copy caption / Re-roll / Report.

**7.8 RE-ROLL AND REVISION.** Re-roll: same body, next rotation members, free once, then a credit. Report: opens an admin ticket with the job id; operator sees the recipe, the QA report and the render in one screen.

**7.9 THE TEST REEL PATH** is 7.2 → 7.7 with: house kit instead of the client's, a name text-overlay on the intro (from the email form), a watermark on the body, captions ON, no credit, and a 60s body cap. Same worker, same recipe shape, same QA. It IS the product demo, so it runs through the real pipeline, not a shortcut.

## 8. THE OPERATOR'S SIDE — admin, and the human loop

- CLIENT QUEUE: intake received → prompts requested → assets pending → QA → in review → approved. One screen, one row per client.
- KIT UPLOAD: drop assets by kind; the app names them (never the human — the seven filename failure classes), probes on landing, rejects .mov containers with a remux instruction, shows duration against the kind's window, marks QA_PASS/FAIL.
- JOB BOARD: every job, status, timings, QA report, retry/flag.
- The content agent's role, unchanged from HitMaster: writes every Omni prompt from the intake, rules on the kit, never touches the repo. Claude Code builds and reports in a FreshCut handoff file.

## 9. BUILD ORDER — phased, each phase pays for the next

**PHASE 0 — FOUNDATION** (operator ruling 9/24: no client-by-hand phase; the product is built as the product). Separate repo · Supabase project · Stripe account · domain wired · the FreshCut handoff file · a standalone assembler CLI (reads a recipe JSON, runs §7.3–7.6, writes the reel) proven against the HOUSE KIT as its first input. The house kit (eight taste-test stingers, world swatch-scenes, material loops) is the first asset build — Omni prompts from the content agent, same pipeline as always. Production hours on the house kit set the prices.

**PHASE 1 — MVP WEB** (the funnel end to end; 3–4 weeks). Landing + test reel + Stripe + intake + kit review + upload + CREATE MY REELS + download + admin queue. Worker = the Phase 0 CLI wrapped in a job loop. House kit built. Captions on.

**PHASE 2 — CREATOR FEATURES.** In-browser record with teleprompter; 1:1 and 16:9 renditions; lower thirds; caption style picker; kit refresh flow; Fiverr order intake.

**PHASE 3 — SCALE.** Multiple workers; S3/CloudFront for reels; team seats; usage-based overage; generation automation IF a trustworthy path exists.

## 10. RULES CARRIED OVER, AND TWO NEW ONES

Carried: exact lowercase names and app-side naming; ffprobe on landing; .mov = remux never rename; part-1 lines end level; rotation never repeats consecutively; nothing auto-posts; every gate prints its reason; the handoff file is the record.

- **NEW 1 — CLIENT CONTENT IS THEIRS.** We store bodies only as long as stated, never train on them, never show one client's material to another, never use a client's reel in marketing without written yes.
- **NEW 2 — NO MUSIC WE DON'T OWN.** Beds are generated or licensed; clients are told not to upload bodies with copyrighted music, and the transcript step flags likely music so the operator can ask.

## 11. DECISIONS THE OPERATOR OWES BEFORE THE PHASE 0 ORDER

- **D1** Domain registered? (freshcut.works) — yes/no.
- **D2** (struck 9/24 — no client #1 phase.)
- **D3** Hosting family: Vercel + Railway (fastest) or the AWS path shared with MKT-81 (one console)? Recommend Vercel + Railway for Phase 1; revisit at Phase 3.
- **D4** Captions default ON at all tiers? Recommend yes — it is the most visible value-add per reel.
- **D5** 16:9 source default: crop or blurred pad? Recommend pad — it never cuts a face; the client can switch per body.
- **D6** Kit sizes by tier as listed in §2.1, or flat?
- **D7** Placeholder prices to test on client #1 (charged, not published).

With D1–D2 answered, the Phase 0 order is a page: the repo, the CLI assembler spec (§7.3–7.6), the naming/probe gates, and the handoff file. Client #1's prompts come from me the same day the questionnaire lands.
— Ledger, 2026-09-24
