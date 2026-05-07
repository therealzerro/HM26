import { fetchFromSupabase } from '@/lib/supabase';
import { computeSlate } from '@/engines/zk6';
import { Scope } from '@/types/core';

export interface HitDetectionResult {
  hitsFound: number;
  scopesChecked: number;
  supplementsGenerated: number;
}

async function updateDailyIntelligenceHit(pick: any, result: any, date: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  const comboSet = pick.comboSet ?? pick.normKey ?? '';
  const isBox = result.comboset_sorted === comboSet;
  const isStraight = result.result_digits === pick.combo;
  if (!isBox && !isStraight) return;
  try {
    await fetch(
      `${url}/rest/v1/daily_intelligence?slate_date=eq.${date}&combo=eq.${encodeURIComponent(pick.combo)}`,
      {
        method: 'PATCH',
        headers: {
          'apikey': key!,
          'Authorization': 'Bearer ' + key,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({
          hit_box: isBox,
          hit_straight: isStraight,
          hit_state: result.jurisdiction,
          hit_session: result.session,
          hit_result: result.result_digits,
        }),
      },
    );
  } catch (e) {
    console.warn('[hitDetection] daily_intelligence PATCH failed:', e);
  }
}

async function recordHitInAdaptiveTracking(pick: any, result: any, snapshot: any, date: string) {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  try {
    await fetch(url + '/rest/v1/adaptive_tracking', {
      method: 'POST',
      headers: {
        'apikey': key!,
        'Authorization': 'Bearer ' + key,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates',
      },
      body: JSON.stringify({
        slate_date: date,
        scope: snapshot.scope,
        slate_hash: snapshot.hash,
        rank: pick.rank,
        combo: pick.combo,
        combo_set: pick.comboSet ?? pick.normKey,
        signal_box: pick.box ?? pick.signals?.BOX ?? 0,
        signal_pburst: pick.pburst ?? pick.signals?.PBURST ?? 0,
        signal_co: pick.co ?? pick.signals?.CO ?? 0,
        energy_score: pick.temperature ?? pick.energy ?? 0,
        mode: snapshot.mode || 'balanced',
        hit_box: result.comboset_sorted === (pick.comboSet ?? pick.normKey),
        hit_straight: result.result_digits === pick.combo,
        actual_result: result.result_digits,
        actual_set: result.comboset_sorted,
        matched_state: result.jurisdiction,
        matched_session: result.session,
        result_at: new Date().toISOString(),
      }),
    });
  } catch (e) {
    console.warn('[hitDetection] recordHit failed:', e);
  }
}

async function generateSupplementalSlate(
  scope: Scope,
  mode: 'balanced' | 'conservative' | 'aggressive',
  excludeComboSets: string[],
) {
  try {
    // computeSlate with is_supplement:true stores file_meta + _is_supplement marker itself
    const result = await computeSlate({
      scope,
      weightsKey: mode,
      excludeComboSets,
      is_supplement: true,
    });
    if (!result?.top_k_straights_json?.length) return;
    console.log('[hitDetection] Supplemental slate generated for', scope);
  } catch (e) {
    console.warn('[hitDetection] generateSupplementalSlate failed:', e);
  }
}

export async function runHitDetectionAndRefresh(
  _scope: Scope | null,
  date: string,
): Promise<HitDetectionResult> {
  console.log('[hitDetection] runHitDetectionAndRefresh called:', { scope: _scope ?? 'all', date });

  let totalHits = 0;
  let supplementsGenerated = 0;

  // Fetch the most recent non-supplemental snapshot for EACH scope explicitly.
  // Using limit=3 on a single query risks cutting off allday when 3+ midday
  // snapshots exist — fetching per-scope guarantees all 3 are always checked.
  const [middaySnaps, eveningSnaps, alldaySnaps] = await Promise.all([
    fetchFromSupabase<any[]>({ path: '/rest/v1/slate_snapshots?scope=eq.midday&deleted_at=is.null&order=updated_at_et.desc&limit=2', method: 'GET' }),
    fetchFromSupabase<any[]>({ path: '/rest/v1/slate_snapshots?scope=eq.evening&deleted_at=is.null&order=updated_at_et.desc&limit=2', method: 'GET' }),
    fetchFromSupabase<any[]>({ path: '/rest/v1/slate_snapshots?scope=eq.allday&deleted_at=is.null&order=updated_at_et.desc&limit=2', method: 'GET' }),
  ]);
  const snapshots = [
    ...(Array.isArray(middaySnaps) ? middaySnaps : []),
    ...(Array.isArray(eveningSnaps) ? eveningSnaps : []),
    ...(Array.isArray(alldaySnaps) ? alldaySnaps : []),
  ];

  console.log('[hitDetection] Snapshots per scope:', {
    midday: Array.isArray(middaySnaps) ? middaySnaps.length : 0,
    evening: Array.isArray(eveningSnaps) ? eveningSnaps.length : 0,
    allday: Array.isArray(alldaySnaps) ? alldaySnaps.length : 0,
  });

  if (snapshots.length === 0) {
    return { hitsFound: 0, scopesChecked: 0, supplementsGenerated: 0 };
  }

  const results = await fetchFromSupabase<any[]>({
    path: `/rest/v1/histories?date_et=eq.${date}&select=result_digits,comboset_sorted,jurisdiction,session`,
    method: 'GET',
  });

  if (!Array.isArray(results) || results.length === 0) {
    return { hitsFound: 0, scopesChecked: snapshots.length, supplementsGenerated: 0 };
  }

  const scopesChecked = new Set<string>();

  for (const snapshot of snapshots) {
    // Skip supplemental snapshots
    try {
      const meta = typeof snapshot.file_meta === 'string'
        ? JSON.parse(snapshot.file_meta)
        : snapshot.file_meta;
      if (meta?.is_supplement) continue;
    } catch {}

    let picks: any[] = [];
    try {
      picks = typeof snapshot.top_k_straights_json === 'string'
        ? JSON.parse(snapshot.top_k_straights_json)
        : (snapshot.top_k_straights_json ?? []);
    } catch { continue; }

    if (!Array.isArray(picks) || picks.length === 0) continue;

    scopesChecked.add(snapshot.scope ?? 'unknown');

    let hasNewHit = false;
    const updatedPicks = picks.map((pick: any) => {
      if (pick.hitType) return pick;

      const comboSet = pick.comboSet ?? pick.normKey;
      const combo = pick.combo;

      for (const result of results) {
        // Only match results whose session is compatible with the slate scope:
        // midday result → midday or allday slate
        // evening result → evening or allday slate
        const sessionMatches =
          snapshot.scope === 'allday' ||
          (snapshot.scope === 'midday' && result.session === 'midday') ||
          (snapshot.scope === 'evening' && result.session === 'evening');
        if (!sessionMatches) continue;

        const boxHit = result.comboset_sorted === comboSet;
        const straightHit = result.result_digits === combo;

        if (boxHit || straightHit) {
          hasNewHit = true;
          totalHits++;
          recordHitInAdaptiveTracking(pick, result, snapshot, date);
          updateDailyIntelligenceHit(pick, result, date);
          return {
            ...pick,
            hitType: straightHit ? 'straight' : 'box',
            hitState: result.jurisdiction,
            hitSession: result.session,
            hitDate: date,
            hitResult: result.result_digits,
          };
        }
      }
      return pick;
    });

    if (hasNewHit) {
      try {
        await fetchFromSupabase({
          path: `/rest/v1/slate_snapshots?id=eq.${snapshot.id}`,
          method: 'PATCH',
          body: { top_k_straights_json: updatedPicks },
        });
      } catch (e) {
        console.warn('[hitDetection] PATCH snapshot failed:', e);
      }

      const hitComboSets = updatedPicks
        .filter((p: any) => p.hitType)
        .map((p: any) => p.comboSet ?? p.normKey)
        .filter(Boolean);
      const allComboSets = updatedPicks
        .map((p: any) => p.comboSet ?? p.normKey)
        .filter(Boolean);
      const excludeList = [...new Set([...hitComboSets, ...allComboSets])];

      const snapshotScope = (snapshot.scope ?? 'allday') as Scope;
      const snapshotMode = (['balanced', 'conservative', 'aggressive'].includes(snapshot.mode)
        ? snapshot.mode
        : 'balanced') as 'balanced' | 'conservative' | 'aggressive';

      await generateSupplementalSlate(snapshotScope, snapshotMode, excludeList);
      supplementsGenerated++;
    }
  }

  return { hitsFound: totalHits, scopesChecked: scopesChecked.size, supplementsGenerated };
}

export async function runHitDetectionAllScopes(date: string): Promise<HitDetectionResult> {
  return runHitDetectionAndRefresh(null, date);
}
