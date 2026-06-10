/**
 * engineCore.ts — pure signal-math for ZK6/ZK30.
 * No React Native, no Expo, no @/ aliases — safe to run in Deno Edge Functions.
 */

// ─── Inlined types (no @/ imports) ───────────────────────────────────────────

export type Scope = 'midday' | 'evening' | 'allday';
export type HorizonLabel = 'H01Y' | 'H02Y' | 'H03Y' | 'H04Y' | 'H05Y' | 'H06Y' | 'H07Y' | 'H08Y' | 'H09Y' | 'H10Y';
export type WeightSet = { BOX: number; PBURST: number; CO: number; DGC: number };
export type Multiplicity = 'singles' | 'doubles' | 'triples';

// ─── Constants ────────────────────────────────────────────────────────────────

export const H_ALL: readonly HorizonLabel[] = [
  'H01Y', 'H02Y', 'H03Y', 'H04Y', 'H05Y',
  'H06Y', 'H07Y', 'H08Y', 'H09Y', 'H10Y',
];

export const HORIZON_WEIGHTS: Record<HorizonLabel, number> = {
  H01Y: 0.350,
  H02Y: 0.220,
  H03Y: 0.140,
  H04Y: 0.090,
  H05Y: 0.060,
  H06Y: 0.045,
  H07Y: 0.030,
  H08Y: 0.025,
  H09Y: 0.020,
  H10Y: 0.020,
};

export const MULTIPLICITY_PRIORS: Record<Multiplicity, number> = {
  singles:  0.00,
  doubles: -0.02,
  triples: -0.04,
};

export const DGC_REF_STD_DEV = 10;

// ─── Combo utilities ──────────────────────────────────────────────────────────

export function toComboSet(combo: string): string {
  return '{' + combo.split('').sort().join(',') + '}';
}

export function sortedPair(a: string, b: string): string {
  return a <= b ? a + b : b + a;
}

export function multiplicityOf(combo: string): Multiplicity {
  const a = combo[0], b = combo[1], c = combo[2];
  if (a === b && b === c) return 'triples';
  if (a === b || b === c || a === c) return 'doubles';
  return 'singles';
}

export function topPairOf(combo: string): string {
  const ab = sortedPair(combo[0], combo[1]);
  const bc = sortedPair(combo[1], combo[2]);
  const ac = sortedPair(combo[0], combo[2]);
  return [ab, bc, ac].sort()[0];
}

export function buildUniverse(): string[] {
  return Array.from({ length: 1000 }, (_, i) => i.toString().padStart(3, '0'));
}

/** Normalize a DB box key ("742" or "{2,4,7}") → comboSet "{2,4,7}" */
export function normalizeBoxKey(raw: string): string {
  const digits = (raw.match(/\d/g) ?? []).join('').slice(0, 3);
  return digits.length === 3 ? toComboSet(digits) : raw;
}

/** Normalize a DB pair key → sorted 2-char string "24" */
export function normalizePairKey(raw: string): string {
  const digits = (raw.match(/\d/g) ?? []).join('').slice(0, 2);
  if (digits.length !== 2) return raw;
  return digits[0] <= digits[1] ? digits : digits[1] + digits[0];
}

// ─── DGC signal ───────────────────────────────────────────────────────────────

/** Draw-gap consistency: 0 = chaotic, 1 = perfectly regular. */
export function computeDGC(dayOffsets: number[]): number {
  if (dayOffsets.length === 0) return 0;
  if (dayOffsets.length === 1) return 0.3;
  const sorted = dayOffsets.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.max(0, 1 - Math.sqrt(variance) / DGC_REF_STD_DEV);
}

// ─── WARMING signal (ENH-WARMING-2026-06-06) ────────────────────────────────
//
// Counts how many times this comboSet was drawn nationally in the preceding
// N days (default 7). Captures cross-jurisdiction short-window momentum that
// neither ds_raw (most-recent draw only) nor times_drawn (annual aggregate)
// can see.
//
// Pure: caller provides the pre-filtered history rows for the [asOfDate-N,
// asOfDate-1] window. No DB call here.
//
// Returns RAW count. Caller is responsible for max-norm across the universe
// (matching BOX's normalization pattern).

