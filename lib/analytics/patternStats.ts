// lib/analytics/patternStats.ts — ENH-ANALYTICS-01
//
// Pure aggregations over a fetched draw window (see drawWindow.ts):
//   • computeFootprint  — one set's appearances across jurisdictions
//   • computeComboStats — all 220 sets, observed vs expected + gap
//   • computePairStats  — digit pairs (any-position or positional)
//
// "drawsSince" counts individual jurisdiction-draws after the most recent
// appearance. Rows within one (date, session) block have no defined order —
// draws happen near-simultaneously across jurisdictions — so the count is
// exact across blocks and approximate within the newest block. Descriptive
// only; the overdue/reversion thesis tested flat (COHORT-01) and nothing
// here feeds selection.

// Type-only import keeps this module free of runtime deps (drawWindow pulls
// in the RN supabase client) — everything here stays pure and Node-testable.
import type { DrawRow, SessionFilter } from './drawWindow';
import {
  allComboSets,
  allDigitPairs,
  anyPairProbability,
  boxProbability,
  comboToSet,
  multiplicityOf,
  POSITIONAL_PAIR_P,
  setToDigits,
  type Multiplicity,
} from './expectedMath';

/** Session filter shared by all aggregations. */
export function filterRows(rows: DrawRow[], session: SessionFilter): DrawRow[] {
  if (session === 'all') return rows;
  return rows.filter(r => r.session === session);
}

export interface FootprintAppearance {
  date_et: string;
  session: 'midday' | 'evening';
  jurisdiction: string | null;
  result_digits: string;
}

export interface FootprintResult {
  comboSet: string;
  digits: string;
  mult: Multiplicity;
  totalDraws: number;
  observed: number;
  expected: number;
  lastSeen: string | null;
  drawsSince: number;
  /** Drawn orderings, most frequent first — e.g. [{ order: '146', count: 3 }] */
  orderBreakdown: { order: string; count: number }[];
  byJurisdiction: { jurisdiction: string; count: number; lastDate: string }[];
  /** Newest first. */
  appearances: FootprintAppearance[];
}

export function computeFootprint(
  rows: DrawRow[],
  comboInput: string,
  session: SessionFilter,
): FootprintResult | null {
  if (!/^\d{3}$/.test(comboInput)) return null;
  const comboSet = comboToSet(comboInput);
  const scoped = filterRows(rows, session); // rows arrive date desc, id desc

  const appearances: FootprintAppearance[] = [];
  const orders = new Map<string, number>();
  const byJx = new Map<string, { count: number; lastDate: string }>();
  let firstIdx = -1;

  scoped.forEach((r, i) => {
    if (r.comboset_sorted !== comboSet) return;
    if (firstIdx === -1) firstIdx = i;
    appearances.push({
      date_et: r.date_et,
      session: r.session,
      jurisdiction: r.jurisdiction,
      result_digits: r.result_digits,
    });
    orders.set(r.result_digits, (orders.get(r.result_digits) ?? 0) + 1);
    const jx = r.jurisdiction ?? '—';
    const prev = byJx.get(jx);
    if (prev) prev.count += 1;
    else byJx.set(jx, { count: 1, lastDate: r.date_et });
  });

  const mult = multiplicityOf(comboInput);
  return {
    comboSet,
    digits: setToDigits(comboSet),
    mult,
    totalDraws: scoped.length,
    observed: appearances.length,
    expected: scoped.length * boxProbability(mult),
    lastSeen: appearances[0]?.date_et ?? null,
    drawsSince: firstIdx === -1 ? scoped.length : firstIdx,
    orderBreakdown: [...orders.entries()]
      .map(([order, count]) => ({ order, count }))
      .sort((a, b) => b.count - a.count || a.order.localeCompare(b.order)),
    byJurisdiction: [...byJx.entries()]
      .map(([jurisdiction, v]) => ({ jurisdiction, ...v }))
      .sort((a, b) => b.count - a.count || a.jurisdiction.localeCompare(b.jurisdiction)),
    appearances,
  };
}

export interface StatRow {
  key: string;      // display key: "146" for sets, "4•6" for pairs
  observed: number;
  expected: number;
  ratio: number;    // observed / expected (0 when expected is 0)
  lastSeen: string | null;
  drawsSince: number;
  mult?: Multiplicity;
}

export type StatSort = 'observed' | 'ratio' | 'gap';

