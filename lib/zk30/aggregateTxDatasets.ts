// lib/zk30/aggregateTxDatasets.ts
//
// Pure aggregator for ZK30 (ARCH-06 step 3b). No I/O, no Supabase. Reads a
// list of TX draws and an anchor date, emits the row arrays for datasets_box
// (class_id=1) and datasets_pair (class_id 2..11) for a single horizon.
//
// Why this is the first true histories→datasets aggregator in the codebase:
// ZK6's rebuild-* scripts and the rebuild-datasets-zk6 Edge Function are
// UPDATE-only — they recompute ds_raw against existing rows that originated
// from operator CSV imports. ZK30 has no CSV; histories_tx is the only source.
//
// Conventions locked by ARCH-06 sign-off (2026-05-25):
//
// • Never-drew rows are emitted in full (not skipped), with:
//     times_drawn=0, last_seen=NULL, ds_raw=horizonDays, draws_since=windowDraws.
//   Honest "never hit in this window" semantic, no sentinels.
// • `expected` column left NULL — verified that engines/zk6.ts,
//   compute-slate-zk6, and engineCore never read it.
// • `ds_normalized` left 0 — engine recomputes from raw signals at slate-gen.
// • Anchor-day inclusion: window is (anchor − horizonDays, anchor] —
//   right-closed, left-open, matching the ZK6 rebuild script convention.
// • Pair class 11 dedups its contributions per draw (a triple draw 1-1-1
//   counts the {1,1} pair once, not three times).
//
// Universe sizes per horizon:
//   • box        — 220 rows (sorted 3-digit combos: C(12,3))
//   • pair 2/3/4 — 100 rows each (positional, literal 'AB' 00..99)
//   • pair 5-11  — 55 rows each (sorted, C(11,2))
//   Total pair rows = 100×3 + 55×7 = 685
//   Grand total per horizon = 220 + 685 = 905

import { sortedPair, multiplicityOf } from '@/lib/engineCore';
import type { ZK30Horizon } from '@/constants/zk30';

// ─── Inputs / outputs ────────────────────────────────────────────────────────

export type TxDraw = {
  date_et: string;       // YYYY-MM-DD
  session: string;       // Morning|Day|Evening|Night (preserved but not used here)
  result_digits: string; // 'DDD'
  fireball: string | null;
};

export type BoxRow = {
  class_id: 1;
  scope: 'allday';
  horizon_label: ZK30Horizon;
  jurisdiction: 'TX';
  key: string;            // sorted 3-digit, e.g. '127'
  key_box: string;        // same as key
  times_drawn: number;
  last_seen: string | null;
  ds_raw: number;
  draws_since: number;
  ds_normalized: number;  // 0; engine recomputes
  expected: number | null; // NULL per sign-off
};

export type PairRow = {
  class_id: number;       // 2..11
  scope: 'allday';
  horizon_label: ZK30Horizon;
  jurisdiction: 'TX';
  key: string;            // 2-char (positional for 2/3/4, sorted for 5..11)
  key_pair: string;       // same as key
  times_drawn: number;
  last_seen: string | null;
  ds_raw: number;
  draws_since: number;
  ds_normalized: number;
};

export type AggregateResult = {
  horizon: ZK30Horizon;
  anchor: string;
  windowStart: string;    // exclusive lower bound
  windowDraws: number;    // count of TX draws in window (denominator for never-drew rows)
  boxRows: BoxRow[];
  pairRows: PairRow[];
};

// ─── Constants ────────────────────────────────────────────────────────────────

const HORIZON_DAYS: Record<ZK30Horizon, number> = {
  H01Y: 365,
  H02Y: 730,
};

// ─── Date / window helpers ───────────────────────────────────────────────────

function isoDateMinusDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(anchor: string, dateStr: string): number {
  const a = new Date(anchor + 'T00:00:00Z').getTime();
  const d = new Date(dateStr + 'T00:00:00Z').getTime();
  return Math.max(0, Math.round((a - d) / 86_400_000));
}

// ─── Universe generators ─────────────────────────────────────────────────────

// 220 sorted 3-digit combos (a<=b<=c).
function* iterBoxUniverse(): Generator<string> {
  for (let a = 0; a <= 9; a++) {
    for (let b = a; b <= 9; b++) {
      for (let c = b; c <= 9; c++) {
        yield `${a}${b}${c}`;
      }
    }
  }
}

// 55 sorted pairs (a<=b).
function* iterSortedPairUniverse(): Generator<string> {
  for (let a = 0; a <= 9; a++) {
    for (let b = a; b <= 9; b++) {
      yield `${a}${b}`;
    }
  }
}

// 100 positional pairs (a,b each 0..9 — order matters).
function* iterPositionalPairUniverse(): Generator<string> {
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      yield `${a}${b}`;
    }
  }
}

// ─── Combo helpers ───────────────────────────────────────────────────────────

function sortDigits3(combo: string): string {
  return combo.split('').sort().join('');
}

// All distinct unordered pairs from the box (sorted) representation of a 3-digit combo.
// Returns 1..3 unique sortedPair() strings depending on multiplicity:
//   singles 123 → ['12','23','13']
//   doubles 112 → ['11','12']
//   triples 111 → ['11']
function distinctBoxPairs(combo: string): string[] {
  const a = combo[0], b = combo[1], c = combo[2];
  const set = new Set<string>();
  set.add(sortedPair(a, b));
  set.add(sortedPair(b, c));
  set.add(sortedPair(a, c));
  return Array.from(set);
}

// ─── Aggregation accumulators ────────────────────────────────────────────────

type Accum = { times_drawn: number; last_seen: string | null };