export interface WarmingHistoryRow {
  comboset_sorted: string;
  date_et: string;
}

/**
 * Count national draws of a single comboSet in the supplied history window.
 * Window is the responsibility of the caller — typically the 7 days before
 * the slate-gen date, fetched via fetchHistoryRows or equivalent.
 *
 * Performance note: for engine use the caller should bucket the entire
 * history window into a Map<comboSet, count> ONCE per slate-gen, not call
 * this 1000 times. See buildWarmingMap below.
 */
export function computeWarmingSignal(
  comboSet: string,
  windowHistoryRows: WarmingHistoryRow[],
): number {
  let count = 0;
  for (const row of windowHistoryRows) {
    if (row.comboset_sorted === comboSet) count++;
  }
  return count;
}

/**
 * Bucket a history window into a Map<comboSet, raw_count> for O(1) lookup
 * during the per-combo scoring loop. Call this once per slate-gen with the
 * full prior-N-days history rows; use the returned map for all 1000 combos.
 */
export function buildWarmingMap(
  windowHistoryRows: WarmingHistoryRow[],
): Map<string, number> {
  const m = new Map<string, number>();
  for (const row of windowHistoryRows) {
    m.set(row.comboset_sorted, (m.get(row.comboset_sorted) ?? 0) + 1);
  }
  return m;
}

// ─── STATE_STR signal (ENH-AUDIT-2026-05-19 v2, built 2026-06-10) ─────────────
//
// Per-state pattern strength — the first channel that sees WHICH jurisdictions
// a comboSet has been hitting in, rather than national aggregates. For each
// (comboSet, jurisdiction): recency-weighted per-draw hit rate within that
// jurisdiction's own draws (exponential decay, configurable half-life). The
// combo's signal is the MAX across jurisdictions — "hot in some specific
// state" — then max-normed across the universe by the caller (engine pattern).
//
// Pure: caller supplies the pre-fetched history rows (comboset, jurisdiction,
// date) for the window before the slate date. No DB calls here. Applied as a
// post-score additive channel (warming pattern): finalScore += w × normStateStr.
// Weight 0 (default) ⇒ bit-identical to the 4-channel engine.

export interface StateHistoryRow {
  comboset_sorted: string;
  jurisdiction: string | null;
  date_et: string;
}

/**
 * Build comboSet → raw state-strength from a per-jurisdiction history window.
 *
 * strength(s, j) = Σ_{draws of s in j} decay(age) / Σ_{all draws in j} decay(age)
 * raw(s)         = max_j strength(s, j)
 *
 * decay(age) = 2^(-ageDays / halfLifeDays), age measured back from asOfDate.
 * Jurisdictions with fewer than minJurisdictionDraws (undecayed row count) are
 * skipped — a 2-draw state would otherwise produce freak 0.5 rates that
 * dominate the max. One call per slate-gen; O(rows).
 */
