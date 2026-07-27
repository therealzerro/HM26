# All-Day Reel Composition Spec + Endcard Revision Brief

For the content agent · 2026-07-27 · Governing rulebook: Brand Rehab Skill Brief **v2.1**
(use $2.49/mo for any Pro-group price; MATCH / STRAIGHT MATCH vocabulary only).

## 1. What the composed videos are

Two daily vertical reels built from ONE shared UI body render of the live app
(real production data, never mocked), differing only in endcard + narration:

| File | Audience | Endcard copy today |
|---|---|---|
| `allday_pro_YYYYMMDD.mp4` | Pro group | bolt + "HITMASTER ZK6 · FIRST ACCESS. ALWAYS. · VERIFIED TOMORROW MORNING" |
| `allday_free_YYYYMMDD.mp4` | Free group | text lockup "HITMASTER ZK6 · TODAY'S ALL-DAY SLATE · VERIFIED TOMORROW MORNING" |

Specs: 1080×1920 (9:16), 60fps, H.264 High/yuv420p, AAC 48kHz, loudness-normalized
target −14 LUFS, **19.700s exactly**. Each ships with a 1080×1080 center-crop cut
(`*_1x1.mp4`) and a 6-frame contact sheet.

## 2. Timeline (beat-by-beat, current build)

| Time | Visual | Audio |
|---|---|---|
| 0.0–1.2s | Endcard lockup frame → 1.2s smoothstep dissolve into the app | Carrier narration begins |
| 1.2–5.2s | Full 2×3 slate grid, all six picks on screen, slow Ken-Burns push-in (1.00→1.10). Pick #1 tile carries the live green MATCH stamp when yesterday verified | Carrier narration |
| 5.2–7.2s | PICK #1 detail modal (hard cut): digits, energy ring, ZK6 CONFIDENCE, SIGNAL BREAKDOWN, WHY THIS ORDER, RESOLVED IN | Carrier narration |
| 7.2–9.2s | PICK #2 modal | Carrier narration (ends ~10s) |
| 9.2–11.2s | PICK #3 modal | Narration → endcard sting takes over |
| 11.2–13.2s | PICK #4 modal | Endcard sting (its front-loaded music, played from its own t=0) |
| 13.2–15.2s | PICK #5 modal | Sting decaying |
| 15.2–17.2s | PICK #6 modal | Sting tail |
| 17.2–19.7s | **Endcard: final 2.5s of the endcard asset, hard cut in** | Sting decay / quiet |

All modal segments are real UI states reached by real taps, captured deterministically.

## 3. How the pipeline consumes the endcard asset (CONTRACT — keep these true)

The assembler takes THREE things from each `allday_<pro|free>_endcard.mp4`,
automatically, no code changes when you overwrite the files:

1. **The very last frame** (t = end−0.1s) → scaled to 1080×1920 → used as the
   reel's OPENING image (source of the 1.2s dissolve into the app). ⇒ the final
   frame must be a clean, complete, representative lockup.
2. **The FIRST 6.5 seconds** → the reel's outro, hard-cut in at 17.2s: the
   formation animation plays IN the reel with its own synced audio (the crack
   lands on the bolt snap). ⇒ keep: snap complete by ~1.5s, lockup readable by
   ~5s, calm by 6.5s. (Contract updated 7/27 — previously only the last 2.5s
   was used.)
3. **The audio from t≈2s (post-crack hum)** → low-level bed under the modals
   after the carrier VO ends (auto-shrinks to zero when a ~17.2s carrier is
   supplied). ⇒ keep the region after the crack as sustained hum/room tone,
   nothing startling; audio stream full-length (≥ 9.5s).

**Delivery:** overwrite `assets/marketing/allday_pro_endcard.mp4` and
`assets/marketing/allday_free_endcard.mp4`. Any duration ≥ 2.5s video / ≥ 9.7s
audio works; native 1080×1920 preferred (current 720×1280 assets are upscaled
lanczos — fine, but native res removes a scaling step). Keep ≥ 24fps.

## 4. Revision direction (operator request)

- **Stronger branding on both endcards**, and make the **animated lightning-bolt
  logo in purple smoke** the hero — bigger, more prominent, present on BOTH
  variants (today's free card is text-only; give it the bolt treatment too).
- Palette (brief v2.1 §7, strict): electric purple #A855F7–#C084FC · metallic
  gold #FBBF24–#F59E0B · deep black #0A0A0F → navy #1E1B4B · white text ·
  cyan #06B6D4 data accents. Purple smoke/cosmic is approved imagery.
- Bolt-formation animation is welcome ANYWHERE in the asset — but remember only
  the last 2.5s appears in the reel, so the formation must COMPLETE by then
  (or design the last 2.5s as the formed logo living in the smoke: drift,
  glow pulse, embers — and the very last frame fully resolved).
- Copy stays vocabulary-clean (current lines are compliant; keep "VERIFIED
  TOMORROW MORNING" — it's the promise that ties to the verification reel).
  Differentiate tiers: Pro = first-access framing ("FIRST ACCESS. ALWAYS."),
  Free = the All-Day value framing (per the depth rule, the All-Day drop is the
  full free post). If price appears on the Pro card: **$2.49/MO** only.
- No 3-digit numbers, no cash/casino imagery, no "winner" framing on the cards.

## 5. Also wanted from the content agent (same batch, optional but ideal)

- **Longer carriers:** regenerate `allday_pro_carrier.mp4` and
  `allday_free_carrier.mp4` at **~17.2s** (current 10s). The pipeline
  auto-detects and uses longer narration wall-to-wall (it prints this
  recommendation on every run). Suggested narration shape: 0–1.2 hook over the
  lockup dissolve → 1.2–5.2 the six-signal overview (grid) → 5.2–17.2 walk the
  picks as the modals cycle (≈2s per pick, rank 1→6).

## 6. Distribution reminder

The reels contain real 3-digit numbers and session labels → **free/Pro group and
App Store use only**; never the public page or paid Meta placements
(Two-Question Filter, brief v2.1 §3). The endcards alone, if kept number-free,
can pass the public filter — design them so they could stand alone.
