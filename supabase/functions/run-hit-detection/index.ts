/**
 * run-hit-detection — Supabase Edge Function
 *
 * Server-side port of lib/hitDetection.ts using SUPABASE_SERVICE_ROLE_KEY so
 * writes bypass RLS/GRANT regressions. Created in response to BUG-145 where
 * a silent loss of anon write privileges on adaptive_tracking blanked every
 * hit-tracker surface for the verification window — the client-side code
 * path swallowed the 401s inside a console.warn try/catch and the bug went
 * undetected until a manual REST probe.
 *
 * Scope of writes:
 *   • slate_snapshots.top_k_straights_json — picks annotated with hitType
 *   • adaptive_tracking — primary rows PATCHed; multi-state secondaries INSERTed
 *   • daily_intelligence — primary hit row PATCHed (one row per pick)
 *
 * Idempotency:
 *   • picks already annotated with hitType are skipped (loop early-out)
 *   • adaptive_tracking PATCH targets the (slate_hash, rank, combo, mode,
 *     matched_state IS NULL) primary row; fall-through INSERT only fires
 *     when the primary row isn't found
 *
 * Supplemental slate generation: when a snapshot gets a new hit, the
 * matching comboSets are excluded and a supplemental slate is regenerated
 * via internal HTTP call to compute-slate-zk6. Same behavior as the prior
 * client-side path. Set body.skipSupplements=true to disable.
 *
 * POST body:
 *   {
 *     "date":  "YYYY-MM-DD",                       // required
 *     "dates": ["YYYY-MM-DD", ...],                // optional, processes multiple dates
 *     "scope"?: "midday"|"evening"|"allday"|null,  // null/omitted = all scopes
 *     "skipSupplements"?: boolean
 *   }
 *
 * Returns:
 *   { success, hitsFound, scopesChecked, supplementsGenerated,
 *     perDate?: { [date]: { hitsFound, scopesChecked, supplementsGenerated } },
 *     durationMs, errors }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const svcHeaders = (extra: Record<string, string> = {}) => ({
  'apikey':        SVC_KEY,
  'Authorization': 'Bearer ' + SVC_KEY,
  'Content-Type':  'application/json',
  ...extra,
});

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error(r.status + ': ' + (await r.text()).slice(0, 200));
  return r.json();
}

async function sbPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'PATCH',
    headers: svcHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('PATCH ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

async function sbPost(path: string, body: unknown, prefer = 'return=minimal'): Promise<void> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'POST',
    headers: svcHeaders({ 'Prefer': prefer }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('POST ' + r.status + ': ' + (await r.text()).slice(0, 200));
}

// ─── Hit recording ────────────────────────────────────────────────────────────

interface SnapshotRow {
  id: string;
  scope: string;
  mode: string;
  hash: string;
  slate_date: string;
  updated_at_et: string;
  top_k_straights_json: unknown;
  file_meta: unknown;
}
interface HistoryRow {
  result_digits: string;
  comboset_sorted: string;
  jurisdiction: string;
  session: string;
}

async function updateDailyIntelligenceHit(
  pick: any,
  result: HistoryRow,
  date: string,
  snap: { scope: string; mode: string },
): Promise<void> {
  const comboSet = pick.comboSet ?? pick.normKey ?? '';
  const isBox = result.comboset_sorted === comboSet;
  const isStraight = result.result_digits === pick.combo;
  if (!isBox && !isStraight) return;
  // BUG-32 fix mirrored: only `${date}` and the prior day are valid targets.
  // Late-night ET regens are tagged with the current ET date, never tomorrow's.
  const prev = new Date(date + 'T12:00:00'); prev.setDate(prev.getDate() - 1);
  const prevDayStr = prev.toISOString().split('T')[0];
  const dateFilter = `slate_date=in.(${date},${prevDayStr})`;
  const scopeFilter = snap.scope ? `&scope=eq.${encodeURIComponent(snap.scope)}` : '';
  const modeFilter = snap.mode && ['balanced', 'conservative', 'aggressive'].includes(snap.mode)
    ? `&mode=eq.${encodeURIComponent(snap.mode)}` : '';
  await sbPatch(
    `/rest/v1/daily_intelligence?${dateFilter}&combo=eq.${encodeURIComponent(pick.combo)}${scopeFilter}${modeFilter}`,
    {
      hit_box: isBox,
      hit_straight: isStraight,
      hit_state: result.jurisdiction,
      hit_session: result.session,
      hit_result: result.result_digits,
    },
  );
}

async function recordHitInAdaptiveTracking(
  pick: any,
  result: HistoryRow,
  snap: SnapshotRow,
  date: string,
): Promise<void> {
  const boxS    = pick.box    ?? pick.signals?.BOX    ?? 0;
  const pburstS = pick.pburst ?? pick.signals?.PBURST ?? 0;
  const coS     = pick.co     ?? pick.signals?.CO     ?? 0;
  const dgcS    = pick.dgc    ?? pick.signals?.DGC    ?? 0;
  const dominantSignal =
    boxS    >= pburstS && boxS    >= coS && boxS    >= dgcS ? 'BOX' :
    pburstS >= coS     && pburstS >= dgcS                   ? 'PBURST' :
    coS     >= dgcS                                         ? 'CO' : 'DGC';
  const comboSet = pick.comboSet ?? pick.normKey;
  const isBox = result.comboset_sorted === comboSet;
  const isStraight = result.result_digits === pick.combo;
  const slateHash = snap.hash ?? '';
  const mode = snap.mode || 'balanced';
  const outcomeFields = {
    hit_box: isBox || isStraight,
    hit_straight: isStraight,
    actual_result: result.result_digits,
    actual_set: result.comboset_sorted,
    matched_state: result.jurisdiction,
    matched_session: result.session,
    dominant_signal: dominantSignal,
    result_at: new Date().toISOString(),
  };

  // Look up primary row (slate_hash, rank, combo, mode, matched_state IS NULL).
  // PATCH it if found; otherwise INSERT a secondary row (multi-state match).
  const existing = await sbGet<{ id: string }[]>(
    `/rest/v1/adaptive_tracking?slate_hash=eq.${encodeURIComponent(slateHash)}` +
    `&rank=eq.${pick.rank}&combo=eq.${encodeURIComponent(pick.combo)}` +
    `&mode=eq.${encodeURIComponent(mode)}&matched_state=is.null&select=id&limit=1`,
  );
  if (Array.isArray(existing) && existing.length > 0) {
    await sbPatch(`/rest/v1/adaptive_tracking?id=eq.${existing[0].id}`, outcomeFields);
    return;
  }
  await sbPost('/rest/v1/adaptive_tracking', {
    slate_date: date,
    scope: snap.scope,
    slate_hash: slateHash,
    rank: pick.rank,
    combo: pick.combo,
    combo_set: comboSet,
    signal_box: boxS,
    signal_pburst: pburstS,
    signal_co: coS,
    signal_burst: dgcS, // legacy column name for DGC
    energy_score: pick.temperature ?? pick.energy ?? 0,
    mode,
    ...outcomeFields,
  });
}

async function generateSupplementalSlate(
  scope: string,
  mode: 'balanced' | 'conservative' | 'aggressive',
  excludeComboSets: string[],
): Promise<boolean> {
  // Internal call to compute-slate-zk6. Service-role auth so the request is
  // treated as trusted. The slate function persists its own snapshot.
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/compute-slate-zk6`, {
      method: 'POST',
      headers: svcHeaders(),
      body: JSON.stringify({
        scope,
        weightsKey: mode,
        excludeComboSets,
        is_supplement: true,
      }),
    });
    if (!res.ok) {
      console.warn('[run-hit-detection] supplement call', res.status, (await res.text()).slice(0, 200));
      return false;
    }
    const json = await res.json();
    return Array.isArray(json?.top_k_straights_json) && json.top_k_straights_json.length > 0;
  } catch (e) {
    console.warn('[run-hit-detection] supplement error:', String(e).slice(0, 200));
    return false;
  }
}

// ─── Per-date runner ──────────────────────────────────────────────────────────

interface RunResult { hitsFound: number; scopesChecked: number; supplementsGenerated: number; errors: string[] }

async function runForDate(date: string, scope: string | null, skipSupplements: boolean): Promise<RunResult> {
  const errors: string[] = [];
  let totalHits = 0;
  let supplementsGenerated = 0;

  const nextDay = new Date(date + 'T12:00:00');
  nextDay.setDate(nextDay.getDate() + 1);
  const nextDayStr = nextDay.toISOString().split('T')[0];

  const fetchScope = async (s: string) =>
    sbGet<SnapshotRow[]>(
      `/rest/v1/slate_snapshots?scope=eq.${s}&deleted_at=is.null` +
      `&updated_at_et=gte.${date}&updated_at_et=lt.${nextDayStr}T09:00:00` +
      `&order=updated_at_et.asc&limit=10`,
    );
  const resolveSnaps = async (initial: SnapshotRow[] | null, s: string): Promise<SnapshotRow[]> => {
    if (Array.isArray(initial) && initial.length > 0) return initial;
    const fallback = await sbGet<SnapshotRow[]>(
      `/rest/v1/slate_snapshots?scope=eq.${s}&deleted_at=is.null&slate_date=lte.${date}` +
      `&order=updated_at_et.desc&limit=3`,
    );
    return Array.isArray(fallback) ? fallback : [];
  };

  const skipMidday  = scope !== null && scope !== 'midday';
  const skipEvening = scope !== null && scope !== 'evening';
  const skipAllday  = scope !== null && scope !== 'allday';
  const [middaySnaps, eveningSnaps, alldaySnaps] = await Promise.all([
    skipMidday  ? Promise.resolve([] as SnapshotRow[]) : fetchScope('midday'),
    skipEvening ? Promise.resolve([] as SnapshotRow[]) : fetchScope('evening'),
    skipAllday  ? Promise.resolve([] as SnapshotRow[]) : fetchScope('allday'),
  ]);
  const [resolvedMidday, resolvedEvening, resolvedAllday] = await Promise.all([
    skipMidday  ? Promise.resolve([] as SnapshotRow[]) : resolveSnaps(middaySnaps,  'midday'),
    skipEvening ? Promise.resolve([] as SnapshotRow[]) : resolveSnaps(eveningSnaps, 'evening'),
    skipAllday  ? Promise.resolve([] as SnapshotRow[]) : resolveSnaps(alldaySnaps,  'allday'),
  ]);
  const snapshots = [...resolvedMidday, ...resolvedEvening, ...resolvedAllday];
  if (snapshots.length === 0) return { hitsFound: 0, scopesChecked: 0, supplementsGenerated: 0, errors };

  const results = await sbGet<HistoryRow[]>(
    `/rest/v1/histories?date_et=eq.${date}&select=result_digits,comboset_sorted,jurisdiction,session`,
  );
  if (!Array.isArray(results) || results.length === 0) {
    return { hitsFound: 0, scopesChecked: snapshots.length, supplementsGenerated: 0, errors };
  }

  const scopesChecked = new Set<string>();

  for (const snapshot of snapshots) {
    // Skip supplemental snapshots
    try {
      const meta = typeof snapshot.file_meta === 'string'
        ? JSON.parse(snapshot.file_meta)
        : snapshot.file_meta;
      if ((meta as any)?.is_supplement) continue;
    } catch {}

    let picks: any[] = [];
    try {
      picks = typeof snapshot.top_k_straights_json === 'string'
        ? JSON.parse(snapshot.top_k_straights_json)
        : (snapshot.top_k_straights_json ?? []) as any[];
    } catch { continue; }
    if (!Array.isArray(picks) || picks.length === 0) continue;

    scopesChecked.add(snapshot.scope ?? 'unknown');

    let hasNewHit = false;
    // Collect adaptive_tracking + daily_intelligence writes so we can settle
    // them concurrently after the loop. Each is a tracked promise so errors
    // surface (vs. the old fire-and-forget pattern that hid the BUG-145 401s).
    const atWrites: Promise<void>[] = [];
    const diWrites: Promise<void>[] = [];

    const updatedPicks = picks.map((pick: any) => {
      if (pick.hitType) return pick;
      const comboSet = pick.comboSet ?? pick.normKey;
      const combo = pick.combo;
      const matches: { result: HistoryRow; straightHit: boolean; boxHit: boolean }[] = [];
      for (const result of results) {
        const sessionMatches =
          snapshot.scope === 'allday' ||
          (snapshot.scope === 'midday'  && result.session === 'midday') ||
          (snapshot.scope === 'evening' && result.session === 'evening');
        if (!sessionMatches) continue;
        const boxHit = result.comboset_sorted === comboSet;
        const straightHit = result.result_digits === combo;
        if (boxHit || straightHit) matches.push({ result, straightHit, boxHit });
      }
      if (matches.length === 0) return pick;

      matches.sort((a, b) => (b.straightHit ? 1 : 0) - (a.straightHit ? 1 : 0));
      const primary = matches[0];
      hasNewHit = true;
      totalHits += matches.length;

      for (const m of matches) {
        atWrites.push(
          recordHitInAdaptiveTracking(pick, m.result, snapshot, date).catch(e => {
            errors.push(`AT ${snapshot.scope}/${pick.combo}/${m.result.jurisdiction}: ${String(e).slice(0, 120)}`);
          }),
        );
      }
      diWrites.push(
        updateDailyIntelligenceHit(pick, primary.result, date, { scope: snapshot.scope, mode: snapshot.mode })
          .catch(e => {
            errors.push(`DI ${snapshot.scope}/${pick.combo}: ${String(e).slice(0, 120)}`);
          }),
      );

      return {
        ...pick,
        hitType: primary.straightHit ? 'straight' : 'box',
        hitState: primary.result.jurisdiction,
        hitSession: primary.result.session,
        hitDate: date,
        hitResult: primary.result.result_digits,
      };
    });

    // Wait for adaptive_tracking + daily_intelligence writes BEFORE touching
    // the snapshot. If a downstream surface refreshes between the snapshot
    // PATCH and these writes, it could otherwise see a snapshot annotated
    // with hits but an AT/DI still empty — which is exactly the BUG-145
    // symptom we're trying to eliminate.
    await Promise.all([...atWrites, ...diWrites]);

    if (hasNewHit) {
      try {
        await sbPatch(`/rest/v1/slate_snapshots?id=eq.${snapshot.id}`, {
          top_k_straights_json: updatedPicks,
        });
      } catch (e) {
        errors.push(`snapshot PATCH ${snapshot.id}: ${String(e).slice(0, 120)}`);
      }

      if (!skipSupplements) {
        const hitComboSets = updatedPicks
          .filter((p: any) => p.hitType)
          .map((p: any) => p.comboSet ?? p.normKey)
          .filter(Boolean) as string[];
        const excludeList = [...new Set(hitComboSets)];
        const scope = (snapshot.scope ?? 'allday');
        const mode = (['balanced', 'conservative', 'aggressive'].includes(snapshot.mode)
          ? snapshot.mode : 'balanced') as 'balanced' | 'conservative' | 'aggressive';
        const ok = await generateSupplementalSlate(scope, mode, excludeList);
        if (ok) supplementsGenerated++;
      }
    }
  }

  return { hitsFound: totalHits, scopesChecked: scopesChecked.size, supplementsGenerated, errors };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const started = Date.now();
  let body: { date?: string; dates?: string[]; scope?: string | null; skipSupplements?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }

  const dateList = Array.isArray(body.dates) && body.dates.length > 0
    ? body.dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    : (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? [body.date] : []);
  if (dateList.length === 0) {
    return new Response(JSON.stringify({ error: 'date or dates[] required (YYYY-MM-DD)' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
  const scope = body.scope === 'midday' || body.scope === 'evening' || body.scope === 'allday'
    ? body.scope : null;
  const skipSupplements = body.skipSupplements === true;

  let totalHits = 0, totalScopes = 0, totalSupplements = 0;
  const perDate: Record<string, { hitsFound: number; scopesChecked: number; supplementsGenerated: number; errors: string[] }> = {};
  const allErrors: string[] = [];

  for (const d of dateList) {
    try {
      const res = await runForDate(d, scope, skipSupplements);
      totalHits        += res.hitsFound;
      totalScopes      += res.scopesChecked;
      totalSupplements += res.supplementsGenerated;
      perDate[d] = res;
      allErrors.push(...res.errors);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 200);
      perDate[d] = { hitsFound: 0, scopesChecked: 0, supplementsGenerated: 0, errors: [msg] };
      allErrors.push(`${d}: ${msg}`);
    }
  }

  return new Response(JSON.stringify({
    success: allErrors.length === 0,
    hitsFound: totalHits,
    scopesChecked: totalScopes,
    supplementsGenerated: totalSupplements,
    perDate,
    errors: allErrors.slice(0, 30),
    errorCount: allErrors.length,
    durationMs: Date.now() - started,
  }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
