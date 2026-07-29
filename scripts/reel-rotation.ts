// MKT-20 — ONE date-offset helper for every rotating asset lane.
//
// Three lanes rotate on a date: the anchor intro (MKT-17), the stinger and
// endcard motions (MKT-19), and now the carrier part 1 (MKT-20). Each arrived
// separately and each grew its own copy of the same four lines. This is the
// third, which is the point at which a shared helper stops being premature and
// starts being the thing that keeps them honest — they must agree on what "the
// same day" means or a re-run of a past date reproduces some beats and not
// others, and that is a bug nobody would find by reading one file.
//
// The basis is `dayIndex`, the same clock-free day-of-year the caption and panel
// engines use. Clock-free is load-bearing: re-running 2026-07-14 must reproduce
// exactly what that morning built, so nothing here may read the current time.
import { dayIndex } from '../constants/reelPanels';

/**
 * Rotate an ordered set by a date-derived offset, returning the WHOLE list in
 * preference order rather than a single pick.
 *
 * Returning the ordered list is what makes graceful degradation fall out for
 * free at every call site: the caller walks it and takes the first usable
 * entry, so a missing or defective member drops for that day instead of taking
 * the run down. Every lane depends on that shape.
 *
 * `salt` offsets one lane against another so they do not move in lockstep. The
 * lanes rotate INDEPENDENTLY by design — the combinatorial spread across intro
 * x stinger x endcard x carrier is the whole point, and no attempt is made to
 * make the combination unique. Salts in use: intro 0, stinger 0, endcard 3,
 * carrier 5. They only need to differ; the values carry no meaning beyond that.
 */
export function rotateByDate<T>(set: T[], dateISO: string, salt = 0): T[] {
  if (set.length === 0) return [];
  const start = (dayIndex(dateISO) + salt) % set.length;
  return set.map((_, i) => set[(start + i) % set.length]);
}

/** Salt per lane. Kept together so a new lane cannot silently reuse one. */
export const ROTATION_SALT = {
  intro: 0,
  stinger: 0,
  endcard: 3,
  carrier: 5,
} as const;
