// MKT-49 — rotation health: does the SCHEDULE actually vary?
//
// Every other check in reel:check asks whether an asset is present and
// well-formed. None of them asks the question an operator asks by watching:
// "why do I keep seeing the same stinger?" That gap is why the 2026-08-06
// findings were found by eye rather than by preflight — the assets were all
// valid, and the rotation was still repeating on a 4-day loop.
//
// There was already a precedent for the check, wired to exactly one lane:
// `rotationDegenerate` warns when the panel count and the modal stride cycle
// through only a couple of distinct subsets. This generalises that idea to the
// four asset lanes (intro, stinger, endcard, carrier).
//
// ⚠ THIS MEASURES THE SCHEDULE, NOT THE OUTCOME. Every lane resolves by walking
// an ordered candidate list and taking the first file that is actually on disk,
// so a missing member silently shifts the day's pick. That degradation is
// deliberate (see reel-intro.ts) and it is NOT modelled here: this reads
// candidate[0] — what the date INTENDS — because a rotation that looks healthy
// only because a file is missing is not healthy, and the missing file is
// already a WARN from the per-asset checks. Schedule health and asset presence
// are separate questions and are answered separately on purpose.
import { CARRIERS } from './carrier-config';
import { carrierCandidates } from './reel-carrier';
import { INTRO_ROTATION, FIXED_INTRO, introCandidates } from './anchor-intros';
import {
  STINGER_MOTIONS, ENDCARD_MOTIONS, VERIFY_SEAL_MOTION,
  stingerMotionsFor, endcardMotionsFor, tierFor,
} from './brand-motion';
import { REEL_SCOPES, SCOPES, reelKind } from './reel-scopes';

/**
 * Every kind a full daily run builds, in a stable order.
 *
 * Derived from the scope registry rather than listed, so a variant registered
 * in reel-scopes.ts enters this report automatically — the 2026-08-06 finding
 * was in part that the lane-spread fix had been measured against SIX kinds
 * (MASTER_AUDIT:117) and nobody re-measured when the system grew to nine.
 * A hardcoded list here would guarantee that happens again.
 */
export function dailyKinds(): string[] {
  const slate = SCOPES.flatMap(s => REEL_SCOPES[s].variants.map(v => reelKind(s, v)));
  return ['verify', 'verify_public', ...slate];
}

export interface Lane {
  name: string;
  /**
   * True when every consumer draws from ONE shared pool, so two kinds landing
   * on the same member is a real collision.
   *
   * False for the carrier lane, whose sets are per-kind and disjoint — an
   * All-Day carrier structurally cannot reach the Evening reel, so no file
   * collision is possible and counting them would always report zero. What
   * matters there is POSITION collision: every kind sitting at entry 0 of its
   * own set on the same morning is the lockstep defect fixed on 2026-08-06,
   * and position is the only view that can see it.
   */
  sharedPool: boolean;
  /** Scheduled pick for a kind on a date — candidate[0], before any disk walk. */
  pick(kind: string, dateISO: string): string | null;
  /** Position of that pick within the kind's own ordered set. */
  position(kind: string, dateISO: string): number;
  /** How many distinct members this kind can ever draw. 1 = pinned. */
  poolSize(kind: string): number;
}

const idx = <T>(set: readonly T[], match: (t: T) => boolean): number => {
  const i = set.findIndex(match);
  return i >= 0 ? i : 0;
};

