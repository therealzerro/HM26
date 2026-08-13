// MKT-17 — Anchor intro resolution.
//
// MKT-08 shipped ONE intro read from a fixed filename. Two things changed that:
// the slate reels now have a rotating set, and the public cuts (MKT-16) need
// their own fixed intro. Both are the same question — "which intro does THIS
// reel kind get today?" — so this is one resolver, not a rotation mechanism
// bolted next to a per-kind lookup.
//
// Rotation mirrors the MKT-11 panel pattern deliberately: a date-derived offset
// over an ordered list, using the same clock-free `dayIndex` the caption engine
// uses, so re-running a given date reproduces that date's intro exactly. Growing
// the set is a line here and nothing else.

import { laneRotate, laneIndex, ROTATION_SALT } from './reel-rotation';

export interface IntroVariant {
  file: string;
  /** Logged in the run summary so the operator can see which one played. */
  label: string;
}

/**
 * The rotating set, for SLATE reels only (allday/midday/evening, pro + free).
 *
 * `anchor_intro_powerup.mp4` is the MKT-23 REGENERATION, in the set since
 * 2026-07-30 — see the entry at its line below. (The original delivery was
 * rejected by MKT-17 for never reaching full-frame smoke; a stale "awaiting
 * regeneration" claim about it survived into two handoffs and the audit's
 * v2.2 close-out before MKT-35 struck it.)
 *
 * `arrival` and `monitors` (added 2026-07-29) are both trimmed from 10.005s
 * masters, as every intro delivery has been. Their trims are NOT the same and
 * the difference is the point — the trim rule is a rule about the footage, not
 * a fixed window:
 *   arrival  IN 2.0 / OUT 8.0. Its master opens on ~1.7s of near-static desk
 *            over DIGITAL SILENCE, then hard-cuts to the Anchor at 1.667s with
 *            the audio swelling in at 2.0s. Cutting at the picture cut would
 *            have opened the reel on a third of a second of silence, so the
 *            in-point is the AUDIO onset instead. This is `anchor_intro`'s own
 *            history repeating — its master wasted ~1.9s the same way.
 *            It is the shot `powerup` failed to deliver: the camera pushes
 *            fully into the handset and it leaves frame entirely by 5.0s.
 *   monitors IN 0.0 / OUT 6.0. Audio from frame 1, so no slide needed. Its
 *            master pulls back OUT to the newsroom from ~7.0s — the MKT-08
 *            tail failure — so the out-point must stay ahead of that; there is
 *            no usable bed anywhere after 7.0s.
 */
export const INTRO_ROTATION: IntroVariant[] = [
  { file: 'anchor_intro.mp4', label: 'standard' },
  { file: 'anchor_intro_deadpan.mp4', label: 'deadpan' },
  { file: 'anchor_intro_arrival.mp4', label: 'arrival' },
  { file: 'anchor_intro_monitors.mp4', label: 'monitors' },
  // MKT-23. powerup is the REGENERATION of the file MKT-17 rejected: the old cut
  // never reached full-frame smoke (bezel in shot at every candidate out-point).
  // The rebuild pushes fully into the screen and the handset is gone by 5.6s.
  { file: 'anchor_intro_powerup.mp4', label: 'powerup' },
  // board is the first STAGING change in the set — the Anchor standing at a
  // wall-sized display rather than seated. Its wall was audited at 2.5x across
  // four timestamps for glyphs and numerals and is clean, which matters because
  // public kinds will eventually draw from this rotation.
  { file: 'anchor_intro_board.mp4', label: 'board' },
  // MKT-54 (2026-08-13). guest is the pool's first TWO-SHOT — a bronze,
  // rounder, older domestic-model robot (amber visor slab, burgundy robe, mug)
  // beside the Anchor. Both figures and the raised phone verified inside the
  // 1:1 band y420-1500; wall audited at 2x, chart smudges only, no glyphs.
  // ⚠ Generator lore recorded in the audit: three HUMAN-guest attempts were
  // refused; the all-robot two-shot cleared first try. Robot guests are an
  // open lane; human guests are closed.
  { file: 'anchor_intro_guest.mp4', label: 'guest' },
  // window opens back-to-camera at a pre-dawn city — skyline swept at 2x
  // across four timestamps: bokeh lit windows only, no signage or numerals.
  // IN 0.0 (audio from frame 1) / OUT 6.2 — its master GHOSTS THE PULL-BACK
  // through the smoke from ~6.6s and fully returns to the room by ~7.5s, so
  // any re-trim must keep the out-point at or before ~6.3s.
  { file: 'anchor_intro_window.mp4', label: 'window' },
  // ⚠ anchor_intro_arrive.mp4 is DELIVERED, TRIMMED AND GATED-OUT, not
  // registered: its desk-front display shows a legible "S" letterform from
  // frame 0 (the camera-roll thumbnail frame) to ~1.2s — the same wall bar
  // board's audit set for this rotation. Every fix is a creative call the
  // operator owns (IN≈1.35 clears the glyph but deletes the empty-desk beat
  // that is the clip's concept). See UNREFERENCED_OK and MKT-54.
];

/** Fallback when the rotation is empty or every member is unusable. */
export const INTRO_DEFAULT = 'anchor_intro.mp4';

/**
 * Slate kinds that draw from the rotation, in a stable order — the intro lane's
 * spread axis. verify and the public kinds are absent because they are FIXED
 * (below) and never draw from the pool.
 */
export const SLATE_KINDS = ['allday_pro', 'allday_free', 'midday_pro', 'evening_pro', 'midday_free', 'evening_free'];