export function buildStateStrengthMap(
  rows: StateHistoryRow[],
  asOfDate: string,
  halfLifeDays: number = 14,
  minJurisdictionDraws: number = 10,
): Map<string, number> {
  const asOfMs = new Date(asOfDate + 'T12:00:00Z').getTime();
  const totalW = new Map<string, number>();          // jurisdiction → Σ decay
  const drawCount = new Map<string, number>();       // jurisdiction → raw count
  const hitW = new Map<string, Map<string, number>>(); // comboSet → jurisdiction → Σ decay
  for (const r of rows) {
    if (!r || typeof r.comboset_sorted !== 'string' || !r.jurisdiction) continue;
    const ageDays = Math.max(0, (asOfMs - new Date(r.date_et + 'T12:00:00Z').getTime()) / 86400000);
    const w = Math.pow(2, -ageDays / Math.max(halfLifeDays, 1));
    totalW.set(r.jurisdiction, (totalW.get(r.jurisdiction) ?? 0) + w);
    drawCount.set(r.jurisdiction, (drawCount.get(r.jurisdiction) ?? 0) + 1);
    let perState = hitW.get(r.comboset_sorted);
    if (!perState) { perState = new Map(); hitW.set(r.comboset_sorted, perState); }
    perState.set(r.jurisdiction, (perState.get(r.jurisdiction) ?? 0) + w);
  }
  const out = new Map<string, number>();
  for (const [cs, perState] of hitW) {
    let best = 0;
    for (const [j, w] of perState) {
      if ((drawCount.get(j) ?? 0) < minJurisdictionDraws) continue;
      const t = totalW.get(j) ?? 0;
      if (t > 0) {
        const rate = w / t;
        if (rate > best) best = rate;
      }
    }
    if (best > 0) out.set(cs, best);
  }
  return out;
}

// ─── BOX signal ───────────────────────────────────────────────────────────────

export interface BoxSignalParts { freq: number; pressure: number; box: number }

// ENG-OBS-05 (2026-06-10): pressure scale modes. The legacy 3-branch curve was
// designed for the pre-DATA-01 ds_raw scale where values spanned 0–500+. Post
// reset (2026-06-03 re-import + daily rebuilds) ds_raw p95 ≈ 13–26 per scope,
// so the legacy curve never leaves its first branch (pressure ∈ [0, ~0.13]) and
// `pressure_threshold` is unreachable. The rescaled modes restore the channel's
// 0–1 dynamic range by calibrating to the live distribution of real combos:
//   legacy     — bit-identical to the historical curve (default)
//   p95ramp    — pressure = min(dsVal / dsP95, 1.0)
//   percentile — pressure = percentile rank of dsVal among real combos (0–1)
// Both rescaled modes are monotonic in overdue-ness; the legacy late-decay
// ("very overdue = cold") is intentionally dropped — it was never exercised on
// the new scale and the ds tail is structurally capped by daily rebuilds.
export type PressureScaleMode = 'legacy' | 'p95ramp' | 'percentile';

export interface PressureScaleCtx {
  mode: PressureScaleMode;
  /** p95 of real-combo dsVals — required for p95ramp. */
  dsP95?: number;
  /** Ascending dsVals of real combos — required for percentile. */
  sortedDs?: number[];
}

/**
 * Build the per-slate-gen pressure scale context from the dsVals of REAL
 * combos (timesDrawn > 0). Returns undefined for legacy mode so callers can
 * pass it straight through to computeBoxSignalDetailed (undefined = legacy
 * curve, bit-identical to pre-ENG-OBS-05 behavior). One call per slate-gen;
 * shared by engines/zk6.ts, compute-slate-zk6, and the backtest harness.
 */
export function buildPressureScaleCtx(
  mode: PressureScaleMode,
  realDsVals: number[],
): PressureScaleCtx | undefined {
  if (mode !== 'p95ramp' && mode !== 'percentile') return undefined;
  const sorted = realDsVals.slice().sort((a, b) => a - b);
  if (mode === 'percentile') return { mode, sortedDs: sorted };
  const p95 = sorted.length > 0
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]
    : 0;
  return { mode, dsP95: p95 };
}

/**
 * Detailed BOX score: returns freq/pressure components alongside the combined
 * box value. Engines that need per-component logging (rawFreq/rawPressure) use
 * this; callers that only need the final box value can use computeBoxSignal.
 * Defaults: 60% frequency + 40% recency pressure.
 */
