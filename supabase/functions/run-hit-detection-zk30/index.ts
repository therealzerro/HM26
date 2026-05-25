/**
 * run-hit-detection-zk30 — Supabase Edge Function (ARCH-06 step 6)
 *
 * Post-draw hit detection for ZK30 Texas Pick 3. Forked from
 * run-hit-detection with these v1.0 lock-ins:
 *   • reads:   slate_snapshots_zk30, histories_tx, adaptive_tracking_zk30,
 *              daily_intelligence_zk30
 *   • writes:  daily_intelligence_zk30 (PATCH per pick),
 *              adaptive_tracking_zk30 (multi-row per pick),
 *              hit_detection_runs (telemetry)
 *   • hardcoded scope='allday', mode='balanced' (single-scope v1.0)
 *   • no supplemental-slate regeneration (skipSupplements default true)
 *   • Fireball detection adds 2 new match types via 3-position digit
 *     substitution (TX Pick 3 standard mechanic)
 *
 * BUG-155 preserved: straight match compares against `pick.bestOrder`
 *   (user-facing recommended permutation), not `pick.combo` (engine
 *   enumeration index 000..999).
 *
 * BUG-150 preserved: per-pick AT writes run SERIALLY so the IS-NULL
 *   primary-row probe in match N sees match N-1's PATCH effect. Different
 *   picks run in parallel.
 *
 * Fireball convention (TX Pick 3): for each draw with a fireball digit F,
 *   create up to 3 augmented results by substituting F into positions 0/1/2
 *   of the draw. Flags are independent — a natural straight does NOT
 *   suppress fireball_*. Caller derives "any kind of straight" via OR.
 *
 * POST body:
 *   { date: "YYYY-MM-DD", dates?: string[], skipSupplements?: true }
 *   - no scope param (single 'allday')
 *
 * Response:
 *   { success, hitsFound, perDate: { [date]: {...} }, errors, durationMs }
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

// ─── Date utils (inlined; no separate dateUtils.ts file) ─────────────────────

function getYesterdayET(): string {
  return new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ─── Match math ──────────────────────────────────────────────────────────────

function sortDigits(s: string): string {
  return s.split('').sort().join('');
}

/**
 * TX Fireball: substitute the fireball digit into each of the 3 positions
 * of the draw result. Returns up to 3 augmented 3-digit strings.
 * Returns [] when fireball is null/empty/missing.
 */
function fireballAugmented(resultDigits: string, fireball: string | null): string[] {
  if (!fireball || fireball.length !== 1 || !/^\d$/.test(fireball)) return [];
  return [
    fireball + resultDigits[1] + resultDigits[2],   // sub pos 0
    resultDigits[0] + fireball + resultDigits[2],   // sub pos 1
    resultDigits[0] + resultDigits[1] + fireball,   // sub pos 2
  ];
}

interface HitFlags {
  hit_straight: boolean;
  hit_box: boolean;
  hit_fireball_straight: boolean;
  hit_fireball_box: boolean;
}

/**
 * Match a single pick against a single TX draw. Returns the 4-flag tuple.
 * - hit_box implies hit_straight (every straight is also a box)
 * - hit_fireball_box implies hit_fireball_straight
 * - Natural and fireball flags are INDEPENDENT (no mutex)
 *
 * straightCombo = pick.bestOrder ?? pick.combo (BUG-155).
 */
