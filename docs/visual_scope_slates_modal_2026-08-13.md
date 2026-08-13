# Visual Deep Scope — Slates Screen + Pick Detail Modal (DESIGN-03, 2026-08-13)

**Read in full:** `app/(tabs)/explore.tsx` (796 ln), `components/PickDetailModal.tsx`
(856 ln), `components/SlatePosterCard.tsx` (305 ln), `components/pickVisuals.tsx`,
plus the capture rig (`scripts/render-allday-body.ts`) — because these two surfaces
are ALSO the nightly reel body (grid push-in → six modals), and that dual role is
the defining constraint of any visual work here. **Suggestions only — nothing
changed** (subscriber surface; edits wait for explicit per-item orders).

---

## §1 THE CONSTRAINT MAP — what any visual change must survive

The capture rig drives the real app nightly. Its contract, extracted line-by-line:

| # | Contract item | Where |
|---|---|---|
| 1 | Route `/explore`; scope tab found by `role=tab` + name, selection read from aria-LABEL ("…, selected") | rig 125-171 |
| 2 | View toggle found by **exact text "Grid"** | rig 175 |
| 3 | Grid view must NOT scroll — >8px overflow **aborts the nightly run** | rig 217-231 |
| 4 | Modal opens by **hard-coded tile-center clicks**: 2×3 at CSS [150,405]×[310,550,777] @540×960 viewport — the grid's GEOMETRY is contract | rig 246-261 |
| 5 | Modal close at fixed [36,63] — the ✕ must stay top-left at that position | rig 292 |
| 6 | Modal text anchors: "PICK #N" + "BEST STRAIGHT" (relabel slots on public cuts); "partial/exact" vocabulary anywhere = blocking abort | rig 264-283 |
| 7 | Modal screenshot at scrollTop 0 → **INTEL tab above-the-fold is the captured composition**; PAIRS/PLAY are never captured | rig 284-288 |
| 8 | Redaction/relabel = DOM MutationObserver over digit TEXT NODES — digits must stay in text nodes (MKT-51 class rule) | reel-redact/relabel |
| 9 | Capture is dark-mode (`hm:theme-mode=dark`, colorScheme dark) as premium | rig initScript |
| 10 | MKT-11 ReelPromoPanel renders in the modal only under capture; INTEL tab bottom | modal 403-405 |
| 11 | The slate STAMP is composited over the body at assembly, and the 1:1 cut center-crops y420-1500 — grid-edge content nearest top/bottom is what a crop eats | assemblers |

Standing rulings that bind visuals: SlatePosterCard is **mode-locked dark** (LIGHT-01
Decision A — never "fix"); scrims stay dark in both modes; white-on-purple buttons
intentional; the heatTier ramp is the single canonical scale (MKT-28); grid =
screenshot surface (no FAB, no LastHitPill, no entering animations, no scroll);
brand voice applies (MATCH / STRAIGHT MATCH vocabulary shipped); free-tier locks
and the single `/paywall` route.

## §2 FINDINGS

**F1 · PAIRS tab renders FABRICATED percentages — the top finding.**
`PickDetailModal.tsx:417-432`: the matrix's MOMENTUM row is
`PBURST × 92 / × 70 / × 30`, FREQUENCY is `BOX × 95 / 60 / 45`, CONSIST is
`DGC × 88 / 55 / 40` — hardcoded multipliers presenting invented per-pair numbers
as measured data, styled identically to the one row (PATTERN back/split) that IS
real (`fetchPairScores`). On a product repositioned around "check our work," a
subscriber-facing panel of synthetic percentages is a credibility liability, and
it sits one tab from the captured surface. Real per-class pair data exists — the
fix is to show it, or to not show a matrix.

**F2 · WhyRow copy asserts claims independent of the data** (`modal:352-366`):
"surging — highest recent frequency", "confirms alignment across all 3 signal
channels" render verbatim whether the score is 8% or 92%. Same class as F1.

**F3 · "ZK6 CONFIDENCE" is the energy percentile relabeled** (`modal:324,331`):
`confidence = pick.energy`. The snapshot has a real confidence field (data
coverage); the band shows percentile rank under a different name. Rename the
label to what it is, or wire the real field.

**F4 · PLAY tab bet-vocabulary — operator question, not a unilateral fix.**
"Bet $0.25", "Win $225", "SAFE PLAY" (`modal:466-508`). Operator specified these
payouts 2026-05-12; the brand brief (2026-05-18, "bet"/"play" on the avoid list
for consumer tabs) postdates them, and `check:brand-voice` evidently tolerates
them today. PLAY is never captured into reels. Flagged for a ruling: keep
(subscriber utility), or reword ("Entry $0.25 / Returns $225" class). Not touched
without the call.

**F5 · Share text carries `hitmaster.app`** (`modal:300`): the brand-domain memory
says hitmasterzk.com is secured but NOT wired, wiring needs a per-surface tier
ruling — and share templates are explicitly on the brand-brief "applies to" list.
`hitmaster.app` is neither the wordmark nor the secured domain. Smallest honest
fix: drop the domain line until the wiring ruling; the hashtags stand alone.

**F6 · Micro-typography below legibility floor.** The modal hero runs 7-8pt
labels (`posLabel` 7, `boxBadgeLabel` 7, `heroBestLabel` 8, `heroMeta` 8,
`hitStampContext` 8); the matrix has 7-8pt headers. iOS a11y floor is ~11pt;
these are also the pixels a 1080×1920 reel shows at phone size. A +1-2pt floor
pass with consolidation (merge the "Generated" strip into the header band) buys
real legibility in-app AND on the reels.