export function computeBoxSignalDetailed(
  timesDrawn: number,
  dsVal: number,
  maxTimesDrawn: number,
  pressureThreshold: number,
  freqWeight: number = 0.60,
  pressureWeight: number = 0.40,
  pressureScale?: PressureScaleCtx,
): BoxSignalParts {
  if (timesDrawn === 0) return { freq: 0, pressure: 0, box: 0 };
  const freq = maxTimesDrawn > 0 ? timesDrawn / maxTimesDrawn : 0;
  let pressure: number;
  if (pressureScale?.mode === 'p95ramp') {
    // ENG-OBS-05: linear ramp calibrated to the live ds distribution.
    const p95 = pressureScale.dsP95 ?? 0;
    pressure = p95 > 0 ? Math.min(dsVal / p95, 1.0) : 0;
  } else if (pressureScale?.mode === 'percentile') {
    // ENG-OBS-05: distribution-free — pressure is the combo's overdue-ness
    // rank among real combos. Self-calibrating against any future scale drift.
    const sorted = pressureScale.sortedDs;
    pressure = sorted && sorted.length > 0 ? percentileRankOf(dsVal, sorted) / 100 : 0;
  } else {
    // ENG-PRESSURE-CLIFF-01 (2026-06-09): when pressureThreshold <= 100 the middle
    // branch is degenerate (ptSpan would be ≤ 0). Pre-fix: ptSpan=Math.max(span,1)
    // forced (dsVal-100)/1=0 at dsVal=100, a 0.99 cliff from dsVal=99 (0.495) to
    // dsVal=101 (0.995). Short-circuit to peak (1.0) when the threshold collapses.
    const ptSpan = pressureThreshold - 100;
    pressure =
      dsVal >= 100 && dsVal <= pressureThreshold
        ? (ptSpan > 0 ? Math.min((dsVal - 100) / ptSpan, 1.0) : 1.0)
        : dsVal > pressureThreshold
        ? Math.max(1.0 - (dsVal - pressureThreshold) / 200, 0.3)
        : (dsVal / 100) * 0.5;
  }
  return { freq, pressure, box: (freq * freqWeight) + (pressure * pressureWeight) };
}

/**
 * Raw BOX score (before normalization): `freqWeight * freq + pressureWeight * pressure`.
 * Thin wrapper over computeBoxSignalDetailed for callers that only need the final value.
 * pressureThreshold: draws_since value where pressure peaks (default 250).
 */
export function computeBoxSignal(
  timesDrawn: number,
  dsVal: number,
  maxTimesDrawn: number,
  pressureThreshold: number,
  freqWeight: number = 0.60,
  pressureWeight: number = 0.40,
  pressureScale?: PressureScaleCtx,
): number {
  return computeBoxSignalDetailed(timesDrawn, dsVal, maxTimesDrawn, pressureThreshold, freqWeight, pressureWeight, pressureScale).box;
}

/**
 * Blend a box combo's draws_since across all available horizons.
 * weights are decimals summing to ~1.0 (HORIZON_WEIGHTS or app_config.horizon_weights).
 */
export function blendBoxDsRaw(
  normKey: string,
  boxByHorizon: Map<string, Map<string, number>>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const h of H_ALL) {
    const ds = boxByHorizon.get(h)?.get(normKey) ?? 0;
    total += ds * (weights[h] ?? 0);
  }
  return total;
}

/**
 * Blend a box combo's times_drawn across horizons. Mirror of blendBoxDsRaw
 * but for the times_drawn column. Legacy engines used max-across-horizons
 * for box times_drawn (which always favors the widest window); this lets a
 * caller honor horizon_weights instead.
 */
export function blendBoxTimesDrawn(
  normKey: string,
  boxTimesDrawnByHorizon: Map<string, Map<string, number>>,
  weights: Record<string, number>,
): number {
  let total = 0;
  for (const h of H_ALL) {
    const td = boxTimesDrawnByHorizon.get(h)?.get(normKey) ?? 0;
    total += td * (weights[h] ?? 0);
  }
  return total;
}

/**
 * Per-horizon pair times_drawn tree: pairKey → classId → horizonLabel → times_drawn.
 * Same shape as PairDataTree but the inner value is times_drawn rather than ds_raw.
 */
export type PairTimesDrawnTree = Map<string, Map<number, Map<string, number>>>;

