/**
 * score.ts — hit detection for replayed or historical picks vs histories table.
 */

import { dbGet } from './data.js';
import { toComboSet } from '../../lib/engineCore.js';
import type { Scope } from './types.js';

export interface DrawResult {
  result_digits: string;
  comboset_sorted: string;
  session: string;
  jurisdiction: string;
}

export interface HitSummary {
  hitsBox: number;
  hitsStraight: number;
  totalHits: number;
  hittingCombos: string[];
  hittingJurisdictions: string[];
}

const SESSION_SCOPE: Record<string, Scope[]> = {
  midday:  ['midday',  'allday'],
  evening: ['evening', 'allday'],
  morning: ['midday',  'allday'],
  night:   ['evening', 'allday'],
};

export async function fetchDrawResults(date: string): Promise<DrawResult[]> {
  const rows = await dbGet<DrawResult[]>(
    `/histories?date_et=eq.${date}&select=result_digits,comboset_sorted,session,jurisdiction`,
  );
  return Array.isArray(rows) ? rows : [];
}

// ── Uniform-random baseline (analytic) ───────────────────────────────────────
// Closed-form expectation for a 6-pick slate sampled uniformly from 000-999
// with NO rail constraints. Yardstick for "what could a no-information picker
// have done against the same draw universe?" Lift > 1.0 means the engine beats
// random; collapse toward 1.0 is the canary for engine regression.
//
// Per result with digits abc: P(uniform random pick matches box) = perms/1000
//   singles (3 unique digits): 6/1000   — e.g., 123 has perms {123,132,213,231,312,321}
//   doubles (2 unique):        3/1000   — e.g., 112 has {112,121,211}
//   triples (1 unique):        1/1000   — only the result itself
// "Match" here means comboset equality, which is exactly how scorePicksVsResults
// counts hits (straight is a subset of box-match, and the engine caps at 1 hit
// per pick via the `break` after first match).
//
// Per-pick P(hit ≥1 of K scope-filtered results) = 1 - Π(1 - perms_i/1000)
// Per-slate P(slate has ≥1 hit) = 1 - (1 - perPickProb)^pickCount (independence
// approx; with-replacement sampling. Without-replacement diff is O(6/1000),
// negligible.)

const PERMS_BY_MULT = { singles: 6, doubles: 3, triples: 1 } as const;

function multiplicity(digits: string): 'singles' | 'doubles' | 'triples' {
  const uniq = new Set(digits.split('')).size;
  if (uniq === 1) return 'triples';
  if (uniq === 2) return 'doubles';
  return 'singles';
}

export interface BaselineSummary {
  /** K = number of draws in this scope after session filtering. */
  resultsInScope: number;
  /** P(uniform random single pick scores a box-or-straight hit ≥1 of K results). */
  perPickHitProb: number;
  /** E[total hits for a 6-pick random slate] = pickCount * perPickHitProb. */
  expectedPickHits: number;
  /** P(slate has ≥1 hit) = 1 - (1 - perPickHitProb)^pickCount. */
  slateHitProb: number;
}

export function computeBaseline(
  results: DrawResult[],
  scope: Scope,
  pickCount = 6,
): BaselineSummary {
  const scopeResults = results.filter(r => {
    const validScopes = SESSION_SCOPE[r.session] ?? [];
    return validScopes.includes(scope);
  });

  if (scopeResults.length === 0) {
    return { resultsInScope: 0, perPickHitProb: 0, expectedPickHits: 0, slateHitProb: 0 };
  }

  // Use log-space to avoid underflow when K is large (allday can have ~70 draws).
  let logMiss = 0;
  for (const r of scopeResults) {
    const digits = (r.result_digits ?? '').replace(/\D/g, '');
    if (digits.length !== 3) continue;
    const perms = PERMS_BY_MULT[multiplicity(digits)];
    logMiss += Math.log(1 - perms / 1000);
  }
  const perPickHitProb = 1 - Math.exp(logMiss);
  const expectedPickHits = pickCount * perPickHitProb;
  const slateHitProb = 1 - Math.pow(1 - perPickHitProb, pickCount);

  return { resultsInScope: scopeResults.length, perPickHitProb, expectedPickHits, slateHitProb };
}

export function scorePicksVsResults(
  picks: { combo: string; comboSet: string }[],
  results: DrawResult[],
  scope: Scope,
): HitSummary {
  const hittingCombos: string[] = [];
  const hittingJurisdictions: string[] = [];
  let hitsBox = 0;
  let hitsStraight = 0;

  // Filter results to sessions compatible with this scope
  const scopeResults = results.filter(r => {
    const validScopes = SESSION_SCOPE[r.session] ?? [];
    return validScopes.includes(scope);
  });

  for (const pick of picks) {
    const pickComboSet = pick.comboSet || toComboSet(pick.combo);
    for (const result of scopeResults) {
      const dbComboSet = result.comboset_sorted || toComboSet(result.result_digits);
      const straight = result.result_digits === pick.combo;
      const box = dbComboSet === pickComboSet;
      if (straight || box) {
        if (straight) hitsStraight++;
        else hitsBox++;
        if (!hittingCombos.includes(pick.combo)) hittingCombos.push(pick.combo);
        if (!hittingJurisdictions.includes(result.jurisdiction)) hittingJurisdictions.push(result.jurisdiction);
        break; // one result per pick
      }
    }
  }

  return {
    hitsBox,
    hitsStraight,
    totalHits: hitsBox + hitsStraight,
    hittingCombos,
    hittingJurisdictions,
  };
}
