// MKT-88 (2026-10-16) — TRIPLE BOARD SIGNAL ON THE SLATE REELS: the pure
// half. No playwright, no fs, no network — jest imports this directly
// (__tests__/reelTriple.test.ts) and the renderer's DOM layer
// (scripts/reel-triple.ts) builds on it.
//
// Operator order: "on days when there are triple board straight picks I also
// want that fact highlighted in the allday, midday and evening reels,
// creatively signifying fire. the color yellow is reserved for straight
// matches DRAWN in the reels."
//
// So: the triple tile BURNS. Ember red → hot orange → white-hot core, flames
// drawn in CSS (the 🔥 emoji glyph has a yellow core — never used), and the
// hold FLICKERS (the still is captured in four flame phases and the frames
// cycle through them). Gold / amber / yellow are reserved for a STRAIGHT MATCH
// that was DRAWN (the grid's straight stamp, the verify stamps) — every hue
// below stays at or under 28° so nothing in this layer reads as gold.
//
// The law of WHAT a triple is lives in lib/social/briefResolve.ts
// (findTripleBoard — posted order identical on all three boards). This file
// only decides how it LOOKS on the reel.

import { findTripleBoard, parseBoard, fmtDigits, type BoardPick, type ResolveScope } from '../lib/social/briefResolve';

/** Every colour this layer paints. Hue ≤ 28° — ember, never gold. */
export const FIRE = {
  ember: '#FF2A00',     // hue 10°
  hot: '#FF6A1A',       // hue 21°
  tip: '#FF7A2A',       // hue 23° — the hottest tongue tip; still orange
  deep: '#B3001B',      // hue 351°
  core: '#FFF1EA',      // white-hot core (near-white, hue 20°, sat 8%)
  plate: 'rgba(14, 4, 6, 0.90)',
} as const;

/** Tier-2/4 copy (allday's full-fidelity body is seen by the FREE group too).
 *  Linted at both tiers in the unit test; factual, no likelihood word. */
export const TRIPLE_FIRE_COPY = {
  title: 'TRIPLE BOARD SIGNAL',
  sub: 'ONE EXACT ORDER ON ALL THREE BOARDS',
  // No digit in the badge: it also rides the REDACTED free session cuts (ring-only
  // tease, operator 10/16), where the redaction observer re-masks any digit it sees.
  tileBadge: 'ALL THREE BOARDS',
} as const;

/** Caption line on a triple day (operator 10/16), appended by publish-reels
 *  from the BODY'S OWN hm_triple tag — caption and pixels cannot disagree.
 *  Factual (R-B): the order is posted on three boards; nothing about odds. */
export const TRIPLE_CAPTION = {
  withDigits: (digits: string[]) =>
    `TRIPLE BOARD SIGNAL: ${digits.join(' and ')} ${digits.length > 1 ? 'are' : 'is'} posted in the same exact order on all three of today's boards.`,
  tease: 'TRIPLE BOARD SIGNAL: one of today\'s six is posted in the same exact order on all three boards. Pro reads which one.',
} as const;

/** MKT-88b (operator 2026-10-17: "i dont want the triple signal … in every
 *  single caption, prioritize and tune down by 70%"): the line rides ONE cut
 *  per room per day, not all six. Pro room → allday_pro (the morning's first
 *  Pro cut, digits named — the session Pro captions already carry the room
 *  line and the pixels burn the tile). Free room → midday_free (the redacted
 *  tease with the Pro sell — the one place the line earns a conversion;
 *  allday_free's body shows the burning tile in full, so its caption needs no
 *  line). 2 of 6 = a 67% cut. Public kinds get nothing (tier 1). Change the
 *  list, not the function. */
export const TRIPLE_CAPTION_KINDS: ReadonlySet<string> = new Set(['allday_pro', 'midday_free']);

/** Which kinds get which line: the prioritised Pro kind names the digits;
 *  the prioritised redacted free kind gets the digit-free tease. */
export function tripleCaptionLine(kind: string, tag: string[]): string | null {
  if (!tag.length || !TRIPLE_CAPTION_KINDS.has(kind)) return null;
  const digits = tag.filter(t => /^\d-\d-\d$/.test(t));
  if (/^(allday|midday|evening)_pro$/.test(kind) || kind === 'allday_free') return digits.length ? TRIPLE_CAPTION.withDigits(digits) : null;
  if (kind === 'midday_free' || kind === 'evening_free') return TRIPLE_CAPTION.tease;
  return null;
}

