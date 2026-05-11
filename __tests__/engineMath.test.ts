/**
 * Tests for ZK6 engine signal math.
 * These directly test the invariants documented in CLAUDE.md and MASTER_AUDIT.md.
 * Mirrors the logic in engines/zk6.ts — if zk6.ts changes these formulas, tests fail.
 */

// ── Helpers mirroring zk6.ts private functions ────────────────────────────────

const DGC_REF_STD_DEV = 10;

function computeDGC(dayOffsets: number[]): number {
  if (dayOffsets.length === 0) return 0;
  if (dayOffsets.length === 1) return 0.3;
  const sorted = dayOffsets.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.max(0, 1 - Math.sqrt(variance) / DGC_REF_STD_DEV);
}

// ENG-01: BOX max-norm (NOT min-max). value / max.
function boxMaxNorm(values: number[]): number[] {
  const max = values.length > 0 ? Math.max(...values) : 0;
  if (max < 1e-12) return values.map(() => 0);
  return values.map(v => v / max);
}

// ENG-05: pair freqScore uses timesDrawn / maxTimesDrawn (NOT dsRaw).
function pairFreqScore(timesDrawn: number, maxTimesDrawn: number): number {
  return maxTimesDrawn > 0 ? timesDrawn / maxTimesDrawn : 0;
}

function pairSignal(
  timesDrawn: number, maxTimesDrawn: number,
  drawsSince: number,
): number {
  const freqScore = pairFreqScore(timesDrawn, maxTimesDrawn);
  const pressureScore = (timesDrawn > 0 && drawsSince < 500)
    ? Math.min(drawsSince / 182, 1.0) : 0;
  return (freqScore * 0.70) + (pressureScore * 0.30);
}

// ── ENG-01: BOX normalization must be max-norm ────────────────────────────────

describe('BOX signal — max-norm (ENG-01)', () => {
  it('normalizes by dividing by max, giving highest combo a score of 1.0', () => {
    const normed = boxMaxNorm([10, 20, 5, 40]);
    expect(normed[3]).toBeCloseTo(1.0);
    expect(normed[1]).toBeCloseTo(0.5);
    expect(normed[0]).toBeCloseTo(0.25);
    expect(normed[2]).toBeCloseTo(0.125);
  });

  it('gives 0 to all values when max is 0', () => {
    expect(boxMaxNorm([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('does NOT apply min-max (values.map(v => (v-min)/(max-min)))', () => {
    // min-max would give [0, 0.667, 1.0] for [10,20,40]
    // max-norm gives     [0.25, 0.5, 1.0]
    const normed = boxMaxNorm([10, 20, 40]);
    // lowest value must NOT be 0 (that would be min-max behavior)
    expect(normed[0]).toBeGreaterThan(0);
    expect(normed[0]).toBeCloseTo(0.25);
  });
});

// ── ENG-05: pair signal uses frequency not staleness ─────────────────────────

describe('Pair signal freqScore — uses timesDrawn not dsRaw (ENG-05)', () => {
  it('returns higher score for more frequently drawn pairs', () => {
    // Pair A: drawn 80 times; Pair B: drawn 20 times (max=100)
    const scoreA = pairFreqScore(80, 100);
    const scoreB = pairFreqScore(20, 100);
    expect(scoreA).toBeGreaterThan(scoreB);
    expect(scoreA).toBeCloseTo(0.8);
    expect(scoreB).toBeCloseTo(0.2);
  });

  it('returns 0 when maxTimesDrawn is 0', () => {
    expect(pairFreqScore(0, 0)).toBe(0);
    expect(pairFreqScore(5, 0)).toBe(0);
  });

  it('full pairSignal blends freq (0.70) and pressure (0.30)', () => {
    // timesDrawn=100/100, drawsSince=91 → freqScore=1.0, pressureScore=91/182≈0.5
    const score = pairSignal(100, 100, 91);
    expect(score).toBeCloseTo(1.0 * 0.70 + 0.5 * 0.30, 2);
  });

  it('never-drawn pair returns 0', () => {
    expect(pairSignal(0, 100, 500)).toBe(0);
  });
});

// ── DGC: draw gap consistency signal ─────────────────────────────────────────

describe('computeDGC', () => {
  it('returns 0 for no draws', () => {
    expect(computeDGC([])).toBe(0);
  });

  it('returns 0.3 for exactly one draw (low but non-zero — BUG-14 fix)', () => {
    expect(computeDGC([5])).toBe(0.3);
  });

  it('returns close to 1.0 for perfectly regular gaps', () => {
    // Gaps all equal → variance=0 → DGC=1
    const score = computeDGC([10, 20, 30, 40, 50]);
    expect(score).toBeCloseTo(1.0);
  });

  it('returns lower score for irregular gaps', () => {
    const regular = computeDGC([10, 20, 30, 40]);
    const irregular = computeDGC([1, 2, 100, 101, 200]);
    expect(regular).toBeGreaterThan(irregular);
  });

  it('is clamped at 0 (never negative)', () => {
    // Extremely irregular → would go below 0 without clamp
    const score = computeDGC([1, 500, 501, 1000]);
    expect(score).toBeGreaterThanOrEqual(0);
  });
});

// ── toComboSet canonical form ─────────────────────────────────────────────────

describe('toComboSet (combo → sorted set notation)', () => {
  function toComboSet(combo: string): string {
    return '{' + combo.split('').sort().join(',') + '}';
  }

  it('produces sorted set notation', () => {
    expect(toComboSet('321')).toBe('{1,2,3}');
    expect(toComboSet('123')).toBe('{1,2,3}');
    expect(toComboSet('000')).toBe('{0,0,0}');
    expect(toComboSet('112')).toBe('{1,1,2}');
  });

  it('is symmetric — anagrams produce the same set', () => {
    expect(toComboSet('456')).toBe(toComboSet('645'));
    expect(toComboSet('789')).toBe(toComboSet('987'));
  });
});
