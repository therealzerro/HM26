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
  /**
   * Per-pick hit flag, indexed in the same order as the input `picks` array.
   * `hitsByPick[i] === true` means pick at index i (rank i+1) scored ≥1 hit
   * against any scope-filtered result. Used by the replay summary's per-rank
   * monotonicity section to detect rank-mis-ordering (e.g. evening rank-1 <
   * rank-2 from the 2026-05-18 dashboard cross-cut).
   */
  hitsByPick: boolean[];
}

const SESSION_SCOPE: Record<string, Scope[]> = {
  midday:  ['midday',  'allday'],
  evening: ['evening', 'allday'],
  morning: ['midday',  'allday'],
  night:   ['evening', 'allday'],
};

/** Results whose session is compatible with the given scope — the exact
 *  filter scorePicksVsResults applies internally. Exported for the
 *  BESTORDER-SWEEP conversion counter (cli.ts) so session semantics stay
 *  single-sourced. */
export function filterResultsForScope(results: DrawResult[], scope: Scope): DrawResult[] {
  return results.filter(r => (SESSION_SCOPE[r.session] ?? []).includes(scope));
}

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

// ── Rail-matched baseline ────────────────────────────────────────────────────
// Same idea, but the random "picker" is constrained to the same multiplicity
// mix as the engine's actual slate. Honors the engine's rail caps so the
// comparison isn't unfairly penalised when the engine is forced to allocate
// picks to doubles/triples (which have lower box-hit prob than singles).
//
// Within-class universe sizes:
//   singles strings: 10*9*8 = 720, each comboset has 6 permutations
//   doubles strings: 270,           each comboset has 3 permutations
//   triples strings: 10,            each comboset has 1 permutation
// A class-C pick can only box-match a class-C result (different multiplicity
// → different comboset structure → no overlap possible).
//
// Per-pick hit probs (1 = hit ≥1 of the same-class K results):
//   random-singles pick: 1 - (1 - 1/120)^K_singles_in_scope   (6/720 = 1/120)
//   random-doubles pick: 1 - (1 - 1/90 )^K_doubles_in_scope   (3/270 = 1/90)
//   random-triples pick: 1 - (1 - 1/10 )^K_triples_in_scope   (1/10  = 1/10)

export interface RailMix {
  singles: number;
  doubles: number;
  triples: number;
}

export interface RailMatchedBaseline {
  resultsInScope: number;
  /** K_C — count of class-C results in scope, used to derive per-pick hit prob per rail. */
  kByRail: RailMix;
  /** Per-pick hit probability if the pick is a uniform random member of class C. */
  perPickHitProbByRail: RailMix;
  /** Σ over picks of P(hit) — expected pick-hits for a rail-matched random slate. */
  expectedPickHits: number;
  /** P(slate has ≥1 hit) given the engine's rail mix. */
  slateHitProb: number;
}

export function computeRailMatchedBaseline(
  results: DrawResult[],
  scope: Scope,
  pickMix: RailMix,
): RailMatchedBaseline {
  const scopeResults = results.filter(r => {
    const validScopes = SESSION_SCOPE[r.session] ?? [];
    return validScopes.includes(scope);
  });

  const k: RailMix = { singles: 0, doubles: 0, triples: 0 };
  for (const r of scopeResults) {
    const digits = (r.result_digits ?? '').replace(/\D/g, '');
    if (digits.length !== 3) continue;
    k[multiplicity(digits)]++;
  }

  const probSingles = 1 - Math.pow(1 - 1 / 120, k.singles);
  const probDoubles = 1 - Math.pow(1 - 1 / 90,  k.doubles);
  const probTriples = 1 - Math.pow(1 - 1 / 10,  k.triples);

  const expectedPickHits =
    pickMix.singles * probSingles +
    pickMix.doubles * probDoubles +
    pickMix.triples * probTriples;

  const slateHitProb = 1 - (
    Math.pow(1 - probSingles, pickMix.singles) *
    Math.pow(1 - probDoubles, pickMix.doubles) *
    Math.pow(1 - probTriples, pickMix.triples)
  );

  return {
    resultsInScope: scopeResults.length,
    kByRail: k,
    perPickHitProbByRail: { singles: probSingles, doubles: probDoubles, triples: probTriples },
    expectedPickHits,
    slateHitProb,
  };
}

/** Convenience: multiplicity classifier for callers that have raw combo strings. */
export function classifyMultiplicity(combo: string): 'singles' | 'doubles' | 'triples' {
  return multiplicity(combo);
}

export function scorePicksVsResults(
  picks: { combo: string; comboSet: string; bestOrder?: string }[],
  results: DrawResult[],
  scope: Scope,
): HitSummary {
  const hittingCombos: string[] = [];
  const hittingJurisdictions: string[] = [];
  const hitsByPick: boolean[] = new Array(picks.length).fill(false);
  let hitsBox = 0;
  let hitsStraight = 0;

  // Filter results to sessions compatible with this scope
  const scopeResults = results.filter(r => {
    const validScopes = SESSION_SCOPE[r.session] ?? [];
    return validScopes.includes(scope);
  });

  for (let i = 0; i < picks.length; i++) {
    const pick = picks[i];
    const pickComboSet = pick.comboSet || toComboSet(pick.combo);
    // BUG-155 parity: production hit-detection matches result_digits against
    // bestOrder (position-pair maximised arrangement), NOT the universe-
    // enumeration `combo`. Fall through to `combo` only when bestOrder is
    // absent (legacy callers / pre-extension data).
    const pickStraightKey = pick.bestOrder ?? pick.combo;
    for (const result of scopeResults) {
      const dbComboSet = result.comboset_sorted || toComboSet(result.result_digits);
      const straight = result.result_digits === pickStraightKey;
      const box = dbComboSet === pickComboSet;
      if (straight || box) {
        if (straight) hitsStraight++;
        else hitsBox++;
        if (!hittingCombos.includes(pick.combo)) hittingCombos.push(pick.combo);
        if (!hittingJurisdictions.includes(result.jurisdiction)) hittingJurisdictions.push(result.jurisdiction);
        hitsByPick[i] = true;
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
    hitsByPick,
  };
}
