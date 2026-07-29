// MKT-19 — brand motion rotation for the stinger AND the endcard.
//
// MKT-10 and MKT-12 split MOTION from COPY: a variant is a config entry, and a
// new headline costs no generation. This rotates the other half. Motion becomes
// a SET; copy stays per-variant. Same mechanism as MKT-17's intro resolver — a
// date-derived offset over an ordered list, on the same clock-free `dayIndex`
// the caption and panel engines use — deliberately not a third mechanism.
//
// TIER PAIRING IS ENFORCED HERE, NOT BY CONVENTION. Pro-tier motions (vault
// rings, converging threads) and free-tier motions (rising tide, blooming
// eddies) carry the tier distinction visually, so a pro motion resolving onto a
// free or public close would quietly undo it. `tierFor()` is the only thing that
// decides, and there is no code path that takes a motion from the other set.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rotateByDate, ROTATION_SALT } from './reel-rotation';

export type Tier = 'pro' | 'free';

/** How far a re-derived transient may drift and still count as "the same one". */
export const FADE_TARGET_TOLERANCE = 0.25;

export interface MotionVariant {
  file: string;
  /** Short, stable suffix for built artifacts. Explicit, never derived from the
   *  filename — a rename must not silently repoint 37 built files. */
  tag: string;
  /** Logged in the run summary so the operator can see what played. */
  label: string;
  /**
   * AUTHORED correction to a known defect in this asset — see the derived/
   * authored split at the head of MOTION_META below.
   *
   * `stinger_motion_circuit` carries TWO transients: the intended hero beat at
   * 1.4s and a gold pulse at 2.7s. The lockup is already out by 2.4s, so the
   * pulse fires on an empty frame 0.3s before the cut to the body and reads as
   * a pop against the dissolve. Fading the tail from 2.45s puts it under the
   * floor while preserving the 2.3s smoke-return whoosh. Operator ruling
   * 2026-07-28: fix in audio, do NOT widen STINGER_DUR — changing reel length
   * to suppress a transient is the wrong trade.
   */
  audioFadeFrom?: number;
  /**
   * The OBSERVATION the correction above was authored against, so the build can
   * re-check its own justification instead of trusting a number indefinitely.
   *
   * Without this the derived/authored split is a naming convention: a
   * regenerated asset would keep a hand-written fade pointing at a transient
   * that has moved or gone, and nothing would notice. `validateFade()` in
   * build-stinger re-derives the transient list per build and reports when the
   * target has vanished (correction no longer justified — do not apply) or when
   * a NEW uncovered transient appears late in the used window (the same defect
   * class arriving in a different asset).
   */
  audioFadeAgainst?: number;
}

/** Stinger motions. Shared across tiers — a stinger carries no tier signal. */
export const STINGER_MOTIONS: MotionVariant[] = [
  { file: 'stinger_motion.mp4', tag: 'std', label: 'bolt condense' },
  { file: 'stinger_motion_strike.mp4', tag: 'strike', label: 'strike' },
  { file: 'stinger_motion_circuit.mp4', tag: 'circuit', label: 'circuit', audioFadeFrom: 2.45, audioFadeAgainst: 2.7 },
];

/** Endcard motions, PER TIER. Crossing these sets is the failure this prevents. */
export const ENDCARD_MOTIONS: Record<Tier, MotionVariant[]> = {
  pro: [
    { file: 'endcard_motion_pro.mp4', tag: 'std', label: 'converging threads' },
    { file: 'endcard_motion_pro_alt.mp4', tag: 'alt', label: 'vault rings' },
  ],
  free: [
    { file: 'endcard_motion_free.mp4', tag: 'std', label: 'blooming eddies' },
    { file: 'endcard_motion_free_alt.mp4', tag: 'alt', label: 'rising tide' },
  ],
};

/**
 * Which motion set a reel kind draws from.
 *
 * `verify` is PRO-tier: it is the receipts reel for paying members' benefit and
 * shares the pro close. Note the contrast with MKT-17, where verify takes a
 * FIXED intro because a deadpan gag ahead of yesterday's receipts is a tonal
 * mismatch — no such concern applies at the close, so verify DOES rotate here.
 * Public kinds are free-tier, and are listed now so that registering them later
 * is a no-op in this file rather than a fifth thing to remember.
 */
const PRO_KINDS = new Set(['allday_pro', 'midday_pro', 'evening_pro', 'verify']);

export function tierFor(kind: string): Tier {
  return PRO_KINDS.has(kind) ? 'pro' : 'free';
}

