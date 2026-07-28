# MKT-14 — Brand attribution in the slate stamp (amends MKT-07)

**STATUS: PARKED — do not start.** Operator instruction 2026-07-28: hold until the
social expansion work (`docs/social_expansion_scope_2026-07-28.md`) is complete.
Resume only on explicit operator go-ahead.

**ID reserved.** MKT-01…MKT-13 are shipped; MKT-14 is claimed by this work order and
must not be reused.

**SUPERSEDES a previously drafted MKT-14** (standalone bottom-right watermark overlay on
brand segments). **Do not build that version.** It was never committed to the repo — this
file is the only record, so if a bottom-right watermark is ever proposed again, it is this
that was rejected, for the two load-bearing reasons in the work order below.

**Sequencing note (why parking is coherent, not just a delay):** the work order's own
position argument is derived from the YouTube/TikTok/Reddit/Instagram safe zones. Those
platforms are still a *proposal* pending three operator decisions (see the social
expansion scope). Landing brand attribution after the platform set is settled means the
safe-zone constraint is fixed by then rather than assumed.

---

## Work order (verbatim, as issued 2026-07-28)

Pattern: discovery-first, escalation gates, diff before commit. Append MKT-14 to
MASTER_AUDIT.md, cross-referencing MKT-07. ID verified against the audit:
MKT-01 through MKT-13 are shipped. Marketing pipeline only — no engine, no edge
functions, no sync_agents.

SUPERSEDES the previously drafted MKT-14 (standalone bottom-right watermark
overlay on brand segments). Do not build that. Reasons, both load-bearing:

  1. POSITION. Reels are about to be cross-posted to YouTube, TikTok, Reddit and
     Instagram. Every short-form platform stacks its own chrome in the
     bottom-right: TikTok's engagement column owns the right third and gained an
     "Add to Playlist" button there in Jan 2026; Instagram enlarged its audio
     attribution bar in late 2025, raising the bottom dead zone ~50px; YouTube
     Shorts puts Like/Comment/Share right and channel/description bottom. The
     universal safe zone is ~900x1400 centred in 1080x1920. A bottom-right mark
     is buried on all three.
  2. SEGMENT. Brand segments already carry the wordmark — a bug there is
     redundant. The BODY is what gets clipped, screenshotted and reposted, and
     it is the only part of the reel with no brand on it.

MKT-07's stamp chip already solves both: it sits at y=470 (inside the 1:1 keep
band y 420-1500 AND inside the universal safe zone), rides the body only,
composites at assembly, and already renders text natively. We extend it rather
than add an overlay.

### PHASE 0 — DISCOVERY (report, no changes)

1. Report the chip's current x-origin, width, line heights and font sizes from
   render-reel-stamp.ts. Confirm its right edge sits left of x=720 (the start of
   TikTok's at-risk right third). If it does not, report by how much.
2. Report current fade in/out timings in both assemblers. The MASTER_AUDIT entry
   quotes 1.1-1.55s in / 17.15s out (allday) and 0.9-1.3s in / 7.45s out
   (verify), but those predate the Anchor intro and stinger — report the live
   values against the 33.8s / 14.4s timelines.
3. COPY FIT — the proposed structure is a brand prefix on line 1:

       drop:   "HITMASTER ZK · TODAY'S DATA DROP"  /  "MON · JUL 27 · ALL-DAY"
       verify: "HITMASTER ZK · ✓ VERIFIED RESULTS" /  "SUN · JUL 26"

   Render both and report whether line 1 overflows or forces a size reduction
   that hurts legibility at 1:1. If it does, report the alternative: brand as a
   small separate kicker line above the existing two, chip grows vertically.
   Deliver 100% crops of both structures in both cuts for the decision.
4. Confirm the brand string is lint-clean: "HITMASTER ZK" carries no digits and
   no Q2 vocabulary, so the chip stays Two-Question-clean independent of the
   body it rides over.
5. Confirm the accent-colour scheme still reads with the longer line — drop is
   cyan #2bffcc, verify is green #34c759. Report whether the brand prefix should
   take the accent or stay white with the purpose text accented.

### PHASE 1 — TEXT (ship this first)

- Add the brand string to both chip purposes per the Phase 0 decision.
- Version-agnostic by design: "HITMASTER ZK", never "ZK6". It must survive ZK30
  and ZK50 without a copy change.
- Keep the file:// + document.fonts.check() load path. Do not switch to
  setContent — MKT-07 documents the silent serif fallback.
- No change to position, fade timings, or segment scope. Body only; intro,
  stinger and endcard stay clean.
- reel:check's existing stamp smoke-render should catch a broken layout; extend
  it if the chip's bounding box is now asserted anywhere.

GATE: deliver one allday reel and one verify reel, contact sheets, and 100%
crops of the chip in both the 9:16 and 1:1 cuts. Diff before commit.

### PHASE 2 — ANCHOR BADGE (only after Phase 1 ships and is judged)

- Input: assets/marketing/watermark_source.mp4 (Anchor helmet emblem on pure
  black, static, silent). Extract a frame from the static hold, not frame 0.
- Check for a generator watermark on the extracted frame and crop clear of it —
  build-panels.ts already strips one at y~1411-1500 from delivered PNGs.
- Verify background purity; warn loudly on glow spill.
- Composite the badge into the chip's HTML as a small PNG at the left of line 1,
  sized to the line height.
- OPEN QUESTION, report don't decide: whether the helmet reads at roughly 70px.
  Deliver a 100% crop and let the operator judge. If it does not read, Phase 1's
  text-only chip is the finished state and this phase is closed, not retried.

### PHASE 3 — DOCS

Update handoff §2/§3 anatomy notes and §7 inventory. Note in §9 that the reels
now carry attribution on the body ahead of the YouTube/TikTok/Reddit/Instagram
expansion.

---

## On resume — pre-flight for whoever picks this up

- Re-verify MKT-14 is still the free ID (`grep -rn "MKT-1[45]" MASTER_AUDIT.md`).
- The stamp is `scripts/render-reel-stamp.ts`; it is invoked once per scope by
  `scripts/assemble-allday-reels.ts` and by the verify assembler.
- Since MKT-13 the stamp renders for **four** slate kinds (allday pro/free, midday_pro,
  evening_pro) plus verify — Phase 1's "one allday + one verify" gate should also confirm
  a session cut, since sessions pass a different `stampLabel` through the same renderer.
- `assets/marketing/watermark_source.mp4` (Phase 2 input) **is already delivered**
  (2.6MB, 2026-07-28 15:31) but is untracked in git as of parking — commit it with the
  Phase 2 work, or sooner if it risks being lost.