/**
 * Blend a pair's times_drawn for a given classId across horizons. Mirror of
 * blendPairAcrossHorizons but for times_drawn. Legacy engines used the H01Y
 * row exclusively for pair times_drawn; this lets a caller honor horizon_weights.
 */
export function blendPairTimesDrawn(
  pairKey: string, classId: number,
  pairTimesDrawnByHorizon: PairTimesDrawnTree,
  weights: Record<string, number>,
): number {
  const horizonMap = pairTimesDrawnByHorizon.get(pairKey)?.get(classId);
  if (!horizonMap) return 0;
  let total = 0;
  for (const h of H_ALL) total += (horizonMap.get(h) ?? 0) * (weights[h] ?? 0);
  return total;
}

// ─── Pair signal (PBURST / CO) ────────────────────────────────────────────────

/**
 * Raw pair signal (before normalization): 70% frequency + 30% recency pressure.
 * Used for both PBURST (classes 2/3/4) and CO (classes 5–11).
 */
export function computePairSignal(
  meta: { timesDrawn: number; drawsSince: number },
  maxPairTimesDrawn: number,
): number {
  const { timesDrawn, drawsSince } = meta;
  const freqScore = maxPairTimesDrawn > 0 ? timesDrawn / maxPairTimesDrawn : 0;
  // ENG-PRESSURE-CLIFF-02 (2026-06-09): pre-fix had a hard cliff at drawsSince=500
  // (pressure dropped from 1.0 to 0 across one integer). Replace with a 100-step
  // linear taper [500, 600] → 0 so a pair at drawsSince=550 contributes 0.5×0.30
  // rather than 0 — same shape as the BOX late-region decay (engineCore.ts:174).
  let pressureScore = 0;
  if (timesDrawn > 0) {
    if (drawsSince < 500) {
      pressureScore = Math.min(drawsSince / 182, 1.0);
    } else if (drawsSince < 600) {
      pressureScore = Math.max(1.0 - (drawsSince - 500) / 100, 0);
    }
  }
  return (freqScore * 0.70) + (pressureScore * 0.30);
}

/**
 * Pair signal lookup helper — fetches meta from pairMetaMap and delegates to
 * computePairSignal. Returns 0 when no meta is present for (pairKey, classId).
 */
export function getPairSignalFromMap(
  pairMetaMap: Map<string, Map<number, { timesDrawn: number; drawsSince: number }>>,
  pairKey: string,
  classId: number,
  maxPairTimesDrawn: number,
): number {
  const meta = pairMetaMap.get(pairKey)?.get(classId);
  if (!meta) return 0;
  return computePairSignal(meta, maxPairTimesDrawn);
}

// ─── Best-order (position-pair maximisation) ──────────────────────────────────

/** Per-horizon pair ds_raw tree: pairKey → classId → horizonLabel → ds_raw. */
export type PairDataTree = Map<string, Map<number, Map<string, number>>>;

/**
 * Blend a pair's ds_raw for a given classId across all available horizons,
 * using the canonical HORIZON_WEIGHTS constant decay. Used internally by
 * bestOrderFor to rank position-specific pair scores.
 */
export function blendPairAcrossHorizons(
  pairKey: string, classId: number, pairData: PairDataTree,
  weights: Record<string, number> = HORIZON_WEIGHTS,
): number {
  const horizonMap = pairData.get(pairKey)?.get(classId);
  if (!horizonMap) return 0;
  let total = 0;
  for (const h of H_ALL) total += (horizonMap.get(h) ?? 0) * (weights[h] ?? 0);
  return total;
}

/**
 * Per-pick "intelligence row" extras: the three columns that end up on every
 * daily_intelligence row alongside the signal scores. Both engine paths (the
 * RN-side engines/zk6.ts and the Deno-side compute-slate-zk6) call this so
 * the column write-shape stays in lockstep — any future column addition lands
 * here once and propagates to both writers.
 *
 * When the data maps / pairData aren't available (hit-orphan rows that were
 * never on a slate), the function returns the canonical "we have no scoring
 * context" defaults: draws_since=null, times_drawn=0, best_order=combo.
 */
