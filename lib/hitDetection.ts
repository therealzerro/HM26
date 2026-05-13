import { fetchFromSupabase } from '@/lib/supabase';
import { computeSlate } from '@/engines/zk6';
import { Scope } from '@/types/core';

export interface HitDetectionResult {
  hitsFound: number;
  scopesChecked: number;
  supplementsGenerated: number;
}

async function updateDailyIntelligenceHit(
  pick: any,
  result: any,
  date: string,
  snapshot: { scope?: string; mode?: string },
) {
  const comboSet = pick.comboSet ?? pick.normKey ?? '';
  const isBox = result.comboset_sorted === comboSet;
  const isStraight = result.result_digits === pick.combo;
  if (!isBox && !isStraight) return;
  // Include prev day: catches slates tagged with yesterday's date.
  // next-day inclusion removed — engines tag late-night regens with the current ET
  // date (not tomorrow's), so nextDayStr was causing today's daily_intelligence rows
  // to receive hit flags from yesterday's draws (BUG-32).
  const prev = new Date(date + 'T12:00:00'); prev.setDate(prev.getDate() - 1);
  const prevDayStr = prev.toISOString().split('T')[0];
  const dateFilter = `slate_date=in.(${date},${prevDayStr})`;
  // BUG-132: scope + mode filters keep the PATCH narrowed to the slate context
  // that actually produced this hit. Without them, a midday-draw → allday-slate
  // hit also flips hit_box=true on every other slate's row with the same combo
  // (midday rows, evening rows, every mode), inflating downstream counts and
  // forcing every display surface to scope-gate after the fact.
  const scopeFilter = snapshot.scope ? `&scope=eq.${encodeURIComponent(snapshot.scope)}` : '';
  const modeFilter = snapshot.mode && ['balanced', 'conservative', 'aggressive'].includes(snapshot.mode)
    ? `&mode=eq.${encodeURIComponent(snapshot.mode)}`
    : '';
  try {
    await fetchFromSupabase({
      path: `/rest/v1/daily_intelligence?${dateFilter}&combo=eq.${encodeURIComponent(pick.combo)}${scopeFilter}${modeFilter}`,
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: {
        hit_box: isBox,
        hit_straight: isStraight,
        hit_state: result.jurisdiction,
        hit_session: result.session,
        hit_result: result.result_digits,
      },
    });
  } catch (e) {
    console.warn('[hitDetection] daily_intelligence PATCH failed:', e);
  }
}

