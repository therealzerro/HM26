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
}

export const STINGERS: Record<string, StingerVariant> = {
  allday_pro:  { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'ALL-DAY · FIRST LOOK'], enabled: true },
  allday_free: { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', 'ALL-DAY · FULL DROP'], enabled: true },
  // Verify's body is only 6.3s. A 5.6s intro plus a 3.0s stinger would put 8.6s
  // of branding against 6.3s of content — branding outweighing the receipts.
  // Operator ruling 2026-07-28: verify carries no stinger.
  verify:      { motion: 'stinger_motion.mp4', lines: ['HITMASTER ZK6', "YESTERDAY'S RECEIPTS"], enabled: false },
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