export function intelligenceRowExtras(
  combo: string,
  comboSet: string,
  drawsSinceMap: Map<string, number> | null,
  timesDrawnMap: Map<string, number> | null,
  pairData: PairDataTree | null,
  weights: Record<string, number> = HORIZON_WEIGHTS,
): { draws_since: number | null; times_drawn: number; best_order: string } {
  if (!drawsSinceMap || !timesDrawnMap || !pairData) {
    return { draws_since: null, times_drawn: 0, best_order: combo };
  }
  return {
    draws_since: drawsSinceMap.get(comboSet) ?? null,
    times_drawn: timesDrawnMap.get(comboSet) ?? 0,
    best_order: bestOrderFor(combo, pairData, weights),
  };
}

/**
 * Returns the 6-perm arrangement of `combo` that maximises the sum of
 * position-specific pair scores (classes 2 / 3 / 4 = front / back / split).
 * Used by both engine paths to compute the per-pick `bestOrder` field.
 */
export function bestOrderFor(
  combo: string, pairData: PairDataTree,
  weights: Record<string, number> = HORIZON_WEIGHTS,
): string {
  const [a, b, c] = combo;
  const perms = [
    a + b + c, a + c + b,
    b + a + c, b + c + a,
    c + a + b, c + b + a,
  ];
  let best = combo;
  let bestScore = -1;
  for (const perm of perms) {
    const ab = sortedPair(perm[0], perm[1]);
    const bc = sortedPair(perm[1], perm[2]);
    const ac = sortedPair(perm[0], perm[2]);
    const score =
      blendPairAcrossHorizons(ab, 2, pairData, weights) +
      blendPairAcrossHorizons(bc, 3, pairData, weights) +
      blendPairAcrossHorizons(ac, 4, pairData, weights);
    if (score > bestScore) { bestScore = score; best = perm; }
  }
  return best;
}

// ─── Normalization ────────────────────────────────────────────────────────────

/** Percentile rank (0–100) of value within a sorted ascending array. */
export function percentileRankOf(value: number, sorted: number[]): number {
  if (sorted.length === 0) return 50;
  let lo = 0, hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (sorted[mid] < value) lo = mid + 1; else hi = mid;
  }
  return Math.round((lo / sorted.length) * 100);
}

/**
 * Max-norm: divide every element by the maximum.
 * When nonZeroOnly=true, the max is taken only over positive values (so zero
 * placeholders stay at 0 and the 1000-combo universe gets a proper 0-1 spread).
 */
export function maxNorm(arr: number[], nonZeroOnly = false): number[] {
  const candidates = nonZeroOnly ? arr.filter(v => v > 0) : arr;
  const max = candidates.length > 0 ? Math.max(...candidates) : 0;
  return max > 1e-12 ? arr.map(v => v / max) : arr.map(() => 0);
}

// ─── Weighted-sum indicator ───────────────────────────────────────────────────

/**
 * Final indicator score for one combo.
 *
 * ENG-AUDIT-01 (2026-06-06): consolidates three inline copies of this formula
 * (engines/zk6.ts:~1031, supabase/functions/compute-slate-zk6/index.ts:~702,
 * scripts/backtest/replay.ts:~544). The prior body of this exported helper
 * had a STRICTER synergy condition (`all 4 ≥ 0.65`) than the inline copies
 * (`≥2 of 4 ≥ 0.65`) — a source-of-truth ambiguity discovered while
 * investigating the synergy weight sweep producing identical output. Body
 * now matches the production formula bit-for-bit; the threshold + minCount
 * params let backtest sweeps override the defaults without code edits.
 *
 * multAdj: pre-looked-up value from MULTIPLICITY_PRIORS.
 * synergyThreshold / synergyMinCount: prod defaults are 0.65 / 2.
 */
