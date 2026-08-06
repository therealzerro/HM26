// MKT-12 — branded stinger between the Anchor intro and the UI body.
//
// The intro ends on full-frame smoke; the stinger opens on smoke, condenses it
// into the bolt, resolves a natively-rendered lockup, then sweeps the smoke back
// so it CLOSES on smoke too. That symmetry is the whole trick: the existing
// smoke→body dissolve is reused unchanged, just pointed at the stinger's tail.
//
// Like MKT-10's endcards, the lockup is rendered natively at 1080x1920 rather
// than baked into the generated clip, so copy is a config string and a new
// variant costs no generation. Per-variant stingers are PREBUILT (npm run
// stinger:build) so the daily assembly never pays for Playwright.

export interface StingerVariant {
  /** Shared text-free motion clip in assets/marketing/. */
  motion: string;
  /** Two lines: wordmark + variant headline. */
  lines: [string, string];
  /** false = this reel kind assembles with no stinger at all. */
  enabled: boolean;
  /**
   * MKT-31 — 'headline-dominant' INVERTS the hierarchy: lines[1] renders as
   * the large top line (~35% over the standard wordmark size) with lines[0]
   * small beneath it. Verify-only: the date claim is what a scroller needs to
   * catch, and the brand is already everywhere else. Slate kinds stay standard.
   */
  layout?: 'headline-dominant';
  /** MKT-31 — hex colour for the SUBORDINATE line (verify: gold #FBBF24 — the
   *  results-desk accent; every slate surface leads purple/white). */
  subAccent?: string;
  /**
   * MKT-41 — per-variant lockup top, OVERRIDING the shared LOCKUP_TOP.
   *
   * The shared 1240 is tuned to the SLATE stinger motions, whose bolt strikes
   * DOWN into an impact ring at ~y795 — so text at 1240 reads as the natural
   * landing of the motion. The SEAL is a different composition: a small ring
   * that settles high (mark ends ~y738) and leaves the lower two-thirds empty,
   * so the same 1240 stranded the text ~500px below the mark with a void
   * between them. Measured, not guessed: zone y820-1000 is clean through the
   * text's whole on-screen window (mean L15-21, 0% above L40 at t=1.2-2.0s;
   * the late smoke bloom starts after the text is out).
   *
   * ⚠ A new motion on a variant that sets this MUST re-measure — the same
   * bargain the endcard band makes: an override buys placement with a
   * per-motion measurement instead of a guarantee.
   */
  lockupTop?: number;
}

/**
 * MKT-42 — PER-MOTION lockup top, the highest-priority override.
 *
 * Resolution order is MOTION_LOCKUP[tag] ?? variant.lockupTop ?? LOCKUP_TOP,
 * and the order matters: the defect this fixes is a property of the MOTION, not
 * the reel kind. MKT-41 could put 820 on the `verify` VARIANT only because
 * verify drew exactly one motion (the seal — a set of one until MKT-49; any
 * future seal VARIANT needs its own MOTION_LOCKUP measurement, per tag). A
 * rotating kind draws a different motion every day, so no per-variant constant
 * can be right for all of them, and `circuit` proved it: measured identically
 * (mark bottom y866, 475px void, L11.7) on allday_free, allday_public and
 * evening_free, because the kind was never what varied.
 *
 * ⚠ A tag listed here is a MEASURED claim about one motion clip. Re-measure if
 * the clip is ever redelivered under the same tag — the number does not travel
 * with the name. ⚠ NOTHING AUTOMATED CHECKS THIS — the MKT-42 strand gate that
 * did was deleted by MKT-45 along with the values, because its pass condition
 * was the rejected criterion. Placement is a whole-frame judgement by eye.
 */
export const MOTION_LOCKUP: Record<string, number> = {
  // ⛔ EMPTIED 2026-08-01 ON OPERATOR REVIEW — every variant is back on the
  // shared 1330. `circuit: 950` shipped for about an hour and was rejected
  // alongside the endcard tucks, on the same ruling.
  //
  // The measurement was right and the criterion was wrong. Circuit's bolt does
  // settle at y866, and the text at 1330 is 475px below it — but closing that
  // gap drags the mark+text group into the upper half of frame and leaves the
  // lower half dead. FRAME BALANCE WINS; the space between a high-settling mark
  // and the lockup is the motion's own negative space, not a strand to remove.
  //
  // ⚠ DO NOT RE-ADD FROM A GAP MEASUREMENT. The mechanism stays because it is
  // sound, but a value belongs here only for a motion whose whole-frame
  // composition needs it. See ENDCARD_MOTION_LOCKUP for the parallel ruling.
};

