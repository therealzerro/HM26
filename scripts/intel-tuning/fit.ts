/**
 * fit.ts — AUC-based weight derivation from daily_intelligence hit history.
 *
 * For each of the 4 signals (BOX, PBURST, CO, DGC) we compute the Area Under the
 * ROC curve — the probability that a random hit pick has a higher signal value
 * than a random miss pick. AUC = 0.5 means the signal is no better than random;
 * AUC = 1.0 means the signal perfectly separates hits from misses.
 *
 * Proposed weight = max(0, AUC - 0.5), then normalized to sum to 1. Signals with
 * no predictive power get weight = 0 automatically.
 */

import { dbGet } from '../backtest/data.js';

const SIGNAL_KEYS = ['signal_box', 'signal_pburst', 'signal_co', 'signal_dgc'] as const;
type SignalKey = typeof SIGNAL_KEYS[number];

export interface DiRow {
  signal_box: number | null;
  signal_pburst: number | null;
  signal_co: number | null;
  signal_dgc: number | null;
  hit_box: boolean | null;
  hit_straight: boolean | null;
  slate_date: string;
  scope: string;
  rank: number | null;
}

export interface FitResult {
  n: number;
  hitCount: number;
  missCount: number;
  byScope: Record<string, { n: number; hits: number; rate: number }>;
  auc: Record<SignalKey, number>;
  weights: { BOX: number; PBURST: number; CO: number; DGC: number };
  dateRange: { start: string; end: string };
}

// Mann–Whitney U → AUC. O(n log n).
function computeAUC(samples: { score: number; positive: boolean }[]): number {
  samples.sort((a, b) => a.score - b.score);
  let nPos = 0;
  let nNeg = 0;
  let posRankSum = 0;

  // Handle ties: assign average rank to equal-score groups.
  let i = 0;
  while (i < samples.length) {
    let j = i;
    while (j < samples.length && samples[j].score === samples[i].score) j++;
    const avgRank = (i + j + 1) / 2; // average of (i+1) … j (1-indexed)
    for (let k = i; k < j; k++) {
      if (samples[k].positive) { nPos++; posRankSum += avgRank; } else nNeg++;
    }
    i = j;
  }
  if (nPos === 0 || nNeg === 0) return 0.5;
  return (posRankSum - (nPos * (nPos + 1)) / 2) / (nPos * nNeg);
}

export async function loadIntelligence(opts: { startDate: string; endDate: string }): Promise<DiRow[]> {
  // Pull all evaluated picks (hit_box or hit_straight has been set non-null) in the window.
  // mode=neq.zk30 keeps zk6 picks only — ZK30 uses different signal semantics.
  // Two queries combined: hit=true rows + hit=false rows (faster than one-shot).
  const path =
    `/daily_intelligence?` +
    `select=signal_box,signal_pburst,signal_co,signal_dgc,hit_box,hit_straight,slate_date,scope,rank` +
    `&slate_date=gte.${opts.startDate}&slate_date=lte.${opts.endDate}` +
    `&mode=eq.balanced` +
    `&order=slate_date.asc&limit=20000`;
  const rows = await dbGet<DiRow[]>(path);
  if (!Array.isArray(rows)) return [];
  // Keep only rows where the pick has been evaluated (avoid pre-hit-detection rows).
  return rows.filter(r => r.hit_box !== null || r.hit_straight !== null);
}

export function fitWeights(rows: DiRow[]): FitResult {
  if (rows.length === 0) {
    return {
      n: 0, hitCount: 0, missCount: 0, byScope: {},
      auc: { signal_box: 0.5, signal_pburst: 0.5, signal_co: 0.5, signal_dgc: 0.5 },
      weights: { BOX: 0.25, PBURST: 0.25, CO: 0.25, DGC: 0.25 },
      dateRange: { start: '?', end: '?' },
    };
  }

  const dates = rows.map(r => r.slate_date).sort();
  const dateRange = { start: dates[0], end: dates[dates.length - 1] };

  const auc: Record<SignalKey, number> = {
    signal_box: 0.5, signal_pburst: 0.5, signal_co: 0.5, signal_dgc: 0.5,
  };

  let hitCount = 0;
  let missCount = 0;
  for (const r of rows) {
    if (r.hit_box || r.hit_straight) hitCount++;
    else missCount++;
  }

  for (const key of SIGNAL_KEYS) {
    const samples = rows
      .filter(r => typeof r[key] === 'number')
      .map(r => ({ score: r[key] as number, positive: !!(r.hit_box || r.hit_straight) }));
    auc[key] = computeAUC(samples);
  }

  // Shift baseline so signals with AUC ≤ 0.5 contribute zero weight.
  const lift: Record<SignalKey, number> = {
    signal_box:    Math.max(0, auc.signal_box    - 0.5),
    signal_pburst: Math.max(0, auc.signal_pburst - 0.5),
    signal_co:     Math.max(0, auc.signal_co     - 0.5),
    signal_dgc:    Math.max(0, auc.signal_dgc    - 0.5),
  };
  const liftSum = lift.signal_box + lift.signal_pburst + lift.signal_co + lift.signal_dgc;
  const weights = liftSum > 0
    ? {
        BOX:    lift.signal_box    / liftSum,
        PBURST: lift.signal_pburst / liftSum,
        CO:     lift.signal_co     / liftSum,
        DGC:    lift.signal_dgc    / liftSum,
      }
    // Fallback to current defaults if every signal AUC ≤ 0.5 (catastrophic — would mean
    // no signal beats random — refuse to propose).
    : { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 };

  // Per-scope sanity stats so we can spot scope-specific signal degradation.
  const byScope: Record<string, { n: number; hits: number; rate: number }> = {};
  for (const r of rows) {
    const sc = r.scope ?? '?';
    if (!byScope[sc]) byScope[sc] = { n: 0, hits: 0, rate: 0 };
    byScope[sc].n++;
    if (r.hit_box || r.hit_straight) byScope[sc].hits++;
  }
  for (const sc of Object.keys(byScope)) {
    byScope[sc].rate = byScope[sc].n > 0 ? byScope[sc].hits / byScope[sc].n : 0;
  }

  return { n: rows.length, hitCount, missCount, byScope, auc, weights, dateRange };
}
