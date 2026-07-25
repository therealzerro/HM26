// lib/analytics/expectedMath.ts — ENH-ANALYTICS-01
//
// Per-draw appearance probabilities for a 3-digit game (1000 equally likely
// outcomes). These are the descriptive baselines the Footprint / Pattern
// Stats surfaces compare observed counts against. Nothing here is predictive
// and nothing here feeds pick selection.

export type Multiplicity = 'singles' | 'doubles' | 'triples';

/** "417" → "{1,4,7}", "424" → "{2,4,4}" — matches histories.comboset_sorted. */
export function comboToSet(combo: string): string {
  return `{${combo.split('').sort().join(',')}}`;
}

/** "{2,4,4}" → "244" (digits in ascending order, no braces/commas). */
export function setToDigits(comboSet: string): string {
  return comboSet.replace(/[{},]/g, '');
}

export function multiplicityOf(digits: string): Multiplicity {
  const [a, b, c] = digits.split('').sort();
  if (a === b && b === c) return 'triples';
  if (a === b || b === c) return 'doubles';
  return 'singles';
}

/**
 * P(a draw box-matches the set) per draw:
 *   singles → 6 orderings / 1000, doubles → 3 / 1000, triples → 1 / 1000.
 */
export function boxProbability(mult: Multiplicity): number {
  return mult === 'singles' ? 0.006 : mult === 'doubles' ? 0.003 : 0.001;
}

/** P(a draw equals one specific ordering) = 1/1000. */
export const STRAIGHT_P = 0.001;

/**
 * P(both digits of an unordered pair appear among the 3 drawn digits):
 *   distinct {a,b}: 1000 − 2·9³ + 8³ = 54 → 0.054 (inclusion–exclusion)
 *   repeated {a,a}: digit a at least twice = C(3,2)·9 + 1 = 28 → 0.028
 */
export function anyPairProbability(a: string, b: string): number {
  return a === b ? 0.028 : 0.054;
}

/** P(two specific digits at two fixed positions) = 10/1000. */
export const POSITIONAL_PAIR_P = 0.01;

/** All 220 unordered 3-digit sets, in comboset_sorted format. */
export function allComboSets(): string[] {
  const out: string[] = [];
  for (let a = 0; a <= 9; a++)
    for (let b = a; b <= 9; b++)
      for (let c = b; c <= 9; c++) out.push(`{${a},${b},${c}}`);
  return out;
}

/** All 55 unordered digit pairs ("00".."99", a ≤ b). */
export function allDigitPairs(): string[] {
  const out: string[] = [];
  for (let a = 0; a <= 9; a++)
    for (let b = a; b <= 9; b++) out.push(`${a}${b}`);
  return out;
}