export const LANES: Lane[] = [
  {
    name: 'intro',
    sharedPool: true,
    pick: (k, d) => introCandidates(k, d)[0]?.file ?? null,
    position(k, d) {
      const f = this.pick(k, d);
      return f ? idx(INTRO_ROTATION, v => v.file === f) : 0;
    },
    poolSize: k => (FIXED_INTRO[k] ? 1 : INTRO_ROTATION.length),
  },
  {
    name: 'stinger',
    sharedPool: true,
    pick: (k, d) => stingerMotionsFor(k, d)[0]?.tag ?? null,
    position(k, d) {
      const t = this.pick(k, d);
      return t ? idx(STINGER_MOTIONS, m => m.tag === t) : 0;
    },
    // verify + verify_public pin to the seal (MKT-31/40) — a standing ruling,
    // reported as a pool of 1 rather than treated as a defect.
    poolSize: k => ((k === 'verify' || k === 'verify_public') && !VERIFY_SEAL_MOTION.held ? 1 : STINGER_MOTIONS.length),
  },
  {
    name: 'endcard',
    sharedPool: true,
    // Tier-locked, so the tag alone is ambiguous across tiers — a pro `std` and
    // a free `std` are different files. Qualified so the collision count is not
    // inflated by two tiers sharing a tag name.
    pick: (k, d) => {
      const m = endcardMotionsFor(k, d)[0];
      return m ? `${tierFor(k)}:${m.tag}` : null;
    },
    position(k, d) {
      const m = endcardMotionsFor(k, d)[0];
      return m ? idx(ENDCARD_MOTIONS[tierFor(k)], x => x.tag === m.tag) : 0;
    },
    // Unbedded: `needsBed` narrows the set on short-carrier days, but that is a
    // per-day runtime condition, not a property of the schedule.
    poolSize: k => ENDCARD_MOTIONS[tierFor(k)].length,
  },
  {
    name: 'carrier',
    sharedPool: false,
    pick: (k, d) => carrierCandidates(k, d)[0]?.file ?? null,
    position(k, d) {
      const f = carrierCandidates(k, d)[0]?.file;
      const set = CARRIERS[k]?.set ?? [];
      return f ? idx(set, v => v.file === f) : 0;
    },
    poolSize: k => CARRIERS[k]?.set.length ?? 0,
  },
];

const DAY_MS = 86_400_000;

export function addDays(dateISO: string, n: number): string {
  return new Date(new Date(dateISO + 'T12:00:00Z').getTime() + n * DAY_MS).toISOString().slice(0, 10);
}

export interface DayRow {
  date: string;
  /** Scheduled pick per kind, index-aligned with the kind list. */
  picks: (string | null)[];
  /** Distinct scheduled picks that day. */
  distinct: number;
  /** How many picks are repeats of an earlier pick that day. */
  dupes: number;
  /** The member(s) drawn more than once, with their counts. */
  repeated: { member: string; times: number }[];
}

export interface LaneReport {
  lane: string;
  kinds: string[];
  /** Kinds whose pool is >1 — the only ones the schedule can vary. */
  rotating: string[];
  poolSizes: Record<string, number>;
  rows: DayRow[];
  /**
   * Smallest number of days after which the WHOLE day's assignment repeats.
   * 0 when no repeat was found inside the scan window.
   */
  period: number;
  /**
   * Closest two days anywhere in the scan that share an identical assignment,
   * and how far apart they are. 0 = never recurs.
   *
   * ⚠ THIS IS THE METRIC THAT STAYS HONEST, and it exists because `period`
   * stopped being sufficient the moment the schedule was de-correlated. A fixed
   * modulo walk has a clean period and reporting it is enough. A reshuffled one
   * usually has NO period inside the scan — which reads as "perfect variety" and
   * would hide a pair of identical mornings six days apart. A detector that goes
   * blind exactly when the thing it watches gets fixed is worse than no
   * detector, so the warning is driven by this, not by `period`.
   */
  minGap: number;
  /** The dates of that closest recurrence, for the report. */
  minGapAt: [string, string] | null;
  /** Worst single-day repeat count across the scan. */
  maxRepeat: number;
  /** Pool size the lane would need for every rotating kind to differ daily. */
  poolNeeded: number;
}

/**
 * How far to scan when looking for the repeat period, and where from.
 *
 * ⚠ THE SCAN MUST NOT CROSS A YEAR BOUNDARY, and finding that out is the reason
 * this is a named constant with a paragraph attached. Every lane rotates on
 * `dayIndex`, which is day-of-year and RESETS on Jan 1 — so a lane with a 4-day
 * cycle runs 4-day all year and then jumps, because 365 % 4 != 0. A scan
 * straddling Dec 31 sees that discontinuity and reports "no cycle" for a lane
 * that visibly repeats every four days. The first cut of this file did exactly
 * that and called a 4-day stinger loop acyclic.
 *
 * So the scan is anchored at Jan 1 of the start date's year. The schedule is
 * translation-invariant WITHIN a year (the offset is linear in dayIndex), so
 * any in-year anchor yields the same period, and Jan 1 is the one anchor that
 * can never run out of room.
 *
 * The year-boundary jump is real but is not what this report is about: it
 * perturbs the rotation once a year, in the direction of MORE variety.
 */
const PERIOD_SCAN = 300;
const periodAnchor = (startISO: string): string => `${startISO.slice(0, 4)}-01-01`;

