/**
 * report.ts — Mode A: analyze existing slate_snapshots without re-running the engine.
 */

import { dbGet } from './data.js';
import { toComboSet } from '../../lib/engineCore.js';
import { scorePicksVsResults, fetchDrawResults, computeBaseline, computeRailMatchedBaseline, classifyMultiplicity } from './score.js';
import type { ReportRow, Scope } from './types.js';

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];

function dateRange(days: number): string[] {
  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

function isSupplemental(row: any): boolean {
  try {
    const hp = typeof row.horizons_present_json === 'string'
      ? JSON.parse(row.horizons_present_json)
      : row.horizons_present_json;
    if (hp?._is_supplement === true || hp?._is_supplement === 'true') return true;
  } catch {}
  return false;
}

function parseSource(row: any): string {
  try {
    const hp = typeof row.horizons_present_json === 'string'
      ? JSON.parse(row.horizons_present_json)
      : row.horizons_present_json;
    return String(hp?._source ?? 'unknown');
  } catch {
    return 'unknown';
  }
}

function parsePicks(row: any): { combo: string; comboSet: string }[] {
  try {
    const arr = typeof row.top_k_straights_json === 'string'
      ? JSON.parse(row.top_k_straights_json)
      : row.top_k_straights_json;
    if (!Array.isArray(arr)) return [];
    return arr.map((p: any) => ({
      combo:    typeof p === 'string' ? p : String(p?.combo ?? ''),
      comboSet: typeof p === 'string' ? toComboSet(p) : String(p?.comboSet ?? p?.normKey ?? toComboSet(p?.combo ?? '')),
    })).filter(p => /^\d{3}$/.test(p.combo));
  } catch {
    return [];
  }
}

export async function runReport(days: number): Promise<ReportRow[]> {
  const dates = dateRange(days);
  const startDate = dates[0];

  console.log(`[report] Fetching snapshots from ${startDate} to today (${days} days)…`);

  const rows: ReportRow[] = [];

  for (const scope of SCOPES) {
    const snapshots = await dbGet<any[]>(
      `/slate_snapshots?select=id,scope,slate_date,mode,top_k_straights_json,horizons_present_json` +
      `&scope=eq.${scope}&mode=neq.zk30&deleted_at=is.null` +
      `&slate_date=gte.${startDate}&order=slate_date.asc&limit=500`,
    );

    if (!Array.isArray(snapshots)) continue;
    const primary = snapshots.filter(s => !isSupplemental(s));
    console.log(`[report] ${scope}: ${primary.length} primary snapshots`);

    for (const snap of primary) {
      const date: string = snap.slate_date;
      if (!date) continue;

      const picks = parsePicks(snap);
      if (picks.length === 0) continue;

      const results = await fetchDrawResults(date);
      const hit = scorePicksVsResults(picks, results, scope as Scope);
      const baseline = computeBaseline(results, scope as Scope, picks.length || 6);
      // Rail-matched baseline uses the engine's actual multiplicity mix.
      const pickMix = { singles: 0, doubles: 0, triples: 0 };
      for (const p of picks) pickMix[classifyMultiplicity(p.combo)]++;
      const railBaseline = computeRailMatchedBaseline(results, scope as Scope, pickMix);
      const source = parseSource(snap);

      rows.push({
        date,
        scope,
        mode: snap.mode ?? 'unknown',
        snapshotId: snap.id,
        pickCount: picks.length,
        hitsBox: hit.hitsBox,
        hitsStraight: hit.hitsStraight,
        totalHits: hit.totalHits,
        source,
        baselinePerPickHitProb: baseline.perPickHitProb,
        baselineExpectedPickHits: baseline.expectedPickHits,
        baselineSlateHitProb: baseline.slateHitProb,
        resultsInScope: baseline.resultsInScope,
        railMatchedExpectedPickHits: railBaseline.expectedPickHits,
        railMatchedSlateHitProb: railBaseline.slateHitProb,
        picksSingles: pickMix.singles,
        picksDoubles: pickMix.doubles,
        picksTriples: pickMix.triples,
      });
    }
  }

  rows.sort((a, b) => a.date.localeCompare(b.date) || a.scope.localeCompare(b.scope));
  return rows;
}