function sortStatRows(rows: StatRow[], sort: StatSort): StatRow[] {
  const by: Record<StatSort, (a: StatRow, b: StatRow) => number> = {
    observed: (a, b) => b.observed - a.observed,
    ratio: (a, b) => b.ratio - a.ratio,
    gap: (a, b) => b.drawsSince - a.drawsSince,
  };
  // Deterministic tiebreak on key so re-renders never reshuffle equal rows.
  return rows.sort((a, b) => by[sort](a, b) || a.key.localeCompare(b.key));
}

export interface ComboStatsResult {
  totalDraws: number;
  rows: StatRow[];
}

export function computeComboStats(
  rows: DrawRow[],
  session: SessionFilter,
  multFilter: 'all' | Multiplicity,
  sort: StatSort,
): ComboStatsResult {
  const scoped = filterRows(rows, session);
  const seen = new Map<string, { count: number; firstIdx: number; lastDate: string }>();
  scoped.forEach((r, i) => {
    const prev = seen.get(r.comboset_sorted);
    if (prev) prev.count += 1;
    else seen.set(r.comboset_sorted, { count: 1, firstIdx: i, lastDate: r.date_et });
  });

  const out: StatRow[] = [];
  for (const set of allComboSets()) {
    const digits = setToDigits(set);
    const mult = multiplicityOf(digits);
    if (multFilter !== 'all' && mult !== multFilter) continue;
    const s = seen.get(set);
    const expected = scoped.length * boxProbability(mult);
    out.push({
      key: digits,
      mult,
      observed: s?.count ?? 0,
      expected,
      ratio: expected > 0 ? (s?.count ?? 0) / expected : 0,
      lastSeen: s?.lastDate ?? null,
      drawsSince: s ? s.firstIdx : scoped.length,
    });
  }
  return { totalDraws: scoped.length, rows: sortStatRows(out, sort) };
}

export type PairMode = 'any' | 'front' | 'split' | 'back';

export const PAIR_MODE_LABELS: Record<PairMode, string> = {
  any: 'Any position',
  front: 'Front (1st+2nd)',
  split: 'Split (1st+3rd)',
  back: 'Back (2nd+3rd)',
};

/** Pairs present in one draw for the given mode (deduped for 'any'). */
function pairsInDraw(digits: string, mode: PairMode): string[] {
  const [p1, p2, p3] = digits.split('');
  if (mode === 'front') return [p1 + p2];
  if (mode === 'split') return [p1 + p3];
  if (mode === 'back') return [p2 + p3];
  // any: unordered presence — {a,b} counts once per draw regardless of how
  // many digit slots realize it (matches the 54/28-per-1000 baselines).
  const set = new Set<string>();
  for (const [a, b] of [[p1, p2], [p1, p3], [p2, p3]]) {
    set.add(a <= b ? a + b : b + a);
  }
  return [...set];
}

export function computePairStats(
  rows: DrawRow[],
  session: SessionFilter,
  mode: PairMode,
  sort: StatSort,
): ComboStatsResult {
  const scoped = filterRows(rows, session);
  const seen = new Map<string, { count: number; firstIdx: number; lastDate: string }>();
  scoped.forEach((r, i) => {
    for (const pair of pairsInDraw(r.result_digits, mode)) {
      const prev = seen.get(pair);
      if (prev) prev.count += 1;
      else seen.set(pair, { count: 1, firstIdx: i, lastDate: r.date_et });
    }
  });

  // 'any' → 55 unordered pairs; positional → all 100 ordered digit pairs.
  const universe: string[] =
    mode === 'any'
      ? allDigitPairs()
      : Array.from({ length: 100 }, (_, i) => `${Math.floor(i / 10)}${i % 10}`);

  const out: StatRow[] = universe.map(pair => {
    const s = seen.get(pair);
    const p = mode === 'any' ? anyPairProbability(pair[0], pair[1]) : POSITIONAL_PAIR_P;
    const expected = scoped.length * p;
    return {
      key: `${pair[0]}•${pair[1]}`,
      observed: s?.count ?? 0,
      expected,
      ratio: expected > 0 ? (s?.count ?? 0) / expected : 0,
      lastSeen: s?.lastDate ?? null,
      drawsSince: s ? s.firstIdx : scoped.length,
    };
  });
  return { totalDraws: scoped.length, rows: sortStatRows(out, sort) };
}