export function computeWeightedScore(
  normBox: number,
  normPburst: number,
  normCo: number,
  normDgc: number,
  weights: WeightSet,
  multAdj: number,
  synergyOn: boolean,
  synergyWeight: number,
  synergyThreshold: number = 0.65,
  synergyMinCount: number = 2,
): number {
  let score =
    weights.BOX    * normBox +
    weights.PBURST * normPburst +
    weights.CO     * normCo +
    weights.DGC    * normDgc +
    multAdj;
  if (synergyOn) {
    const aboveThresh = (normBox    >= synergyThreshold ? 1 : 0)
                      + (normPburst >= synergyThreshold ? 1 : 0)
                      + (normCo     >= synergyThreshold ? 1 : 0)
                      + (normDgc    >= synergyThreshold ? 1 : 0);
    if (aboveThresh >= synergyMinCount) score *= (1 + synergyWeight);
  }
  return score;
}

// ─── Adaptive signal weights (ENH-AFL-2, 2026-05-27) ─────────────────────────

/** Rolling-AUC tuple per signal, as read from signal_auc_per_day's 30d window. */
export interface SignalAuc { BOX: number; PBURST: number; CO: number; DGC: number; }

/** Result of computeAdaptiveWeights — adjusted weights + diagnostics for telemetry. */
export interface AdaptiveWeightsResult {
  weights: WeightSet;
  diagnostics: {
    base: WeightSet;
    auc: SignalAuc;
    alpha: number;
    rawAdjusted: WeightSet;    // pre-clamp, pre-renormalize
    clampedSignals: string[];  // which signals hit a clamp bound
  };
}

const ADAPTIVE_CLAMP_MIN = 0.02;
const ADAPTIVE_CLAMP_MAX = 0.85;

/**
 * Adjust signal weights based on rolling AUC (Option β with clamp + renormalize).
 *
 *   adj[s] = base[s] × (1 + α × (auc[s] − 0.5))
 *   clamp adj[s] to [0.02, 0.85]
 *   renormalize so weights sum to 1.0
 *
 * - alpha = 0 → no change (parity)
 * - alpha = 1 → proportional adaptation (AUC 0.6 boosts weight by 10%)
 * - alpha > 0 with AUC < 0.5 → signal weight reduces (anti-predictive suppression)
 * - Clamp keeps any single signal between 2% and 85% of total weight (prevents
 *   collapse onto one signal AND prevents complete zero-out of a weak signal).
 *
 * Pure function. Engine paths (zk6 + edge fn) and the backtest harness all
 * call this with their own base weights + rolling AUC.
 */
export function computeAdaptiveWeights(
  base: WeightSet,
  auc: SignalAuc,
  alpha: number,
): AdaptiveWeightsResult {
  const signals: (keyof WeightSet)[] = ['BOX', 'PBURST', 'CO', 'DGC'];
  const rawAdjusted: WeightSet = { BOX: 0, PBURST: 0, CO: 0, DGC: 0 };
  for (const s of signals) {
    rawAdjusted[s] = Math.max(0, base[s] * (1 + alpha * (auc[s] - 0.5)));
  }

  // First renormalize so we have a sum-to-1 starting point for clamping.
  let total = rawAdjusted.BOX + rawAdjusted.PBURST + rawAdjusted.CO + rawAdjusted.DGC;
  if (total <= 0) {
    // All signals zeroed (alpha too aggressive vs AUCs all < 0.5) — fall back to base.
    return {
      weights: { ...base },
      diagnostics: { base, auc, alpha, rawAdjusted, clampedSignals: ['__fallback__'] },
    };
  }
  const normed: WeightSet = {
    BOX: rawAdjusted.BOX / total,
    PBURST: rawAdjusted.PBURST / total,
    CO: rawAdjusted.CO / total,
    DGC: rawAdjusted.DGC / total,
  };

  // Clamp each signal to [MIN, MAX]. Track which signals hit a bound.
  const clampedSignals: string[] = [];
  const clamped: WeightSet = { BOX: 0, PBURST: 0, CO: 0, DGC: 0 };
  for (const s of signals) {
    if (normed[s] < ADAPTIVE_CLAMP_MIN) {
      clamped[s] = ADAPTIVE_CLAMP_MIN;
      clampedSignals.push(`${s}:min`);
    } else if (normed[s] > ADAPTIVE_CLAMP_MAX) {
      clamped[s] = ADAPTIVE_CLAMP_MAX;
      clampedSignals.push(`${s}:max`);
    } else {
      clamped[s] = normed[s];
    }
  }

  // Renormalize the clamped weights so they sum to 1.0 again.
  total = clamped.BOX + clamped.PBURST + clamped.CO + clamped.DGC;
  const final: WeightSet = {
    BOX: clamped.BOX / total,
    PBURST: clamped.PBURST / total,
    CO: clamped.CO / total,
    DGC: clamped.DGC / total,
  };

  return {
    weights: final,
    diagnostics: { base, auc, alpha, rawAdjusted, clampedSignals },
  };
}