/**
 * PINNED INTRO SETS — kinds that never draw the slate rotation.
 *
 * verify — a deadpan gag ahead of yesterday's receipts is a tonal mismatch.
 * public — cold-audience hook, and these are the only intros cleared for a
 *          public surface; a rotation member must never be swapped in.
 *
 * MKT-49 (2026-08-06): SETS, not single filenames. The rulings above pin these
 * kinds AWAY FROM THE SLATE ROTATION; they never said "one file forever", and
 * reading them that way had left the public cut — the cold-audience surface,
 * where novelty matters most — as the most static thing in the system (20
 * distinct arrangements against allday_free's 221). A second CLEARED public
 * intro or a verify variant registers as one line in the right set and rotates
 * like every lane, spread across the set's sharers. With one member the
 * behaviour is byte-identical to the old pin.
 *
 * ⚠ Members of PUBLIC_INTROS must be PUBLIC-CLEARED (the MKT-30 Q1/Q2 bar,
 * glyph/numeral sweep) BEFORE registration, exactly as anchor_intro_public
 * was. This set feeding four public kinds is precisely why the slate rotation
 * must never leak in here — and why a rotation member being clean is not
 * enough: clearance is per-file, evidenced, and recorded.
 */
export const VERIFY_INTROS: string[] = [
  // MKT-23: repointed off anchor_intro.mp4. Verify pinning to a ROTATION member
  // was a permanent collision, not a rotational one — a slate kind drew that
  // same file every single day, and a label-based count read 6/6 while the file
  // count was 5/6. Verify still does NOT draw the slate rotation: a deadpan gag
  // ahead of yesterday's receipts is a tonal mismatch and that ruling is
  // unchanged. Trimmed to 5.625s / 135 frames, exactly matching standard, so
  // verify's timeline does not shift.
  'anchor_intro_verify.mp4',
];

export const PUBLIC_INTROS: string[] = [
  'anchor_intro_public.mp4',
];

/**
 * Which pinned set each non-rotating kind draws. Kinds sharing a set (by
 * reference — that identity is what defines the sharer group) spread across it
 * in declaration order, so on multi-member days the day's public reels open on
 * different cleared hooks rather than the same one twice.
 */
export const FIXED_INTRO: Record<string, string[]> = {
  verify: VERIFY_INTROS,
  // ⚠ LIVE KINDS FIRST, DORMANT LAST — the MKT-49 Finding 4 rule, applied here
  // the day the sharer order started to matter. Declaration order is the
  // spread axis, and the two kinds that BUILD (allday_public, verify_public)
  // must be adjacent at the head: with the dormant session publics between
  // them, the live pair sits at indices 0 and 3 — congruent mod 3, so on a
  // future 3-member set the morning's two public reels would open on the SAME
  // hook every day, which is the exact defect Finding 4 fixed at the endcard.
  allday_public: PUBLIC_INTROS,
  // MKT-40: the grading half opens on the same cold-audience hook as every
  // public kind — the visor ignition, not verify's group-facing fixed intro.
  verify_public: PUBLIC_INTROS,
  midday_public: PUBLIC_INTROS,
  evening_public: PUBLIC_INTROS,
};

/** Today in ET, matching every other date-derived rotation in the pipeline. */
export function todayET(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

/**
 * Candidate intros for a kind, in preference order.
 *
 * Returning an ORDERED LIST rather than one pick is what makes graceful
 * degradation fall out for free: the probe walks it and takes the first usable
 * file, so a missing or defective rotation member drops that day instead of
 * taking the run down. The default is always appended as the last resort, and a
 * null return from the probe still lands on the legacy lockup open.
 */
export function introCandidates(kind: string, dateISO: string): IntroVariant[] {
  const fixed = FIXED_INTRO[kind];
  if (fixed && fixed.length) {
    // Pinned kinds never fall back into the slate rotation — a public reel
    // must not silently acquire the deadpan gag — but they may fall back to
    // the default. Multi-member sets rotate among THEMSELVES (every candidate
    // ahead of the default is a member of the same cleared set), spread
    // across the kinds sharing this set so two public reels on one morning
    // open on different cleared hooks where the set allows.
    const sharers = Object.keys(FIXED_INTRO).filter(k => FIXED_INTRO[k] === fixed);
    const ordered = laneRotate(fixed, dateISO, ROTATION_SALT.intro, laneIndex(sharers, kind))
      .map(f => ({ file: f, label: f === fixed[0] ? kind : f.replace(/^anchor_intro_?|\.mp4$/g, '') }));
    if (!ordered.some(v => v.file === INTRO_DEFAULT)) {
      ordered.push({ file: INTRO_DEFAULT, label: 'standard (fallback)' });
    }
    return ordered;
  }
  if (INTRO_ROTATION.length === 0) return [{ file: INTRO_DEFAULT, label: 'standard' }];

  // MKT-20: the shared rotation helper. Identical to the inline version it
  // replaces (salt 0), so no date's intro changes.
  const ordered = laneRotate(INTRO_ROTATION, dateISO, ROTATION_SALT.intro, laneIndex(SLATE_KINDS, kind));
  if (!ordered.some(v => v.file === INTRO_DEFAULT)) {
    ordered.push({ file: INTRO_DEFAULT, label: 'standard (fallback)' });
  }
  return ordered;
}

/** Every file the set can ever reference — what reel:check must validate. */
export function allIntroFiles(): string[] {
  return [...new Set([
    ...INTRO_ROTATION.map(v => v.file),
    ...Object.values(FIXED_INTRO).flat(),
    INTRO_DEFAULT,
  ])];
}