function bumpAccum(map: Map<string, Accum>, key: string, dateEt: string): void {
  const cur = map.get(key);
  if (!cur) {
    map.set(key, { times_drawn: 1, last_seen: dateEt });
    return;
  }
  cur.times_drawn += 1;
  if (cur.last_seen === null || dateEt > cur.last_seen) cur.last_seen = dateEt;
}

// Count of draws AFTER `lastSeen` (exclusive) within the window. For a draws
// list already sorted by date_et, this is "how many draws are dated > last_seen
// AND <= anchor AND > windowStart". When last_seen is null (never drew), the
// answer is the total window-draw count.
function drawsSinceCount(
  draws: TxDraw[],
  lastSeen: string | null,
  windowDraws: number,
): number {
  if (lastSeen === null) return windowDraws;
  let n = 0;
  for (const d of draws) {
    if (d.date_et > lastSeen) n++;
  }
  return n;
}

// ─── Public API ──────────────────────────────────────────────────────────────

export function aggregateForHorizon(
  draws: TxDraw[],
  anchor: string,
  horizon: ZK30Horizon,
): AggregateResult {
  const horizonDays = HORIZON_DAYS[horizon];
  const windowStart = isoDateMinusDays(anchor, horizonDays); // exclusive lower bound

  // Filter to (windowStart, anchor].
  const inWindow = draws.filter(d => d.date_et > windowStart && d.date_et <= anchor);
  const windowDraws = inWindow.length;

  // ── BOX accumulator: keyed by sorted 3-digit ──────────────────────────────
  const box = new Map<string, Accum>();
  for (const d of inWindow) {
    if (!/^\d{3}$/.test(d.result_digits)) continue;
    bumpAccum(box, sortDigits3(d.result_digits), d.date_et);
  }

  // ── PAIR accumulators: one map per class_id 2..11 ─────────────────────────
  const pair: Record<number, Map<string, Accum>> = {
    2: new Map(), 3: new Map(), 4: new Map(),
    5: new Map(), 6: new Map(), 7: new Map(),
    8: new Map(), 9: new Map(), 10: new Map(),
    11: new Map(),
  };

  for (const d of inWindow) {
    if (!/^\d{3}$/.test(d.result_digits)) continue;
    const [a, b, c] = d.result_digits;
    const sorted = sortDigits3(d.result_digits);
    const [s1, s2, s3] = sorted;

    // Positional pairs (classes 2/3/4): literal AB, BC, AC from draw order.
    bumpAccum(pair[2], a + b, d.date_et);
    bumpAccum(pair[3], b + c, d.date_et);
    bumpAccum(pair[4], a + c, d.date_et);

    // Box pairs from positional source (classes 5/6/7): sort each positional pair.
    bumpAccum(pair[5], sortedPair(a, b), d.date_et);
    bumpAccum(pair[6], sortedPair(b, c), d.date_et);
    bumpAccum(pair[7], sortedPair(a, c), d.date_et);

    // Box pairs from sorted draw (classes 8/9/10): take front/back/split of sorted.
    bumpAccum(pair[8],  s1 + s2, d.date_et);
    bumpAccum(pair[9],  s2 + s3, d.date_et);
    bumpAccum(pair[10], s1 + s3, d.date_et);

    // Class 11: all distinct unordered pairs from the box (dedup per draw).
    for (const p of distinctBoxPairs(d.result_digits)) {
      bumpAccum(pair[11], p, d.date_et);
    }

    // Sanity: multiplicityOf is imported solely so the helper stays in the
    // intended-use graph (and validates the engineCore import path). The
    // distinctBoxPairs call already encodes the multiplicity dedup.
    void multiplicityOf(d.result_digits);
  }

  // ── Materialize the full universe (write zero-rows for never-drew) ────────
  const boxRows: BoxRow[] = [];
  for (const key of iterBoxUniverse()) {
    const acc = box.get(key);
    const td = acc?.times_drawn ?? 0;
    const ls = acc?.last_seen ?? null;
    const dsRaw = ls === null ? horizonDays : daysBetween(anchor, ls);
    boxRows.push({
      class_id: 1,
      scope: 'allday',
      horizon_label: horizon,
      jurisdiction: 'TX',
      key,
      key_box: key,
      times_drawn: td,
      last_seen: ls,
      ds_raw: dsRaw,
      draws_since: drawsSinceCount(inWindow, ls, windowDraws),
      ds_normalized: 0,
      expected: null,
    });
  }

  const pairRows: PairRow[] = [];

  const emitPair = (classId: number, universe: Iterable<string>): void => {
    const acc = pair[classId];
    for (const key of universe) {
      const a = acc.get(key);
      const td = a?.times_drawn ?? 0;
      const ls = a?.last_seen ?? null;
      const dsRaw = ls === null ? horizonDays : daysBetween(anchor, ls);
      pairRows.push({
        class_id: classId,
        scope: 'allday',
        horizon_label: horizon,
        jurisdiction: 'TX',
        key,
        key_pair: key,
        times_drawn: td,
        last_seen: ls,
        ds_raw: dsRaw,
        draws_since: drawsSinceCount(inWindow, ls, windowDraws),
        ds_normalized: 0,
      });
    }
  };

  // Classes 2/3/4: positional 100-row universe.
  for (const cid of [2, 3, 4]) emitPair(cid, iterPositionalPairUniverse());
  // Classes 5..11: sorted 55-row universe.
  for (const cid of [5, 6, 7, 8, 9, 10, 11]) emitPair(cid, iterSortedPairUniverse());

  return {
    horizon,
    anchor,
    windowStart,
    windowDraws,
    boxRows,
    pairRows,
  };
}
