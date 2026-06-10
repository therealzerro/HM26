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
  // BUG-155 (2026-05-23): straight match must compare against bestOrder
  // (the user-facing recommended straight), not combo (engine enumeration
  // index 000..999 from buildUniverse). When bestOrder differs from combo
  // and the draw happens to equal the enumeration index but not the
  // recommended order, the prior code stamped 'straight' even though the
  // user playing bestOrder only got a box. Fallback to combo for legacy
  // picks that pre-date bestOrder being persisted.
  const straightCombo = pick.bestOrder ?? pick.combo;
  const isBox = result.comboset_sorted === comboSet;
  const isStraight = result.result_digits === straightCombo;
  if (!isBox && !isStraight) return;
  // BUG-162 (2026-06-10): strict same-date pairing. The prior filter
  // `slate_date=in.(${date}, ${date-1})` stamped YESTERDAY's intelligence rows
  // with TODAY's draws whenever the same combo appeared on consecutive slates
  // (~40% day-over-day overlap) — inflating recorded pick hit rates by ~30%
  // (audited 5/13–6/9: 164 stamped vs 116 verifiable; every stamped-only "hit"
  // traced to a slate_date+1 draw). BUG-147 already established slate_date ==
  // draw date as the canonical pairing for snapshot scoring; this PATCH now
  // honors the same rule.
  const dateFilter = `slate_date=eq.${date}`;
  const scopeFilter = snap.scope ? `&scope=eq.${encodeURIComponent(snap.scope)}` : '';
  // SCRUB-02 (2026-06-09): only 'balanced' is written to daily_intelligence.
  const modeFilter = snap.mode === 'balanced'
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
  // BUG-155 (2026-05-23): see updateDailyIntelligenceHit — compare against
  // bestOrder, not the engine enumeration index.
  const straightCombo = pick.bestOrder ?? pick.combo;
  const isBox = result.comboset_sorted === comboSet;
  const isStraight = result.result_digits === straightCombo;
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

  // BUG-150 (2026-05-18): idempotent + race-resilient PATCH-or-INSERT.
  // Prior logic looked up only `matched_state IS NULL` and either PATCHed
  // (first match) or INSERTed (subsequent matches). When the per-pick
  // atWrites loop fired in parallel (Promise.all in runForDate), two writes
  // for the same pick both saw `matched_state IS NULL` simultaneously, both
  // PATCHed the same primary row — last-write-wins lost one state, leaving
  // only one AT row for picks whose digits drew in 2+ states. Track record +
  // explore grid + slate compact view all read AT and silently missed the
  // dropped state (e.g., 5/17 combo 826 hit DC and DE midday; only DC landed).
  // Two-layer fix: (1) check for a matching state-specific row first so
  // re-runs are no-ops on already-recorded matches; (2) caller in runForDate
  // now awaits AT writes serially per-pick so PATCH happens before the next
  // IS-NULL lookup.
  // Layer 1: idempotency — exact state+session already recorded → no-op.
  const dup = await sbGet<{ id: string }[]>(
    `/rest/v1/adaptive_tracking?slate_hash=eq.${encodeURIComponent(slateHash)}` +
    `&rank=eq.${pick.rank}&combo=eq.${encodeURIComponent(pick.combo)}` +
    `&mode=eq.${encodeURIComponent(mode)}` +
    `&matched_state=eq.${encodeURIComponent(result.jurisdiction)}` +
    `&matched_session=eq.${encodeURIComponent(result.session)}` +
    `&select=id&limit=1`,
  );
  if (Array.isArray(dup) && dup.length > 0) return;

  // PATCH the un-stamped primary row if one exists.
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
  mode: 'balanced',
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

  // BUG-147 (2026-05-15): pair snapshots to draws strictly by `slate_date`.
  // The prior implementation bucketed snapshots by `updated_at_et` (a UTC
  // timestamptz despite the `_et` suffix). A yesterday-night ET regen — e.g.
  // 5/14 10:39 PM ET = 5/15 02:39 UTC — has `updated_at_et >= today UTC`, so
  // today's run was pulling in yesterday's snapshot and matching its picks
  // against today's draws. The `recordHitInAdaptiveTracking` PATCH path then
  // stamped today's hits onto yesterday's primary AT row (slate_hash-keyed,
  // slate_date untouched), producing false hits dated to the prior slate.
  // Filtering by `slate_date=eq.${date}` is the canonical pairing — a
  // snapshot's slate_date is the day whose draws it should be scored against.
  const fetchScope = async (s: string) =>
    sbGet<SnapshotRow[]>(
      `/rest/v1/slate_snapshots?scope=eq.${s}&deleted_at=is.null` +
      `&slate_date=eq.${date}` +
      `&order=updated_at_et.asc&limit=10`,
    );
  // No prior-date fallback: if no snapshot exists for `${date}`, there is
  // nothing to score for that day. Borrowing a snapshot from an earlier
  // slate_date would re-introduce the same cross-date pollution this fix
  // closes.
  const resolveSnaps = async (initial: SnapshotRow[] | null): Promise<SnapshotRow[]> =>
    Array.isArray(initial) ? initial : [];

  const skipMidday  = scope !== null && scope !== 'midday';
  const skipEvening = scope !== null && scope !== 'evening';
  const skipAllday  = scope !== null && scope !== 'allday';
  const [middaySnaps, eveningSnaps, alldaySnaps] = await Promise.all([
    skipMidday  ? Promise.resolve([] as SnapshotRow[]) : fetchScope('midday'),
    skipEvening ? Promise.resolve([] as SnapshotRow[]) : fetchScope('evening'),
    skipAllday  ? Promise.resolve([] as SnapshotRow[]) : fetchScope('allday'),
  ]);
  const [resolvedMidday, resolvedEvening, resolvedAllday] = await Promise.all([
    skipMidday  ? Promise.resolve([] as SnapshotRow[]) : resolveSnaps(middaySnaps),
    skipEvening ? Promise.resolve([] as SnapshotRow[]) : resolveSnaps(eveningSnaps),
    skipAllday  ? Promise.resolve([] as SnapshotRow[]) : resolveSnaps(alldaySnaps),
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
    // BUG-150 (2026-05-18): per-pick AT writes must be serial — the IS-NULL
    // primary-row lookup in recordHitInAdaptiveTracking depends on seeing
    // the prior write's effect. Parallel `Promise.all` raced: two writes for
    // the same pick both saw the primary row un-stamped and both PATCHed it,
    // losing the second state. DI writes still run after AT (one per pick).
    // pickPasses[pickIndex] = Promise that resolves once that pick's AT
    // writes + DI write are done, in order.
    const pickPasses: Promise<void>[] = [];
    const diWrites: Promise<void>[] = [];

    const updatedPicks = picks.map((pick: any) => {
      if (pick.hitType) return pick;
      const comboSet = pick.comboSet ?? pick.normKey;
      // BUG-155 (2026-05-23): straight match must compare against
      // pick.bestOrder (the user-facing recommended straight), not
      // pick.combo (engine enumeration index 000..999). They diverge
      // whenever bestOrderFor() chose a different permutation than the
      // iteration index. Prior code stamped picks as 'straight' on raw
      // index matches even though the user playing bestOrder only got box.
      // Fallback to combo for legacy picks that pre-date bestOrder.
      const straightCombo = pick.bestOrder ?? pick.combo;
      const matches: { result: HistoryRow; straightHit: boolean; boxHit: boolean }[] = [];
      for (const result of results) {
        // BUG-148 (2026-05-17): histories.session is now strictly
        // midday|evening (parser + CHECK constraint enforce it). The prior
        // (scope==='evening' && session==='evening') filter dropped DE Play 3
        // Night and similar late-draw hits because source data labels them
        // "Night" → session='night' → never matched evening scope.
        const sessionMatches =
          snapshot.scope === 'allday' || snapshot.scope === result.session;
        if (!sessionMatches) continue;
        const boxHit = result.comboset_sorted === comboSet;
        const straightHit = result.result_digits === straightCombo;
        if (boxHit || straightHit) matches.push({ result, straightHit, boxHit });
      }
      if (matches.length === 0) return pick;

      matches.sort((a, b) => (b.straightHit ? 1 : 0) - (a.straightHit ? 1 : 0));
      const primary = matches[0];
      hasNewHit = true;
      totalHits += matches.length;

      // Serial AT writes per pick: each match must observe the previous
      // match's PATCH before its own IS-NULL lookup runs (BUG-150).
      pickPasses.push((async () => {
        for (const m of matches) {
          try {
            await recordHitInAdaptiveTracking(pick, m.result, snapshot, date);
          } catch (e) {
            errors.push(`AT ${snapshot.scope}/${pick.combo}/${m.result.jurisdiction}: ${String(e).slice(0, 120)}`);
          }
        }
      })());
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
    // symptom we're trying to eliminate. Per-pick AT writes are serial
    // inside each pickPasses entry; different picks run in parallel.
    await Promise.all([...pickPasses, ...diWrites]);

    // HIT-DET-01 (2026-06-06): mark this snapshot's still-unstamped primary
    // rows as result_at=NOW. Any K6 primary with matched_state IS NULL at
    // this point is a confirmed miss for the date's draws — without this
    // stamp it would be indistinguishable from "detection hasn't run yet"
    // downstream (G1 sample-size gate, autotune AUC fitting). Hits already
    // had result_at stamped via recordHitInAdaptiveTracking; the
    // result_at=is.null filter makes this PATCH idempotent so re-runs are
    // no-ops on already-labeled picks. Outside the hasNewHit branch
    // deliberately: all-miss slates are exactly the case we most need to
    // label so the operator sees them as "verified" not "pending".
    if (snapshot.hash) {
      try {
        await sbPatch(
          `/rest/v1/adaptive_tracking?slate_hash=eq.${encodeURIComponent(snapshot.hash)}` +
          `&matched_state=is.null&result_at=is.null`,
          { result_at: new Date().toISOString() },
        );
      } catch (e) {
        errors.push(`AT miss-stamp ${snapshot.scope}/${snapshot.hash}: ${String(e).slice(0, 120)}`);
      }
    }

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
        // SCRUB-02 (2026-06-09): production is balanced-only.
        const mode = 'balanced' as const;
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
    const dateStarted = Date.now();
    let dateRes: RunResult;
    try {
      dateRes = await runForDate(d, scope, skipSupplements);
      totalHits        += dateRes.hitsFound;
      totalScopes      += dateRes.scopesChecked;
      totalSupplements += dateRes.supplementsGenerated;
      perDate[d] = dateRes;
      allErrors.push(...dateRes.errors);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 200);
      dateRes = { hitsFound: 0, scopesChecked: 0, supplementsGenerated: 0, errors: [msg] };
      perDate[d] = dateRes;
      allErrors.push(`${d}: ${msg}`);
    }
    // ENH-12 (2026-05-15): hit_detection_runs telemetry. One row per (date, scope).
    // Closes the BUG-145 silent-failure gap — recent rows show whether detection
    // actually ran and what it found. Non-fatal: wrapped in try/catch so a
    // telemetry write failure never affects the response.
    try {
      await fetch(SUPABASE_URL + '/rest/v1/hit_detection_runs', {
        method: 'POST',
        headers: svcHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({
          date:                  d,
          scope:                 scope,
          hits_found:            dateRes.hitsFound,
          scopes_checked:        dateRes.scopesChecked,
          supplements_generated: dateRes.supplementsGenerated,
          errors:                dateRes.errors.slice(0, 10),
          error_count:           dateRes.errors.length,
          duration_ms:           Date.now() - dateStarted,
          run_source:            'edge',
        }),
      });
    } catch (e) {
      console.warn('[run-hit-detection] hit_detection_runs telemetry write failed (non-fatal):', String(e));
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