export const STINGERS: Record<string, StingerVariant> = {
  allday_pro:  { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'ALL-DAY · FIRST LOOK'], enabled: true },
  allday_free: { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'ALL-DAY · FULL DROP'], enabled: true },
  // ⚠ APPROVED, NOT YET FLIPPED — and the ORDER is the operator's condition.
  //
  // Operator ruling 2026-07-28 barred a verify stinger on ratio grounds: a 5.6s
  // intro + 3.0s stinger + 2.5s close is 11.1s of branding against a 6.3s body,
  // i.e. 64% branding on the one reel whose entire credibility rests on showing
  // receipts. Ruling 2026-07-29 APPROVES the stinger but keeps that condition
  // binding, because two things were asked for in the same breath and the second
  // is the prerequisite for the first: longer match holds, then the stinger.
  //
  // ✅ ENABLED 2026-07-29, and only AFTER both preconditions were met — in this
  // order, which is the part worth remembering:
  //   1. MKT-27 built the holds. The body is now 8.6-14.0s from the row
  //      selection, putting branding at 44-56% (~45% on the reference render)
  //      against the 64% that earned the original refusal. Verified by a real
  //      render, not by arithmetic on intended lengths.
  //   2. `npm run stinger:build verify` produced the clips. probeStinger
  //      DEGRADES GRACEFULLY on a missing build (NOTE, not abort), so flipping
  //      this flag first would have shipped a stinger-less reel that reported
  //      success — the same ordering lesson MKT-26 learned the hard way with the
  //      free session carriers. The flag is the last thing turned, never first.
  // Note the stinger does NOT widen the carrier gap: `carrierNeed` derives from
  // the body, and the stinger carries its own audio over the intro.
  // MKT-31 item 1: hierarchy INVERTED for verify only — YESTERDAY'S RECEIPTS
  // dominant, wordmark small and gold beneath (item 4). Config + layout, zero
  // generation.
  // MKT-41's `lockupTop: 820` (tuck under the SEAL's ring) is REMOVED 2026-08-01
  // on operator review — the opening title read out of place in the shipped cut
  // for the same reason the endcard tucks did: it lifts the group into the top
  // half and empties the bottom. Verify is back on the shared band with the
  // rest of the fleet. verify_public shares these built clips, so both cuts move
  // together.
  verify:      { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', "YESTERDAY'S RECEIPTS"], enabled: true, layout: 'headline-dominant', subAccent: '#FBBF24' },
  // MKT-13 session wave. Same motion, same layout — only the headline differs,
  // which is the whole point of rendering the lockup natively. Pro-only by
  // content strategy (scripts/reel-scopes.ts), so there is no *_free entry to
  // add here: a free session reel would need a redacted capture, not a headline.
  midday_pro:  { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'MIDDAY · FIRST LOOK'], enabled: true },
  evening_pro: { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'EVENING · FIRST LOOK'], enabled: true },
  // MKT-26 free-group session kinds. COPY SIGNED OFF 2026-07-29 as written —
  // these two were already the agreed lines, so only the endcard copy moved.
  // Session vocabulary is retained deliberately: the free group is tier 2, where
  // it is sanctioned; only PUBLIC must drop it.
  // `THE BOARD` rather than `FIRST LOOK` is the tier distinction — first-access
  // framing is barred for the free tier under SOCIAL-13.
  midday_free:  { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'MIDDAY · THE BOARD'], enabled: true },
  evening_free: { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'EVENING · THE BOARD'], enabled: true },
  // MKT-16 — the public kind. Shared motion set (a stinger carries no tier
  // signal). Headline is copy-brief slot 8's delivered value: session words
  // are BLOCKING on public surfaces, so the scope differentiation lives here
  // as THE FULL BOARD — the same string as the intro chip, on purpose.
  allday_public: { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'THE FULL BOARD'], enabled: true },
};

// ── Timing (seconds, within the stinger) ────────────────────────────────────
/** Used window. The delivered clip is longer; the tail is generation headroom. */
export const STINGER_DUR = 3.0;
/**
 * Crossfade from the intro's smoke into the stinger's smoke.
 *
 * Phase 0 specified a butt-cut on the grounds that both sides are full-frame
 * smoke. Measured, they are not the SAME smoke: luma matches (Δ0.9) and hue
 * matches (Δ5.6), but saturation is 98.5 vs 119.8 — a stable Δ21, not a
 * one-frame artifact — and the textures differ in kind (pale/turbulent vs
 * dense/radial). A hard cut reads as a colour-and-texture pop, so the join is
 * a short dissolve instead. Operator approved 2026-07-28.
 */
export const INTRO_XFADE = 0.3;

/** Lockup animation: in, hold, out. */
export const TEXT_IN_START = 0.9, TEXT_IN_DUR = 0.4;
export const TEXT_OUT_START = 2.2, TEXT_OUT_DUR = 0.2;
/** Second line trails the first by this much. */
export const LINE_STAGGER = 0.08;
/** Scale-up across the in-animation (1.00 = settled). */
export const TEXT_SCALE_FROM = 0.97;
/** Frame rate the lockup animation is rendered at. */
export const TEXT_FPS = 30;

// ── Layout ──────────────────────────────────────────────────────────────────
/**
 * The bolt occupies y 615-1294 (measured), leaving 196px of clear dark space
 * beneath it before the 1:1 crop line. Two lines fit at reduced size; the
 * builder measures the laid-out block and aborts rather than trusting this.
 */
export const LOCKUP_TOP = 1330;
/** The 1:1 centre crop keeps y 420-1500 — the lockup must stay above this. */
export const CROP_SAFE_BOTTOM = 1500;
export const OUT_W = 1080, OUT_H = 1920;

/** Prebuilt per-variant clip the assemblers read. */
export function stingerFile(variant: string): string {
  return `stinger_${variant}.mp4`;
}