function computeHitFlags(
  resultDigits: string,
  fireball: string | null,
  straightCombo: string,
  comboSet: string,
): HitFlags {
  // Natural
  const hit_straight = resultDigits === straightCombo;
  const resultSorted = sortDigits(resultDigits);
  const hit_box = (resultSorted === comboSet) || hit_straight;

  // Fireball
  const fbResults = fireballAugmented(resultDigits, fireball);
  const hit_fireball_straight = fbResults.some(r => r === straightCombo);
  const hit_fireball_box = fbResults.some(r => sortDigits(r) === comboSet) || hit_fireball_straight;

  return { hit_straight, hit_box, hit_fireball_straight, hit_fireball_box };
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface SnapshotRow {
  id: string;
  hash: string;
  snapshot_hash: string;
  slate_date: string;
  updated_at_et: string;
  top_k_straights_json: unknown;
}
interface HistoryRow {
  date_et: string;
  session: string;
  result_digits: string;
  fireball: string | null;
}
interface Match {
  result: HistoryRow;
  flags: HitFlags;
  /** Highest-precedence flag set on THIS match. Used for primary-match selection
   *  on the daily_intelligence_zk30 PATCH (one row per pick). */
  precedence: number; // higher = better. straight=4, box=3, fb_straight=2, fb_box=1
}

function matchPrecedence(f: HitFlags): number {
  if (f.hit_straight) return 4;
  if (f.hit_box) return 3;
  if (f.hit_fireball_straight) return 2;
  if (f.hit_fireball_box) return 1;
  return 0;
}

// ─── DI annotation (per-pick PATCH; primary match wins) ──────────────────────

async function updateDailyIntelligenceHit(
  pick: any,
  primary: Match,
  date: string,
): Promise<void> {
  // BUG-32 lineage: slate_date can be `date` or yesterday for late-night ET
  // regens. daily_intelligence_zk30 has no jurisdiction/scope/mode columns
  // (per ZK30 schema lockdown) — just (slate_date, combo) is the natural key.
  const prev = new Date(date + 'T12:00:00'); prev.setDate(prev.getDate() - 1);
  const prevDayStr = prev.toISOString().split('T')[0];
  const dateFilter = `slate_date=in.(${date},${prevDayStr})`;
  await sbPatch(
    `/rest/v1/daily_intelligence_zk30?${dateFilter}&combo=eq.${encodeURIComponent(pick.combo)}`,
    {
      hit_straight:          primary.flags.hit_straight,
      hit_box:               primary.flags.hit_box,
      hit_fireball_straight: primary.flags.hit_fireball_straight,
      hit_fireball_box:      primary.flags.hit_fireball_box,
      matched_session:       primary.result.session,
      matched_result:        primary.result.result_digits,
      matched_fireball:      primary.result.fireball,
    },
  );
}

// ─── AT annotation (multi-row per pick, BUG-150 serial) ──────────────────────

async function recordHitInAdaptiveTracking(
  pick: any,
  match: Match,
  snap: SnapshotRow,
  date: string,
): Promise<void> {
  const boxS    = pick.box    ?? pick.signals?.BOX    ?? 0;
  const pburstS = pick.pburst ?? pick.signals?.PBURST ?? 0;
  const coS     = pick.co     ?? pick.signals?.CO     ?? 0;
  const dgcS    = pick.dgc    ?? pick.signals?.DGC    ?? 0;

  const slateHash = snap.hash ?? snap.snapshot_hash ?? '';
  const comboSet  = pick.comboSet ?? pick.normKey ?? '';
  const session   = match.result.session;
  const outcomeFields = {
    hit_straight:          match.flags.hit_straight,
    hit_box:               match.flags.hit_box,
    hit_fireball_straight: match.flags.hit_fireball_straight,
    hit_fireball_box:      match.flags.hit_fireball_box,
    matched_session:       session,
    matched_result:        match.result.result_digits,
    matched_fireball:      match.result.fireball,
    result_at:             new Date().toISOString(),
  };

  // Layer 1 — exact-match idempotency probe. ZK30 has no `matched_state`
  // column (single jurisdiction), so the per-match discriminator is
  // matched_session only.
  const dup = await sbGet<{ id: number }[]>(
    `/rest/v1/adaptive_tracking_zk30?slate_hash=eq.${encodeURIComponent(slateHash)}` +
    `&rank=eq.${pick.rank}&combo=eq.${encodeURIComponent(pick.combo)}` +
    `&matched_session=eq.${encodeURIComponent(session)}` +
    `&select=id&limit=1`,
  );
  if (Array.isArray(dup) && dup.length > 0) return;

  // Layer 2 — PATCH the un-stamped primary row (matched_session IS NULL)
  // if it still exists. BUG-150 serial pattern lets the next match in this
  // pick's chain see the PATCH effect.
  const existing = await sbGet<{ id: number }[]>(
    `/rest/v1/adaptive_tracking_zk30?slate_hash=eq.${encodeURIComponent(slateHash)}` +
    `&rank=eq.${pick.rank}&combo=eq.${encodeURIComponent(pick.combo)}` +
    `&matched_session=is.null&select=id&limit=1`,
  );
  if (Array.isArray(existing) && existing.length > 0) {
    await sbPatch(`/rest/v1/adaptive_tracking_zk30?id=eq.${existing[0].id}`, outcomeFields);
    return;
  }

  // Layer 3 — INSERT secondary row. Primary already PATCHed by an earlier
  // match for this pick; this match is a different session, so it gets its
  // own row. Signal columns mirror the primary so per-row analysis works
  // standalone; quartile/dominant_signal left NULL (join back to primary
  // via slate_hash+rank+combo for those analyses).
  await sbPost('/rest/v1/adaptive_tracking_zk30', {
    slate_date: date,
    slate_hash: slateHash,
    rank: pick.rank,
    combo: pick.combo,
    combo_set: comboSet,
    signal_box: boxS,
    signal_pburst: pburstS,
    signal_co: coS,
    signal_dgc: dgcS,
    energy_score: pick.temperature ?? pick.energy ?? 0,
    ...outcomeFields,
  });
}

// ─── Per-date runner ─────────────────────────────────────────────────────────

interface RunResult {
  hitsFound: number;
  picksMatched: number;
  errors: string[];
}

async function runForDate(date: string): Promise<RunResult> {
  const errors: string[] = [];
  let totalMatches = 0;
  let picksMatched = 0;

  // 1. Fetch the active slate for `date`. ZK30 v1.0: single scope+mode.
  const snaps = await sbGet<SnapshotRow[]>(
    `/rest/v1/slate_snapshots_zk30?slate_date=eq.${date}&deleted_at=is.null` +
    `&order=updated_at_et.desc&limit=10`,
  );
  if (!Array.isArray(snaps) || snaps.length === 0) {
    return { hitsFound: 0, picksMatched: 0, errors };
  }

  // 2. Fetch all TX draws on `date`. histories_tx has no `comboset_sorted`
  // column — we compute it inline from result_digits.
  const draws = await sbGet<HistoryRow[]>(
    `/rest/v1/histories_tx?date_et=eq.${date}` +
    `&select=date_et,session,result_digits,fireball`,
  );
  if (!Array.isArray(draws) || draws.length === 0) {
    return { hitsFound: 0, picksMatched: 0, errors };
  }

  // 3. Per-snapshot processing. ZK30 v1.0 has one (snapshot per date) but
  // we loop for forward-compat (e.g. mode variants land in v2).
  for (const snapshot of snaps) {
    let picks: any[] = [];
    try {
      picks = typeof snapshot.top_k_straights_json === 'string'
        ? JSON.parse(snapshot.top_k_straights_json)
        : (snapshot.top_k_straights_json ?? []) as any[];
    } catch { continue; }
    if (!Array.isArray(picks) || picks.length === 0) continue;

    // Pick-level processing — picks run in parallel; matches within a pick
    // run serially (BUG-150). Each pick contributes one DI PATCH for its
    // primary match + N AT writes for its N matches.
    const pickPasses: Promise<void>[] = [];
    const diWrites: Promise<void>[] = [];

    const updatedPicks = picks.map((pick: any) => {
      // Snapshot-level idempotency: already-annotated picks skip the loop.
      if (pick.hitType) return pick;

      const comboSet = pick.comboSet ?? pick.normKey;
      const straightCombo = pick.bestOrder ?? pick.combo;
      if (typeof straightCombo !== 'string' || typeof comboSet !== 'string') {
        return pick;
      }

      const matches: Match[] = [];
      for (const result of draws) {
        const flags = computeHitFlags(result.result_digits, result.fireball, straightCombo, comboSet);
        const prec = matchPrecedence(flags);
        if (prec > 0) {
          matches.push({ result, flags, precedence: prec });
        }
      }
      if (matches.length === 0) return pick;

      picksMatched++;
      totalMatches += matches.length;

      // Primary match for DI = highest precedence. Ties broken deterministically
      // by session order to keep regens stable (Morning < Day < Evening < Night).
      const SESSION_RANK: Record<string, number> = { Morning: 0, Day: 1, Evening: 2, Night: 3 };
      matches.sort((a, b) =>
        b.precedence - a.precedence ||
        (SESSION_RANK[a.result.session] ?? 99) - (SESSION_RANK[b.result.session] ?? 99),
      );
      const primary = matches[0];

      // Serial AT writes per pick.
      pickPasses.push((async () => {
        for (const m of matches) {
          try {
            await recordHitInAdaptiveTracking(pick, m, snapshot, date);
          } catch (e) {
            errors.push(`AT ${pick.combo}/${m.result.session}: ${String(e).slice(0, 120)}`);
          }
        }
      })());
      diWrites.push(
        updateDailyIntelligenceHit(pick, primary, date).catch(e => {
          errors.push(`DI ${pick.combo}: ${String(e).slice(0, 120)}`);
        }),
      );

      // Snapshot-row annotation for snapshot PATCH at the end.
      const flagToType = (f: HitFlags): 'straight' | 'box' | 'fireball_straight' | 'fireball_box' | undefined =>
        f.hit_straight ? 'straight' :
        f.hit_box ? 'box' :
        f.hit_fireball_straight ? 'fireball_straight' :
        f.hit_fireball_box ? 'fireball_box' : undefined;
      return {
        ...pick,
        hitType: flagToType(primary.flags),
        hitSession: primary.result.session,
        hitDate: date,
        hitResult: primary.result.result_digits,
        hitFireball: primary.result.fireball,
      };
    });

    // Await all DI + AT writes before the snapshot annotation PATCH so a
    // downstream reader can't observe an annotated snapshot pointing at
    // missing AT/DI rows (BUG-145 lineage).
    await Promise.all([...pickPasses, ...diWrites]);

    if (picksMatched > 0) {
      try {
        await sbPatch(`/rest/v1/slate_snapshots_zk30?id=eq.${snapshot.id}`, {
          top_k_straights_json: updatedPicks,
        });
      } catch (e) {
        errors.push(`snapshot PATCH ${snapshot.id}: ${String(e).slice(0, 120)}`);
      }
    }
  }

  return { hitsFound: totalMatches, picksMatched, errors };
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
  let body: { date?: string; dates?: string[]; skipSupplements?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }

  const dateList = Array.isArray(body.dates) && body.dates.length > 0
    ? body.dates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    : (body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? [body.date] : []);
  if (dateList.length === 0) {
    return new Response(JSON.stringify({ error: 'date or dates[] required (YYYY-MM-DD)' }), {
      status: 400, headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }

  let totalHits = 0;
  let totalPicksMatched = 0;
  const perDate: Record<string, { hitsFound: number; picksMatched: number; errors: string[] }> = {};
  const allErrors: string[] = [];

  for (const d of dateList) {
    const dateStarted = Date.now();
    let dateRes: RunResult;
    try {
      dateRes = await runForDate(d);
      totalHits        += dateRes.hitsFound;
      totalPicksMatched += dateRes.picksMatched;
      perDate[d] = dateRes;
      allErrors.push(...dateRes.errors);
    } catch (e) {
      const msg = String(e instanceof Error ? e.message : e).slice(0, 200);
      dateRes = { hitsFound: 0, picksMatched: 0, errors: [msg] };
      perDate[d] = dateRes;
      allErrors.push(`${d}: ${msg}`);
    }

    // hit_detection_runs telemetry (BUG-145 backstop). Schema has no
    // jurisdiction column; ZK30 marker lives in `scope='allday-tx'` to
    // disambiguate from ZK6 telemetry in the same table.
    try {
      await fetch(SUPABASE_URL + '/rest/v1/hit_detection_runs', {
        method: 'POST',
        headers: svcHeaders({ 'Prefer': 'return=minimal' }),
        body: JSON.stringify({
          date:                  d,
          scope:                 'allday-tx',
          hits_found:            dateRes.hitsFound,
          scopes_checked:        1, // single scope for ZK30 v1.0
          supplements_generated: 0, // not supported in v1.0
          errors:                dateRes.errors.slice(0, 10),
          error_count:           dateRes.errors.length,
          duration_ms:           Date.now() - dateStarted,
          run_source:            'edge-zk30',
        }),
      });
    } catch (e) {
      console.warn('[run-hit-detection-zk30] hit_detection_runs telemetry write failed:', String(e));
    }
  }

  return new Response(JSON.stringify({
    success: allErrors.length === 0,
    hitsFound: totalHits,
    picksMatched: totalPicksMatched,
    perDate,
    errors: allErrors.slice(0, 30),
    errorCount: allErrors.length,
    durationMs: Date.now() - started,
    // Silence unused-variable warning for skipSupplements (v1.0 doesn't support it).
    _yesterdayMarker: getYesterdayET(),
  }), { headers: { ...cors, 'Content-Type': 'application/json' } });
});