async function recordHitInAdaptiveTracking(pick: any, result: any, snapshot: any, date: string) {
  const boxS = pick.box ?? pick.signals?.BOX ?? 0;
  const pburstS = pick.pburst ?? pick.signals?.PBURST ?? 0;
  const coS = pick.co ?? pick.signals?.CO ?? 0;
  const dominantSignal = boxS > pburstS && boxS > coS ? 'BOX' : pburstS > coS ? 'PBURST' : 'CO';
  try {
    await fetchFromSupabase({
      path: '/rest/v1/adaptive_tracking',
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates' },
      body: {
        slate_date: date,
        scope: snapshot.scope,
        slate_hash: snapshot.hash,
        rank: pick.rank,
        combo: pick.combo,
        combo_set: pick.comboSet ?? pick.normKey,
        signal_box: boxS,
        signal_pburst: pburstS,
        signal_co: coS,
        energy_score: pick.temperature ?? pick.energy ?? 0,
        mode: snapshot.mode || 'balanced',
        hit_box: result.comboset_sorted === (pick.comboSet ?? pick.normKey),
        hit_straight: result.result_digits === pick.combo,
        actual_result: result.result_digits,
        actual_set: result.comboset_sorted,
        matched_state: result.jurisdiction,
        matched_session: result.session,
        dominant_signal: dominantSignal,
        result_at: new Date().toISOString(),
      },
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
  scope: Scope | null,
  date: string,
): Promise<HitDetectionResult> {
  console.log('[hitDetection] runHitDetectionAndRefresh called:', { scope: scope ?? 'all', date });

  let totalHits = 0;
  let supplementsGenerated = 0;

  // Fetch snapshots for the target date (and the next day's window to catch late-night ET slates).
  // Using date-range filtering ensures we find the correct primary slate even when
  // multiple supplemental slates exist for the same scope.
  const nextDay = new Date(date + 'T12:00:00');
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];

  const fetchScope = async (s: string) =>
    fetchFromSupabase<any[]>({ path: `/rest/v1/slate_snapshots?scope=eq.${s}&deleted_at=is.null&updated_at_et=gte.${date}&updated_at_et=lt.${nextDayStr}T09:00:00&order=updated_at_et.asc&limit=10`, method: 'GET' });
  const skipMidday  = scope !== null && scope !== 'midday';
  const skipEvening = scope !== null && scope !== 'evening';
  const skipAllday  = scope !== null && scope !== 'allday';
  const [middaySnaps, eveningSnaps, alldaySnaps] = await Promise.all([
    skipMidday  ? Promise.resolve([]) : fetchScope('midday'),
    skipEvening ? Promise.resolve([]) : fetchScope('evening'),
    skipAllday  ? Promise.resolve([]) : fetchScope('allday'),
  ]);
  // If no date-range snapshots found for a scope, fall back to the most recent snapshot for that scope.
  const resolveSnaps = async (dateSnaps: any[] | null, scope: string): Promise<any[]> => {
    if (Array.isArray(dateSnaps) && dateSnaps.length > 0) return dateSnaps;
    const fallback = await fetchFromSupabase<any[]>({ path: `/rest/v1/slate_snapshots?scope=eq.${scope}&deleted_at=is.null&slate_date=lte.${date}&order=updated_at_et.desc&limit=3`, method: 'GET' });
    return Array.isArray(fallback) ? fallback : [];
  };
  const [resolvedMidday, resolvedEvening, resolvedAllday] = await Promise.all([
    resolveSnaps(middaySnaps, 'midday'),
    resolveSnaps(eveningSnaps, 'evening'),
    resolveSnaps(alldaySnaps, 'allday'),
  ]);

  const snapshots = [...resolvedMidday, ...resolvedEvening, ...resolvedAllday];

  console.log('[hitDetection] Snapshots per scope:', {
    midday: resolvedMidday.length,
    evening: resolvedEvening.length,
    allday: resolvedAllday.length,
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

      // Collect ALL matches across jurisdictions (a box-set can draw
      // simultaneously in multiple states — WI 619 + ME,NH,VT 196 both
      // match pick 916's box-set {1,6,9} on the same allday slate). The
      // FIRST match becomes the canonical hit annotation on the snapshot
      // pick + daily_intelligence row (those tables have 1-row-per-pick
      // structure). Additional matches are logged to adaptive_tracking
      // only, which has no per-pick uniqueness constraint — that's where
      // the Verified Track Record reads them from to show all states a
      // pick hit in.
      const matches: any[] = [];
      for (const result of results) {
        // Scope/session match rule (corrected 2026-05-13):
        //   midday slate  → ONLY midday draws count as hits
        //   evening slate → ONLY evening draws count as hits
        //   allday slate  → ANY session counts (midday, evening, morning, night)
        //
        // The "any session" semantics for allday is the user's convention:
        // allday means "any draw all day long," not "midday + evening only."
        // Morning/night draws in jurisdictions like TX, TN, GA legitimately
        // count toward allday hits. The cross-scope filter remains for
        // midday and evening slates (a TX morning draw must not stamp a
        // midday-slate pick — different temporal events).
        const sessionMatches =
          snapshot.scope === 'allday' ||
          (snapshot.scope === 'midday' && result.session === 'midday') ||
          (snapshot.scope === 'evening' && result.session === 'evening');
        if (!sessionMatches) continue;

        const boxHit = result.comboset_sorted === comboSet;
        const straightHit = result.result_digits === combo;
        if (boxHit || straightHit) {
          matches.push({ result, straightHit, boxHit });
        }
      }

      if (matches.length === 0) return pick;

      // Sort matches: prefer straight over box (more impressive hit type
      // becomes the canonical annotation).
      matches.sort((a, b) => (b.straightHit ? 1 : 0) - (a.straightHit ? 1 : 0));
      const primary = matches[0];

      hasNewHit = true;
      totalHits += matches.length;
      // Log EVERY jurisdiction match into adaptive_tracking
      for (const m of matches) {
        recordHitInAdaptiveTracking(pick, m.result, snapshot, date);
      }
      // daily_intelligence only gets the primary (one row per pick)
      updateDailyIntelligenceHit(pick, primary.result, date, { scope: snapshot.scope, mode: snapshot.mode });
      return {
        ...pick,
        hitType: primary.straightHit ? 'straight' : 'box',
        hitState: primary.result.jurisdiction,
        hitSession: primary.result.session,
        hitDate: date,
        hitResult: primary.result.result_digits,
      };
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
      const excludeList = [...new Set(hitComboSets)];

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

// Multi-date wrapper used by the ledger import flow.
// Returns the legacy { totalHits, scopeResults, ran } shape expected by useDataIngestion.
export async function runHitDetectionForDates(
  dates: string[],
): Promise<{ totalHits: number; scopeResults: Record<string, number>; ran: boolean }> {
  const scopeResults: Record<string, number> = {};
  let totalHits = 0;
  try {
    for (const date of dates) {
      const res = await runHitDetectionAndRefresh(null, date);
      totalHits += res.hitsFound;
      scopeResults[date] = res.hitsFound;
    }
    return { totalHits, scopeResults, ran: true };
  } catch (e) {
    console.warn('[hitDetection] runHitDetectionForDates failed:', e);
    return { totalHits: 0, scopeResults: {}, ran: false };
  }
}