// ─── Calibrated pick probability (CALIB-01, 2026-06-10) ──────────────────────
//
// Applies the logistic coefficients stored in app_config.pick_prob_calibration
// to one pick's features. Decision-layer ONLY — pick selection never reads
// this. Fit + validation: scripts/calibration/fit_pick_probability.ts
// (walk-forward gate: test Brier ≤ trivial per-scope-rate baseline).

export interface PickProbCalibration {
  /** Feature order: [evening, midday, box, pburst, co, dgc]. */
  b: number;
  w: number[];
  mean: number[];
  std: number[];
  base_rates: Record<string, number>;
}

/**
 * Calibrated P(this pick scores ≥1 box match in its scope window).
 * Falls back to the scope base rate when the pick is off-model
 * (doubles/triples — absent from the training pool) or calib is malformed.
 */
export function computeCalibratedPickProb(
  calib: PickProbCalibration,
  scope: Scope,
  signals: { BOX: number; PBURST: number; CO: number; DGC: number },
  mult: Multiplicity = 'singles',
): number {
  const fallback = calib.base_rates?.[scope] ?? 0;
  if (mult !== 'singles') return fallback;
  if (!Array.isArray(calib.w) || calib.w.length !== 6) return fallback;
  const x = [
    scope === 'evening' ? 1 : 0,
    scope === 'midday' ? 1 : 0,
    signals.BOX, signals.PBURST, signals.CO, signals.DGC,
  ];
  let z = calib.b;
  for (let j = 0; j < 6; j++) {
    const std = calib.std[j] || 1;
    z += calib.w[j] * ((x[j] - (calib.mean[j] ?? 0)) / std);
  }
  return 1 / (1 + Math.exp(-z));
}

// ─── Slate hash ───────────────────────────────────────────────────────────────

/**
 * Deterministic djb2 unsigned hash for slate dedup.
 * Inputs: scope + weightsKey + ordered pick list + horizons-present map.
 * Date.now() is intentionally excluded — same inputs must always produce the same hash.
 */
export function computeSlateHash(
  scope: string,
  weightsKey: string,
  topCombos: string[],
  horizonsPresent: Record<string, unknown>,
): string {
  const hashInput = JSON.stringify({ scope, mode: weightsKey, topCombos, horizons: horizonsPresent });
  return (hashInput.split('').reduce((acc, ch) => {
    return (((acc << 5) + acc) ^ ch.charCodeAt(0)) >>> 0;
  }, 5381) >>> 0).toString(16).toUpperCase();
}

// ─── Confidence score ─────────────────────────────────────────────────────────

/**
 * 0.0–1.0 confidence estimate.
 * 60% from horizon coverage (# horizons loaded / 10), 40% from box density (rows / 1000 combos).
 */
export function computeConfidenceScore(horizonsLoadedCount: number, boxRowCount: number): number {
  const boxDensity = boxRowCount > 0 ? Math.min(boxRowCount / 1000, 1.0) : 0;
  return Math.min((horizonsLoadedCount / 10) * 0.60 + boxDensity * 0.40, 1.0);
}