export function laneReport(lane: Lane, startISO: string, days: number, kinds = dailyKinds()): LaneReport {
  const key = (d: string) =>
    kinds.map(k => (lane.sharedPool ? lane.pick(k, d) : `${k}@${lane.position(k, d)}`)).join('|');

  const rows: DayRow[] = [];
  let maxRepeat = 0;
  for (let i = 0; i < days; i++) {
    const date = addDays(startISO, i);
    const picks = kinds.map(k => lane.pick(k, date));
    // On a shared pool, two kinds on the same FILE is the collision. On a
    // per-kind pool no file collision is possible, so the equivalent signal is
    // two kinds sitting at the same POSITION in their own sets — lockstep.
    const seen = lane.sharedPool
      ? picks.map((p, n) => (lane.poolSize(kinds[n]) > 1 ? p : null))
      : kinds.map(k => (lane.poolSize(k) > 1 ? `pos${lane.position(k, date)}` : null));
    const counts = new Map<string, number>();
    for (const s of seen) if (s) counts.set(s, (counts.get(s) ?? 0) + 1);
    const repeated = [...counts].filter(([, n]) => n > 1).map(([member, times]) => ({ member, times }));
    const dupes = repeated.reduce((a, r) => a + r.times - 1, 0);
    maxRepeat = Math.max(maxRepeat, ...[...counts.values(), 0]);
    rows.push({ date, picks, distinct: new Set(seen.filter(Boolean)).size, dupes, repeated });
  }

  // Period: smallest p where the assignment at day i equals day i+p, for every
  // i in a window long enough that a short coincidence cannot pass as a cycle.
  const anchor = periodAnchor(startISO);
  const keys = Array.from({ length: PERIOD_SCAN }, (_, i) => key(addDays(anchor, i)));
  let period = 0;
  for (let p = 1; p <= PERIOD_SCAN / 2; p++) {
    let ok = true;
    for (let i = 0; i + p < PERIOD_SCAN; i++) if (keys[i] !== keys[i + p]) { ok = false; break; }
    if (ok) { period = p; break; }
  }

  // Closest recurrence of an identical assignment anywhere in the scan window.
  const firstSeen = new Map<string, number>();
  let minGap = 0;
  let minGapAt: [string, string] | null = null;
  for (let i = 0; i < PERIOD_SCAN; i++) {
    const prior = firstSeen.get(keys[i]);
    if (prior !== undefined && (minGap === 0 || i - prior < minGap)) {
      minGap = i - prior;
      minGapAt = [addDays(anchor, prior), addDays(anchor, i)];
    }
    if (prior === undefined) firstSeen.set(keys[i], i);
  }

  const rotating = kinds.filter(k => lane.poolSize(k) > 1);
  const poolSizes: Record<string, number> = {};
  for (const k of kinds) poolSizes[k] = lane.poolSize(k);
  // A shared pool needs one member per rotating consumer. A per-kind pool needs
  // enough entries to de-phase the rotating kinds against each other.
  const poolNeeded = rotating.length;

  return { lane: lane.name, kinds, rotating, poolSizes, rows, period, minGap, minGapAt, maxRepeat, poolNeeded };
}

/** Distinct full (intro × stinger × endcard × carrier) combinations for a kind. */
export function comboPeriod(kind: string, startISO: string): number {
  const anchor = periodAnchor(startISO);
  const sig = (i: number) => {
    const d = addDays(anchor, i);
    return LANES.map(l => l.pick(kind, d) ?? '-').join('|');
  };
  const sigs = Array.from({ length: PERIOD_SCAN }, (_, i) => sig(i));
  for (let p = 1; p <= PERIOD_SCAN / 2; p++) {
    let ok = true;
    for (let i = 0; i + p < PERIOD_SCAN; i++) if (sigs[i] !== sigs[i + p]) { ok = false; break; }
    if (ok) return p;
  }
  return 0;
}

/**
 * The threshold below which a repeat cycle is short enough that a regular
 * viewer sees the same arrangement twice in a week.
 *
 * Seven is the viewer's unit, not an engineering one: someone following a room
 * daily is the person who noticed this, and a cycle inside their week is what
 * they experience as "again". Lanes at or above it still repeat — every finite
 * rotation does — just not inside the window where it reads as repetition.
 */
export const PERIOD_WARN_BELOW = 7;
