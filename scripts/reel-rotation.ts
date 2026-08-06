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

// ── Per-cycle reshuffle (2026-08-06) ────────────────────────────────────────
//
// THE PROBLEM. A plain `(dayIndex + salt + index) % n` walks the set in the
// SAME ORDER forever, so the whole day's assignment repeats with period exactly
// n. Measured 2026-08-06: the stinger lane's nine-reel assignment was identical
// every 4 days without end (08-01 == 08-05 == 08-09 …), and the carrier lane
// the same. Worse than one asset recurring — the PAIRINGS recur, so a viewer
// sees not just the same stinger but the same stinger behind the same intro.
//
// THE FIX. Keep walking the set one step per day, but reshuffle the ORDER each
// time a full cycle completes. Every member is still drawn exactly once per
// n-day block, so usage stays perfectly even — what changes is that the order
// within the next block, and therefore the cross-lane pairing, is different.
//
// TWO PROPERTIES THIS MUST NOT BREAK, both learned the hard way:
//
//  1. SAME-DAY DISTINCTNESS ACROSS KINDS (MKT-23). The permutation is seeded on
//     the LANE (`salt`) alone and shared by every kind in it; only the POSITION
//     is offset per kind. Seeding per kind instead would let two kinds land on
//     the same member on a day the pool is big enough to avoid it — silently
//     undoing the lane-spread fix while looking more random.
//  2. CLOCK-FREE DETERMINISM. Everything derives from `dayIndex`, so a given
//     date always yields the same schedule. No Date.now(), no run counter.
//
// ⚠ THIS IS RETROACTIVE, and that is an accepted cost, not an oversight.
// Re-running a past date now reproduces that date's BODY exactly (MKT-18 is
// untouched — provenance is about the body, not the furniture) but not
// necessarily the intro/stinger/endcard/carrier that shipped that morning.
// Reels are built for the current day, so nothing in the daily path re-derives
// an old morning's furniture; a published reel keeps whatever it was built
// with. Operator-approved 2026-08-06.