**F7 · Reduce-motion honored in the screen, ignored in the modal.**
explore.tsx gates every entering animation on `useReduceMotion`; the modal's
340ms slide + fade (`modal:193-198`) doesn't. One-hook parity fix.

**F8 · Mixed icon systems.** Screen chrome is lucide; the modal is emoji
(⚡🔗🎯📖📤🕐 tabs/actions/strips). DESIGN-02's unification stopped at this
file's door. Emoji also render platform-variant — the reels' captured tab bar
looks different on the capture host than on a subscriber's device.

**F9 · Version string hardcoded** — "ZK6 v2.1" (`modal:672`); drifts silently
when the engine bumps. Read it from the snapshot's `engineVersion`.

**F10 · Housekeeping:** `SCREEN_W/H` frozen at module scope (rotation-stale;
use `useWindowDimensions`); `REDACT_LOCK_GOLD` hardcoded vs `colors.gold`;
Hits-tab match-feed rows fully inline-styled (only surviving un-tokenized block
on the screen); `viewMode` state values `'list' | 'compact'` vs UI labels
List/Grid (naming drift).

**Healthy and worth saying:** the screen's tab structure, skeleton/error states,
scope segment, grid discipline (no scroll/FAB/animations), canonical heat ramp
adoption, hit-stamp continuity system (grid tile ↔ modal hero ↔ HitReplay), and
the redaction-aware poster card are all coherent DESIGN-02-era work. This is a
polish-and-honesty pass, not a redesign.

## §3 SUGGESTIONS — ranked, capture-safety tagged

**Tier 1 — data-honesty visuals (the credibility batch):**
- **S1 [capture-safe]** Rebuild the PAIRS matrix on real data: three real per-pair
  scores (front/back/split × the classes fetchPairScores already returns),
  rendered as one honest 3×N matrix; delete the multiplier theater (F1). Visual
  spec: keep the card/track/fill language, add a "measured over {scope} pair
  dataset" caption in place of the fake-precision legend.
- **S2 [capture-impact: INTEL is the captured tab — re-verify composition]**
  Score-driven WhyRow copy tiers (≥70 "leading" / 40-69 "supporting" / <40
  "neutral" phrasing) so words track numbers (F2).
- **S3 [capture-impact: label text visible in reels]** Rename the confidence band
  "ENERGY PERCENTILE" (or wire real confidence) (F3).
- **S4 [needs operator ruling]** PLAY-tab vocabulary (F4) and share-domain line
  (F5 — smallest fix is dropping the line; capture-safe, PLAY/share never captured).

**Tier 2 — legibility + coherence:**
- **S5 [capture-impact: changes the captured hero/tab band — eye-check one test
  body]** Typography floor pass (F6): raise micro-labels to 9-10pt, merge the
  timestamp strip into the header band, thin the hero's third column (BOX SET
  badge keeps, scope+version fold into the header line).
- **S6 [capture-impact: tab bar is captured]** Lucide icon unification in the
  modal (F8): Zap/Link2/Target for tabs, proper share/clock glyphs. Text labels
  (INTEL/PAIRS/PLAY) unchanged — the rig reads text, not glyphs.
- **S7 [capture-safe]** Modal honors reduce-motion (F7). Capture never sets it,
  so reels are byte-identical.
- **S8 [capture-safe]** F9/F10 housekeeping batch.

**Tier 3 — grid view (geometry FROZEN; within-tile only, each behind a re-render
eye-check + the rig's own asserts):**
- **S9 [capture-impact]** Within-tile polish only: e.g. give the four signal
  mini-bars a 2px more track height and align the B/P/C/D keys to a fixed-width
  column so the four bars rack evenly; tighten the hit-stamp context line to
  9pt. NO layout/geometry/padding changes at the card boundary — tile centers
  are click targets (constraint #4).
- **S10 [needs operator ruling + reel impact stated]** Optional scope-accent
  micro-cue on the grid (e.g. rank chips pick up `scopeAccent`) — it would make
  midday/evening/allday reels visually distinct at a glance, which is either a
  feature (viewers learn the scope by color) or noise (brand consistency). Reels
  change appearance; content agent should weigh in via the handoff.
- **S11 [capture-safe]** List view (never captured) is the free playground:
  hit-card glow pulse, richer LastHitPill, DrawTicker polish — lowest priority,
  zero risk.

**Explicitly NOT suggested:** grid re-layout (breaks constraint #3/#4), moving
the modal close button (#5), renaming PICK/BEST STRAIGHT strings (#6), digits
anywhere but text nodes (#8), theming the poster card (LIGHT-01 lock), any
entering animation on grid tiles, anything touching redaction/relabel targets.

## §4 EXECUTION SHAPE (when ordered)

Tier 1 first (S1-S3 are the substance; S4 is two rulings), then Tier 2 as one
batch, Tier 3 last. Every capture-impact item lands with: `npm run reel:check`
green + a front-segment test body render (the MKT-54 pattern) + eye-check of the
grid still and one modal frame BEFORE the next daily run consumes the change.
Rig-contract items (§1) are re-asserted by the rig itself — the abort paths are
the safety net, but finding out at 8:29am is the failure mode to avoid, so the
test render comes first. Handoff note to the content agent required for anything
in Tier 3 or S5/S6 (reel appearance changes) — per the channel ruling, it goes in
`Reel_System_Handoff.txt` before the change ships.
