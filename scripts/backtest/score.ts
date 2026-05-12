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
