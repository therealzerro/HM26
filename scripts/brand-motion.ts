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
import { rotateByDate, laneRotate, laneIndex, ROTATION_SALT } from './reel-rotation';

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
  /**
   * Non-empty = this motion is REGISTERED BUT HELD: the resolver skips it, the
   * builder will not build it, and preflight reports it as a deliberate
   * exemption with this reason. Exists so a defective delivery can keep its
   * registration (the wiring is done, the intent is recorded) without any
   * routine command re-arming the defective file. Clearing the hold is the
   * LAST step after a re-delivery measures clean — the stinger-flag lesson.
   */
  held?: string;
}

/**
 * VERIFY'S PINNED STINGER MOTION — content-agent ruling, confirmed 2026-07-30
 * (option a). Verify's value at this beat is being tonally DISTINCT from the
 * slate drops: the closing-bell seal — a gold ring sealing around an already-
 * standing bolt — says "session closed, results final", which is true of
 * yesterday's receipts and false of every 8:30am drop. So verify does not
 * rotate here anymore; it pins to seal, mirroring its fixed intro (MKT-17),
 * with the shared rotation as the FALLBACK while the built clip is absent.
 * Delivered 2026-07-29 19:16; not a member of the shared set on purpose — a
 * slate drop must never draw the bell.
 */
export const VERIFY_SEAL_MOTION: MotionVariant = {
  file: 'stinger_motion_seal.mp4', tag: 'seal', label: 'closing-bell seal',
  // HOLD CLEARED 2026-07-30 — the re-delivery (operator, via GitHub rename;
  // 4.01s) measures CLEAN against the regeneration ask: energy peak −17.4dB
  // at 1.10s (struck well before the ~2.0s bound), smooth decay under the
  // smoke return, nothing after 2.4s above −19.2dB. The 7/29 delivery's
  // defect (bell at 2.7s / −3.5dB, post-lockup, over the VO onset) is gone.
  // Per the standing rule, this field was cleared LAST, after the measurement.
};

/** Stinger motions. Shared across tiers — a stinger carries no tier signal. */
export const STINGER_MOTIONS: MotionVariant[] = [
  { file: 'stinger_motion.mp4', tag: 'std', label: 'bolt condense' },
  { file: 'stinger_motion_strike.mp4', tag: 'strike', label: 'strike' },
  { file: 'stinger_motion_circuit.mp4', tag: 'circuit', label: 'circuit', audioFadeFrom: 2.45, audioFadeAgainst: 2.7 },
  // MKT-23. Both cleared on the ONE-HERO-BEAT rule: fracture 1.1s, imprint 1.1s,
  // neither with anything after 2.4s. Note imprint reads ZERO on the prominence
  // detector — it ramps in over more than the 0.4s lookback, so the detector
  // cannot see it, exactly as it cannot see `strike` (which ships daily). The
  // criterion is one hero beat with nothing after ~2.4s, not one detector hit.
  { file: 'stinger_motion_fracture.mp4', tag: 'fracture', label: 'fracture' },
  // ⛔ `imprint` RETIRED FROM THE ROTATION 2026-07-31 (MKT-42) — kept here as a
  // comment, not deleted, because the clip is fine and the reason is specific.
  //
  //   { file: 'stinger_motion_imprint.mp4', tag: 'imprint', label: 'imprint' },
  //
  // Its bloom is FULL-FRAME through the lockup's fade-in, so unlike `circuit`
  // this is not a placement problem and MOTION_LOCKUP cannot fix it. Measured %
  // of the text block above L40, at the best available band (y950-1060):
  //   t0.9 99.3 · t1.0 100 · t1.1 95.8 · t1.2 56.0 · t1.3 58.6 · t1.4 10.2 · t1.5 0.0
  // Every other band tested (900-1100, 1000-1200, 1100-1300, 1330-1500) is 60-99%
  // over the same span — there is nowhere on the frame to put white text. It only
  // clears at 1.5s, and moving TEXT_IN_START that late leaves ~0.7s of readable
  // hold against the standard 0.9s, which needs a per-motion TIMING override —
  // a second mechanism, deliberately not built for one clip.
  //
  // To restore: uncomment the line, and either accept the wash or add the timing
  // override. Do not restore it silently on the assumption the clip was the
  // problem — the clip renders correctly; it is the text over it that cannot be
  // read. ⚠ No preflight catches this: the gate that would have (MKT-42's
  // checkMotionLockup) was deleted by MKT-45. Check a frame by eye.
];