/** Flame phases captured per hold. Four reads as fire; two reads as a blink. */
export const FIRE_PHASES = 4;

/**
 * Flicker pattern over the hold: which phase each frame shows. Irregular on
 * purpose (a fixed 0-1-2-3 loop reads as a strobe); step length 7 frames at
 * 60fps ≈ 8.6 steps/s, inside the 6–10 Hz band candle flicker sits in.
 */
export const FIRE_PATTERN: readonly number[] = [0, 1, 2, 1, 3, 2, 0, 2, 3, 1, 0, 3, 1, 2];
export const FIRE_STEP_FRAMES = 7;

export function firePhaseAt(frame: number): number {
  const step = Math.floor(Math.max(0, frame) / FIRE_STEP_FRAMES);
  return FIRE_PATTERN[step % FIRE_PATTERN.length];
}

/** "5-7-3" → "573" (the grid's digit leaves read back as "573"). */
export function tripleKey(digits: string): string {
  return digits.replace(/\D/g, '');
}

/**
 * Which ranks (1-based, slate order) on THIS scope's board carry a triple.
 * Used by the renderer to know which modal holds to burn, and asserted
 * against what the DOM layer actually found on the captured grid — the DB
 * and the pixels must agree or the capture aborts.
 */
export function tripleRanksOnBoard(board: BoardPick[], triples: { digits: string }[]): number[] {
  return Array.from(tripleRankMap(board, triples).keys());
}

/** rank (1-based) → "5-7-3" for every triple on this board, slate order. */
export function tripleRankMap(board: BoardPick[], triples: { digits: string }[]): Map<number, string> {
  const byKey = new Map(triples.map(t => [tripleKey(t.digits), t.digits] as const));
  const out = new Map<number, string>();
  board.forEach((p, i) => {
    const d = byKey.get(tripleKey(fmtDigits(p.bestOrder)));
    if (d) out.set(i + 1, d);
  });
  return out;
}

/**
 * From the three raw snapshot JSON blobs to the day's triples + this scope's
 * ranks. One place, so the renderer's fetch stays a dumb REST call.
 */
export function tripleForScope(
  raw: Partial<Record<ResolveScope, unknown>>,
  scope: ResolveScope,
): TripleForScope {
  const boards: Partial<Record<ResolveScope, BoardPick[]>> = {};
  for (const sc of ['midday', 'evening', 'allday'] as ResolveScope[]) boards[sc] = parseBoard(raw[sc]);
  const triples = findTripleBoard(boards);
  const byRank = tripleRankMap(boards[scope] ?? [], triples);
  return { triples, ranks: Array.from(byRank.keys()), byRank };
}

export interface TripleForScope {
  triples: { digits: string; set: string }[];
  /** 1-based slate ranks on THIS scope's board that carry a triple. */
  ranks: number[];
  byRank: Map<number, string>;
}

export const NO_TRIPLE: TripleForScope = { triples: [], ranks: [], byRank: new Map() };

/** The REDACTED cut's tag value: the tile burns (ring-only tease) but the
 *  container names no digits — a free-group file on a public bucket. */
export const TRIPLE_RING = 'ring';

/** Container-tag value: "5-7-3" (or "5-7-3|1-2-3" on a two-triple day). */
export function tripleTagValue(triples: { digits: string }[]): string | null {
  if (!triples.length) return null;
  return triples.map(t => t.digits).filter(d => /^\d-\d-\d$/.test(d)).join('|') || null;
}

/** Parse the tag back. Strict — n-n-n(|n-n-n), or the lone "ring"; anything else is absent. */
export function parseTripleTag(v: string | null | undefined): string[] {
  if (!v) return [];
  if (v === TRIPLE_RING) return [TRIPLE_RING];
  const parts = v.split('|');
  return parts.every(p => /^\d-\d-\d$/.test(p)) ? parts : [];
}

/** Hue of a #rrggbb colour in degrees — the test pins every FIRE hue ≤ 28°. */
export function hexHue(hex: string): number {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return NaN;
  const [r, g, b] = [m[1], m[2], m[3]].map(h => parseInt(h, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