/** Deterministic 32-bit PRNG. Small, stable, and dependency-free by design. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fisher-Yates over 0..n-1 for a seed. Same seed, same permutation, always. */
function shuffledIndices(n: number, seed: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  const rnd = mulberry32(seed);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * The order a lane walks during cycle `cycle`.
 *
 * Iterates from cycle 0 rather than seeding straight to `cycle` so the
 * back-to-back guard below can be applied honestly: the guard compares against
 * the PREVIOUS cycle's order AFTER that cycle's own guard ran, which is only
 * knowable by walking forward. Bounded and cheap — `dayIndex` resets every Jan
 * 1, so `cycle` never exceeds 365 and is usually far smaller.
 *
 * THE GUARD. Under a plain modulo walk a kind can never draw the same member
 * two days running (it steps through a fixed cycle), and losing that would be a
 * NEW repetition artifact introduced by the fix for repetition — the most
 * visible kind, the same stinger two mornings in a row. Reshuffling per block
 * breaks it at block boundaries unless the incoming order is constrained.
 *
 * ⚠ THE CONSTRAINT IS POINTWISE OVER EVERY POSITION, NOT JUST THE HEAD, and
 * getting that wrong is the bug this comment exists to prevent. The first cut
 * compared only `perm[0]` against the previous order's last entry, which is
 * correct for a kind at index 0 and WRONG FOR EVERY OTHER KIND: a kind at index
 * i ends block c on `perm_c[(i-1) mod n]` and opens block c+1 on
 * `perm_{c+1}[i]`. Verified against the real registries, that guard still let
 * allday_free repeat `fracture` on 01-08→01-09 and `powerup` on 02-17→02-18.
 *
 * So the incoming order must avoid the previous one POINTWISE at every
 * position. Roughly 1/e of random permutations already do; candidates are drawn
 * with a stepped seed until one qualifies, which is deterministic (same inputs,
 * same sequence of candidates) and terminates in ~3 draws on average.
 *
 * ⚠ SECOND CONSTRAINT: NOT A ROTATION OF THE PREVIOUS ORDER. This one is not
 * obvious and cost a wrong-looking table before it was understood.
 *
 * Because every kind shares one order and differs only by a cyclic position
 * offset, a day's whole assignment vector is unchanged if the order is rotated
 * by r and the position shifted by r. So an incoming order that happens to be a
 * ROTATION of the outgoing one reproduces the entire day's assignment a few
 * days later, even though every per-kind rule above is satisfied. Observed with
 * the pointwise guard alone: 2026-08-07 and 2026-08-09 came out identical
 * across all nine reels.
 *
 * The consequence worth stating plainly, because it bounds what this mechanism
 * can ever deliver: the day-assignment depends on the order's ROTATION CLASS,
 * so a pool of n admits only (n-1)! distinct daily patterns — SIX for a pool of
 * 4. The reshuffle cannot manufacture variety beyond that ceiling; what it does
 * is stop the six recurring in a fixed 4-day sequence and keep consecutive
 * cycles distinct, which pushes any repeat past the viewer's week. Raising the
 * ceiling itself needs assets, not arithmetic.
 *
 * Skipped for n<2 (nothing to vary) and n==2, where both permutations are
 * rotations of each other and the constraint is unsatisfiable — a pool of 2 has
 * exactly one daily pattern, which is the ceiling above, not a defect here.
 */
function isRotationOf(a: number[], b: number[]): boolean {
  const n = a.length;
  for (let r = 0; r < n; r++) {
    let same = true;
    for (let i = 0; i < n; i++) if (a[i] !== b[(i + r) % n]) { same = false; break; }
    if (same) return true;
  }
  return false;
}

function cycleOrder(n: number, salt: number, cycle: number): number[] {
  let perm: number[] = [];
  let prev: number[] | null = null;
  for (let c = 0; c <= cycle; c++) {
    // What each position drew on the LAST day of the previous cycle: a kind at
    // index i sat on prev[(i-1) mod n], so that is what position i must avoid.
    const forbidden = prev ? prev.map((_, i) => prev![(i - 1 + n) % n]) : null;
    const base = salt * 7919 + c * 31;
    perm = shuffledIndices(n, base);
    const bad = (p: number[]): boolean =>
      !!forbidden && (p.some((v, i) => v === forbidden[i]) || (n > 2 && isRotationOf(p, prev!)));
    for (let tries = 1; tries <= 64 && bad(perm); tries++) {
      perm = shuffledIndices(n, base + tries * 104729);
    }
    prev = perm;
  }
  return perm;
}

/**
 * Schedule a set for a date, returning the WHOLE list in preference order
 * rather than a single pick.
 *
 * Returning the ordered list is what makes graceful degradation fall out for
 * free at every call site: the caller walks it and takes the first usable
 * entry, so a missing or defective member drops for that day instead of taking
 * the run down. Every lane depends on that shape.
 *
 * `salt` offsets one lane against another so they do not move in lockstep, and
 * now also seeds the lane's shuffle. The lanes rotate INDEPENDENTLY by design —
 * the combinatorial spread across intro x stinger x endcard x carrier is the
 * whole point. Salts in use: intro 0, stinger 0, endcard 3, carrier 5. They
 * only need to differ; the values carry no meaning beyond that.
 */
function scheduleOrder<T>(set: T[], dateISO: string, salt: number, index: number): T[] {
  const n = set.length;
  if (n === 0) return [];
  if (n === 1) return [set[0]];
  // The lane clock deliberately EXCLUDES `index`: the cycle and the shuffle are
  // lane-wide, and only the starting position is per-kind. See property 1.
  const t = dayIndex(dateISO) + salt;
  const perm = cycleOrder(n, salt, Math.floor(t / n));
  const pos = (((t % n) + index) % n + n) % n;
  return Array.from({ length: n }, (_, i) => set[perm[(pos + i) % n]]);
}

export function rotateByDate<T>(set: T[], dateISO: string, salt = 0): T[] {
  return scheduleOrder(set, dateISO, salt, 0);
}

/** Salt per lane. Kept together so a new lane cannot silently reuse one. */
export const ROTATION_SALT = {
  intro: 0,
  stinger: 0,
  endcard: 3,
  carrier: 5,
} as const;

/**
 * Per-kind offset, so a lane SPREADS across the day's reels instead of moving
 * through them in lockstep.
 *
 * THE PROBLEM THIS FIXES (operator, 2026-07-29). Every lane rotated on the date
 * alone, so on any given morning every reel drew the SAME member. Measured on
 * 2026-07-29 across six kinds: 1 distinct stinger, 2 distinct endcards, 3
 * distinct intros — all four slate reels opened on the identical intro, stinger
 * and endcard. Someone following both the Pro and Free rooms saw the same six
 * seconds twice before breakfast.
 *
 * `index` is the kind's position within THAT LANE'S OWN consumer list — not a
 * global kind index. This matters and was got wrong first: a global index gives
 * uneven spread once a lane serves a non-contiguous subset (the endcard pro tier
 * is kinds 0, 2, 3, 4 of the global order, which collapses to 0,0,1,0 against a
 * 2-motion pool). Indexing within the lane guarantees an even walk across
 * whatever pool that lane has.
 *
 * Where the pool is at least as large as the lane's consumer count, every reel
 * gets a DISTINCT member. Where it is smaller, they spread as evenly as the
 * pool allows — which is the honest ceiling, and the asset counts needed to
 * reach full distinctness are recorded in the audit.
 */
export function laneRotate<T>(set: T[], dateISO: string, salt: number, index: number): T[] {
  // NOT `rotateByDate(set, dateISO, salt + index)` any more, and the difference
  // is load-bearing: folding the index into the salt would seed a DIFFERENT
  // shuffle per kind, which breaks same-day distinctness (property 1 above).
  // The index offsets the position only.
  return scheduleOrder(set, dateISO, salt, index);
}

/** Position of `kind` in a lane's consumer list; 0 when absent (single-kind lanes). */
export function laneIndex(kinds: string[], kind: string): number {
  const i = kinds.indexOf(kind);
  return i >= 0 ? i : 0;
}
