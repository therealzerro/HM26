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

import { dayIndex } from '../constants/reelPanels';

export interface IntroVariant {
  file: string;
  /** Logged in the run summary so the operator can see which one played. */
  label: string;
}

/**
 * The rotating set, for SLATE reels only (allday/midday/evening, pro + free).
 *
 * `anchor_intro_powerup.mp4` is deliberately ABSENT. It was delivered but never
 * reaches full-frame smoke — from 5.6-6.5s it is smoke inside a phone (bezel and
 * notch still framing it) and by 6.8s it has pulled back to the newsroom, so no
 * 6.0s window ends on a usable dissolve bed. Registering it would either fail
 * preflight every morning or ghost a handset outline through the UI body. Add it
 * here once it is regenerated with the camera pushing fully into the screen.
 */
export const INTRO_ROTATION: IntroVariant[] = [
  { file: 'anchor_intro.mp4', label: 'standard' },
  { file: 'anchor_intro_deadpan.mp4', label: 'deadpan' },
];

/** Fallback when the rotation is empty or every member is unusable. */
export const INTRO_DEFAULT = 'anchor_intro.mp4';

/**
 * Kinds that do NOT rotate.
 *
 * verify — a deadpan gag ahead of yesterday's receipts is a tonal mismatch.
 * public — cold-audience hook, and it is the only intro cleared for a public
 *          surface; it must never be swapped for a rotation member.
 */
export const FIXED_INTRO: Record<string, string> = {
  verify: 'anchor_intro.mp4',
  allday_public: 'anchor_intro_public.mp4',
  midday_public: 'anchor_intro_public.mp4',
  evening_public: 'anchor_intro_public.mp4',
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
  if (fixed) {
    // Fixed kinds never fall back into the rotation — a public reel must not
    // silently acquire the deadpan gag — but they may fall back to the default.
    return fixed === INTRO_DEFAULT
      ? [{ file: fixed, label: kind }]
      : [{ file: fixed, label: kind }, { file: INTRO_DEFAULT, label: 'standard (fallback)' }];
  }
  if (INTRO_ROTATION.length === 0) return [{ file: INTRO_DEFAULT, label: 'standard' }];

  const start = dayIndex(dateISO) % INTRO_ROTATION.length;
  const ordered = INTRO_ROTATION.map((_, i) => INTRO_ROTATION[(start + i) % INTRO_ROTATION.length]);
  if (!ordered.some(v => v.file === INTRO_DEFAULT)) {
    ordered.push({ file: INTRO_DEFAULT, label: 'standard (fallback)' });
  }
  return ordered;
}

/** Every file the set can ever reference — what reel:check must validate. */
export function allIntroFiles(): string[] {
  return [...new Set([
    ...INTRO_ROTATION.map(v => v.file),
    ...Object.values(FIXED_INTRO),
    INTRO_DEFAULT,
  ])];
}