// ── Derived metadata ────────────────────────────────────────────────────────
/**
 * DERIVED vs AUTHORED — the distinction matters and is why they live apart.
 *
 * `audioFadeFrom` above is AUTHORED: a human decided it against a defect they
 * measured. This file is DERIVED: `npm run endcard:build` writes it from the
 * asset itself. Keeping them separate means a regenerated circuit clears its
 * fade by having the authored entry removed, while a regenerated pro_alt clears
 * its bed verdict automatically on the next build — nobody has to remember that
 * a hand-written number is now pointing at a transient that moved.
 */
export const MOTION_META_FILE = '_motion_meta.json';

export interface MotionMeta {
  /** False when bedWindow() found no usable hum-bed window in this motion. */
  bedUsable: boolean;
  /** Measured mean RMS of the derived window, dB. Null when unusable. */
  bedRms: number | null;
  crackAt: number | null;
  derivedAt: string;
}

export function readMotionMeta(assetsDir: string): Record<string, MotionMeta> {
  const p = join(assetsDir, MOTION_META_FILE);
  if (!existsSync(p)) return {};
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Record<string, MotionMeta>;
  } catch {
    return {};
  }
}

// ── Built-artifact naming ───────────────────────────────────────────────────
/**
 * Built endcard name for a (variant, motion) pair.
 *
 * Derived from the registry's `out` field, NOT composed as
 * `${kind}_endcard_${tag}.mp4`, because the built names are not uniform:
 * ENDCARDS.verify.out is `verif_endcard.mp4` — no "y". Composing from `kind`
 * would silently miss verify, which is the one kind whose endcard also supplies
 * the legacy fallback open.
 */
export function builtEndcardName(out: string, tag: string): string {
  return out.replace(/\.mp4$/, `_${tag}.mp4`);
}

/** Built stinger name for a (variant, motion) pair. Mirrors stingerFile(). */
export function builtStingerName(variant: string, tag: string): string {
  return `stinger_${variant}_${tag}.mp4`;
}

// ── Resolution ──────────────────────────────────────────────────────────────
// MKT-20 moved the rotation itself to scripts/reel-rotation.ts, shared with the
// intro and carrier lanes. Behaviour is unchanged — the helper is this function
// verbatim — but the three lanes can no longer drift on what a date means.

/**
 * Stinger motions for a kind, in preference order.
 *
 * `salt` differs from the endcard's so the two rotate INDEPENDENTLY — a viewer
 * should not see the same pairing recur on a fixed cycle. Same-day pro and free
 * drawing the same stinger motion is accepted (different rooms, and their
 * endcards differ by tier anyway), so no cross-kind spacing is applied.
 */
export function stingerMotionsFor(_kind: string, dateISO: string): MotionVariant[] {
  return rotateByDate(STINGER_MOTIONS, dateISO, ROTATION_SALT.stinger);
}

/**
 * Endcard motions for a kind, in preference order, tier-locked.
 *
 * `needsBed` is the MKT-19 bed-aware rule. `endcard_motion_pro_alt` has no
 * usable hum-bed window — its RMS climbs monotonically into the crack, which is
 * inherent to a build-up shape and will recur. Rather than documenting "pro
 * carriers must stay wall-to-wall" (a constraint that rots, exactly as
 * BED_SRC_START did), motions without a bed simply drop from the rotation on
 * days that actually need one, and participate normally on days that do not.
 * A hard abort becomes graceful degradation, matching the missing-panel and
 * missing-intro patterns.
 */
export function endcardMotionsFor(
  kind: string,
  dateISO: string,
  opts: { needsBed?: boolean; meta?: Record<string, MotionMeta> } = {},
): MotionVariant[] {
  const ordered = rotateByDate(ENDCARD_MOTIONS[tierFor(kind)], dateISO, ROTATION_SALT.endcard);
  if (!opts.needsBed) return ordered;
  const meta = opts.meta ?? {};
  // Unknown (not yet derived) is treated as USABLE: the assembler still probes
  // the real file and fails loudly if it is not. Excluding on absence would
  // make a missing metadata file silently narrow every rotation.
  const viable = ordered.filter(m => meta[m.file]?.bedUsable !== false);
  return viable.length ? viable : ordered;
}

/** Every motion file any set can reference — what reel:check must validate. */
export function allMotionFiles(): string[] {
  return [...new Set([
    ...STINGER_MOTIONS.map(m => m.file),
    ...ENDCARD_MOTIONS.pro.map(m => m.file),
    ...ENDCARD_MOTIONS.free.map(m => m.file),
  ])];
}
