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

// ─── BOX signal ───────────────────────────────────────────────────────────────

/**
 * Raw BOX score (before normalization): 60% frequency + 40% recency pressure.
 * pressureThreshold: draws_since value where pressure peaks (default 250).
 */
export function computeBoxSignal(
  timesDrawn: number,
  dsVal: number,
  maxTimesDrawn: number,
  pressureThreshold: number,
): number {
  if (timesDrawn === 0) return 0;
  const freqScore = maxTimesDrawn > 0 ? timesDrawn / maxTimesDrawn : 0;
  const ptSpan = Math.max(pressureThreshold - 100, 1);
  const pressureScore =
    dsVal >= 100 && dsVal <= pressureThreshold
      ? Math.min((dsVal - 100) / ptSpan, 1.0)
      : dsVal > pressureThreshold
      ? Math.max(1.0 - (dsVal - pressureThreshold) / 200, 0.3)
      : (dsVal / 100) * 0.5;
  return (freqScore * 0.60) + (pressureScore * 0.40);
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
  const pressureScore = (timesDrawn > 0 && drawsSince < 500)
    ? Math.min(drawsSince / 182, 1.0)
    : 0;
  return (freqScore * 0.70) + (pressureScore * 0.30);
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
 * multAdj: pre-looked-up value from MULTIPLICITY_PRIORS.
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
): number {
  let score =
    weights.BOX    * normBox +
    weights.PBURST * normPburst +
    weights.CO     * normCo +
    weights.DGC    * normDgc +
    multAdj;
  if (synergyOn && normBox >= 0.65 && normPburst >= 0.65 && normCo >= 0.65 && normDgc >= 0.65) {
    score *= (1 + synergyWeight);
  }
  return score;
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
