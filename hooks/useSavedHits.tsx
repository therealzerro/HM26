import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchFromSupabase } from '@/lib/supabase';
import { useFollowedStates } from '@/hooks/useFollowedStates';

export interface SavedHitDetail {
  date: string;
  state: string;
  session: string;
  drawResult: string;
  type: 'box' | 'straight';
}

export interface SavedHitsResult {
  hitsByCombo: Map<string, number>;
  totalHits: number;
  totalStraight: number;
  lastHitByCombo: Map<string, SavedHitDetail>;
  isLoading: boolean;
}

const LOOKBACK_DAYS = 30;

function sinceDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - (LOOKBACK_DAYS - 1));
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function sortedDigits(s: string): string {
  return s.split('').sort().join('');
}

/**
 * Personal hit history (enhancements §4.3). Given the user's saved combos,
 * fetches the matching draws from histories over the last 30 days and
 * returns per-combo hit counts + the most-recent hit details.
 *
 * Optimization: queries `histories?comboset_sorted=in.(...)` with only the
 * unique box-sets the user has saved, so the result set is narrow (only
 * draws that could possibly match a saved combo).
 */
export function useSavedHits(combos: string[]): SavedHitsResult {
  const since = useMemo(() => sinceDate(), []);
  const { followed, toPostgrestFilter } = useFollowedStates();
  const jurisdictionFilter = toPostgrestFilter();

  // Dedupe + sanitize: only consider valid 3-digit combos.
  const uniqueCombos = useMemo(() => {
    const set = new Set<string>();
    for (const c of combos) {
      if (/^\d{3}$/.test(c)) set.add(c);
    }
    return [...set];
  }, [combos]);
  const uniqueBoxSets = useMemo(
    () => [...new Set(uniqueCombos.map(c => sortedDigits(c)))],
    [uniqueCombos],
  );

  const { data: draws = [], isLoading } = useQuery<Array<{ date_et: string; jurisdiction: string; session: string; result_digits: string; comboset_sorted: string }>>({
    queryKey: ['saved_hits_history', since, uniqueBoxSets.join(','), followed.join(',')],
    queryFn: async () => {
      if (uniqueBoxSets.length === 0) return [];
      const inClause = uniqueBoxSets.join(',');
      const rows = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?date_et=gte.${since}&comboset_sorted=in.(${inClause})${jurisdictionFilter}&select=date_et,jurisdiction,session,result_digits,comboset_sorted&order=date_et.desc,session.desc&limit=2000`,
      });
      return Array.isArray(rows) ? rows : [];
    },
    enabled: uniqueBoxSets.length > 0,
    staleTime: 10 * 60 * 1000,
  });

  return useMemo(() => {
    const hitsByCombo = new Map<string, number>();
    const lastHitByCombo = new Map<string, SavedHitDetail>();
    let totalHits = 0;
    let totalStraight = 0;
    // Group combos by their sorted set for fast match
    const combosBySet = new Map<string, string[]>();
    for (const c of uniqueCombos) {
      const set = sortedDigits(c);
      if (!combosBySet.has(set)) combosBySet.set(set, []);
      combosBySet.get(set)!.push(c);
    }
    for (const draw of draws) {
      const matches = combosBySet.get(draw.comboset_sorted ?? sortedDigits(draw.result_digits ?? ''));
      if (!matches) continue;
      for (const combo of matches) {
        hitsByCombo.set(combo, (hitsByCombo.get(combo) ?? 0) + 1);
        const isStraight = draw.result_digits === combo;
        if (isStraight) totalStraight++;
        totalHits++;
        if (!lastHitByCombo.has(combo)) {
          lastHitByCombo.set(combo, {
            date: draw.date_et,
            state: draw.jurisdiction,
            session: draw.session,
            drawResult: draw.result_digits,
            type: isStraight ? 'straight' : 'box',
          });
        }
      }
    }
    return { hitsByCombo, totalHits, totalStraight, lastHitByCombo, isLoading };
  }, [draws, uniqueCombos, isLoading]);
}