/** Endcard motions, PER TIER. Crossing these sets is the failure this prevents. */
export const ENDCARD_MOTIONS: Record<Tier, MotionVariant[]> = {
  // MKT-47 (2026-08-01) — THE PRO SET WAS REPLACED WHOLESALE. The four former
  // concepts (std "converging threads", alt "vault rings", steady "scrolling
  // waveform", lattice "node lattice") are RETIRED, not superseded in place.
  //
  // WHY, because it is the finding: they settled their content at y613-824,
  // leaving 416-627px between the form and the lockup at the shared 1240 band,
  // while the free motions settle y966-1000 and read correctly at 240-274px.
  // No text position can win against footage that settles too high — that is
  // what produced the whole MKT-41→45 tuck-and-revert cycle. ⚠ ALL FOUR WERE
  // REGENERATED FROM CORRECTED PROMPTS AND STILL LANDED AT 43-49%, which is
  // the evidence that the CONCEPTS settle high regardless of prompt. Both the
  // incumbents and the regenerations are kept as *_incumbent_backup.mp4 /
  // *_regen_backup.mp4 so a future session proposing to revive one can see it
  // was tried twice.
  //
  // The replacements settle 50.3-52.5% against free's 50.4-52.0%, so the shared
  // 1240 reads as the form's landing on EVERY kind in the system — the first
  // time that has been true. ⚠ Do NOT populate ENDCARD_MOTION_LOCKUP for these
  // (v2.7 notes A/D): the fix is the footage, and the band does not move.
  //
  // A fifth delivery, `anvil`, PASSED composition (50.3%) and was DROPPED: its
  // form dips to y1192, only 48px above the lockup, and the measurement tracks
  // the form rather than the smoke drifting around it — an intermittent overlap
  // that reads fine in the frame you check and wrong in the one you do not.
  // Kept as endcard_motion_pro_anvil_backup.mp4.
  //
  // BED: discharge/ignite/lock are bed-viable (corrections −0.1/+3.3/+3.2dB —
  // discharge is the best-bedding motion in the system). reveal derives a
  // window at −43.2dB and is BED-INELIGIBLE: it needs +15.6dB against the ±6dB
  // clamp, WORSE than lattice's +13.5dB, so it must not be force-bedded for
  // exactly the MKT-19 item E reason. It plays on wall-to-wall days and drops
  // on hum-bed ones. Three viable clears the ≥2 floor — better than the set it
  // replaces, which had only two.
  pro: [
    { file: 'endcard_motion_pro_reveal.mp4', tag: 'reveal', label: 'turbulence clearing' },
    { file: 'endcard_motion_pro_discharge.mp4', tag: 'discharge', label: 'single strike' },
    { file: 'endcard_motion_pro_ignite.mp4', tag: 'ignite', label: 'seed ignition' },
    { file: 'endcard_motion_pro_lock.mp4', tag: 'lock', label: 'sealing ring' },
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

/** Kinds per tier, in a stable order — the endcard lane's spread axis. */
export const ENDCARD_KINDS: Record<Tier, string[]> = {
  pro: ['allday_pro', 'midday_pro', 'evening_pro', 'verify'],
  // MKT-40: verify_public is free-tier at the close like every public kind.
  free: ['allday_free', 'midday_free', 'evening_free', 'allday_public', 'midday_public', 'evening_public', 'verify_public'],
};

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
  /** Why a bed is unusable, when it is — printed by reel:check. */
  bedNote?: string;
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
export function stingerMotionsFor(kind: string, dateISO: string): MotionVariant[] {
  // MKT-19 + operator 2026-07-29: spread across kinds, not just across dates.
  // Every kind used to draw the same motion each morning (measured: 1 distinct
  // across 6 kinds). Indexed within STINGER_KINDS so the walk is even.
  const rotation = laneRotate(STINGER_MOTIONS, dateISO, ROTATION_SALT.stinger, laneIndex(STINGER_KINDS, kind));
  // MKT-31 item 5 — verify's stinger motion is FIXED to the seal, REPLACING
  // rotation for this kind (matching its fixed intro): the shared five no
  // longer serve verify at all. A missing or defective seal BUILD degrades to
  // NO stinger (probeStinger's graceful null), never to a slate motion — the
  // same semantics as the fixed intro's legacy-open fallback. While the seal
  // is HELD, verify draws the rotation, which is the pre-seal behaviour.
  // MKT-40: verify_public inherits the seal pin — it is the same reel's
  // identity on a public surface (ruling recorded in the Phase 0 report).
  if ((kind === 'verify' || kind === 'verify_public') && !VERIFY_SEAL_MOTION.held) return [VERIFY_SEAL_MOTION];
  return rotation;
}

/**
 * The motion set to BUILD and VALIDATE for a kind. The shared set plus, for
 * verify only, the pinned seal. Kept separate from stingerMotionsFor so build
 * and preflight enumerate the same files the resolver can ever name — the
 * stray scan's contract.
 */
export function stingerMotionSetFor(kind: string): MotionVariant[] {
  if ((kind === 'verify' || kind === 'verify_public') && !VERIFY_SEAL_MOTION.held) return [VERIFY_SEAL_MOTION, ...STINGER_MOTIONS];
  return STINGER_MOTIONS;
}

/** Kinds that carry a stinger, in a stable order — the stinger lane's spread axis. */
export const STINGER_KINDS = [
  'allday_pro', 'allday_free', 'midday_pro', 'evening_pro', 'midday_free', 'evening_free',
  'allday_public', 'midday_public', 'evening_public',
];

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
  // Spread within the TIER, because the pool is tier-locked — indexing on a
  // global kind order collapses the pro tier (kinds 0,2,3,4) onto one motion.
  const tier = tierFor(kind);
  const ordered = laneRotate(
    ENDCARD_MOTIONS[tier], dateISO, ROTATION_SALT.endcard, laneIndex(ENDCARD_KINDS[tier], kind),
  );
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
    VERIFY_SEAL_MOTION.file,
    ...ENDCARD_MOTIONS.pro.map(m => m.file),
    ...ENDCARD_MOTIONS.free.map(m => m.file),
  ])];
}
