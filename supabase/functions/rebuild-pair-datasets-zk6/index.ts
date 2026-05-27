/**
 * rebuild-pair-datasets-zk6 — Supabase Edge Function
 *
 * Server-side port of scripts/intel-tuning/rebuild-pair-datasets.ts. Recomputes
 * datasets_pair.ds_raw from histories per (scope × horizon × class × key_pair)
 * and PATCHes only the rows that differ. Uses the service-role key so it can
 * write directly past RLS.
 *
 * Parallel to rebuild-datasets-zk6 (box). Pair tables are manual-only (no
 * nightly cron) — this edge fn is the wire-up so the admin Daily Workflow
 * button can refresh pair ds_raw before slate regeneration.
 *
 * Pair-class semantics for a draw "abc":
 *   class 2 / 5  → sortedPair(a, b)       front pair (positional, sorted)
 *   class 3 / 6  → sortedPair(b, c)       back pair
 *   class 4 / 7  → sortedPair(a, c)       split pair
 *   class 8      → sortedPair(s0, s1)     front pair from sorted-digit box
 *   class 9      → sortedPair(s1, s2)     back pair from sorted-digit box
 *   class 10     → sortedPair(s0, s2)     split pair from sorted-digit box
 *   class 11     → all three sorted-box pairs (any-position box)
 *
 * POST body: { scope?, horizon?, dryRun?: boolean }
 *   - omit scope/horizon to process all 3 × 10 = 30 (scope, horizon) combos
 *   - dryRun=true returns the diff count without writing
 *
 * Returns:
 *   { success, dryRun, todayUtc, scopesProcessed, horizonsProcessed,
 *     totalChecked, totalUpdated, totalFailed, durationMs,
 *     perPair: [{scope, horizon, checked, updated, failed}],
 *     errors: string[] }
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

async function sbPatch(id: string, body: Record<string, unknown>): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/datasets_pair?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: svcHeaders({ 'Prefer': 'return=minimal' }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status + ': ' + (await r.text()).slice(0, 120));
}

async function sbAuditLog(payload: Record<string, unknown>): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: svcHeaders({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn('[rebuild-pair] audit_logs POST failed:', String(e).slice(0, 120));
  }
}

const HORIZONS_DAYS: Record<string, number> = {
  H01Y: 365, H02Y: 730, H03Y: 1095, H04Y: 1460, H05Y: 1825,
  H06Y: 2190, H07Y: 2555, H08Y: 2920, H09Y: 3285, H10Y: 3650,
};
const HORIZONS = Object.keys(HORIZONS_DAYS);
const SCOPES = ['midday', 'evening', 'allday'] as const;
const CLASSES = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

type HistoryRow = { result_digits: string; date_et: string; session: string };

function sp(a: string, b: string): string { return a <= b ? a + b : b + a; }

/** All (class_id, pair_key) tuples produced by a single draw "abc". */
function pairsForDraw(digits: string): Array<[number, string]> {
  const a = digits[0], b = digits[1], c = digits[2];
  const s = [...digits].sort();
  const fStraight = sp(a, b);
  const bStraight = sp(b, c);
  const splitStraight = sp(a, c);
  const fBox  = sp(s[0], s[1]);
  const bBox  = sp(s[1], s[2]);
  const splitBox = sp(s[0], s[2]);
  return [
    [2, fStraight], [3, bStraight], [4, splitStraight],
    [5, fStraight], [6, bStraight], [7, splitStraight],
    [8, fBox], [9, bBox], [10, splitBox],
    [11, fBox], [11, bBox], [11, splitBox],
  ];
}

/** Fetch ALL histories for a scope back to the H10Y cutoff. One paginated
 *  query; per-horizon filtering happens in memory downstream. */
async function fetchHistoriesForScope(scope: string, sinceDate: string): Promise<HistoryRow[]> {
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const PAGE = 1000;
  const rows: HistoryRow[] = [];
  let from = 0;
  while (true) {
    const chunk = await sbGet<HistoryRow[]>(
      `/rest/v1/histories?date_et=gte.${sinceDate}${sessionClause}&select=result_digits,date_et,session&order=date_et.desc&limit=${PAGE}&offset=${from}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchExistingPairs(scope: string, horizon: string): Promise<Array<{ id: string; key_pair: string; class_id: number; ds_raw: number }>> {
  const rows = await sbGet<any[]>(
    `/rest/v1/datasets_pair?scope=eq.${scope}&horizon_label=eq.${horizon}&deleted_at=is.null&jurisdiction=is.null&select=id,key_pair,class_id,ds_raw&limit=5000`,
  );
  return Array.isArray(rows) ? rows : [];
}

function daysBetween(today: Date, dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00Z');
  return Math.max(0, Math.round((today.getTime() - d.getTime()) / 86400000));
}

interface PairResult { scope: string; horizon: string; checked: number; updated: number; failed: number; error?: string }

async function rebuildScopeHorizon(
  scope: string,
  horizon: string,
  todayUtc: Date,
  scopeHistories: HistoryRow[],
  apply: boolean,
): Promise<PairResult> {
  const horizonDays = HORIZONS_DAYS[horizon];
  const sinceTs = todayUtc.getTime() - horizonDays * 86400000;
  const sinceDate = new Date(sinceTs).toISOString().split('T')[0];
  const inWindow = scopeHistories.filter(r => r.date_et >= sinceDate);

  // Most-recent hit per (class_id, key_pair)
  const mostRecent = new Map<string, string>();
  const keyOf = (cid: number, pk: string) => `${cid}|${pk}`;
  for (const row of inWindow) {
    const rd = row.result_digits;
    if (!rd || !/^\d{3}$/.test(rd)) continue;
    for (const [cid, pk] of pairsForDraw(rd)) {
      const k = keyOf(cid, pk);
      const cur = mostRecent.get(k);
      if (!cur || row.date_et > cur) mostRecent.set(k, row.date_et);
    }
  }

  const existing = await fetchExistingPairs(scope, horizon);
  const updates: Array<{ id: string; newDsRaw: number }> = [];
  let checked = 0;
  for (const r of existing) {
    if (!CLASSES.includes(r.class_id)) continue;
    checked++;
    const recent = mostRecent.get(keyOf(r.class_id, r.key_pair));
    if (!recent) continue;
    const newDsRaw = daysBetween(todayUtc, recent);
    if (newDsRaw === r.ds_raw) continue;
    updates.push({ id: r.id, newDsRaw });
  }

  if (!apply) {
    return { scope, horizon, checked, updated: updates.length, failed: 0 };
  }

  let ok = 0, failed = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async u => {
      try {
        await sbPatch(u.id, { ds_raw: u.newDsRaw, updated_at: new Date().toISOString() });
        ok++;
      } catch (e) {
        failed++;
        console.warn(`[rebuild-pair] PATCH failed ${scope}/${horizon} id=${u.id}: ${String(e).slice(0, 120)}`);
      }
    }));
  }
  return { scope, horizon, checked, updated: ok, failed };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const startedAt = Date.now();
  let body: { scope?: string; horizon?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* allow empty body */ }
  const apply = body.dryRun !== true;
  const scopeFilter = body.scope ?? '';
  const horizonFilter = body.horizon ?? '';
  const todayUtc = new Date(new Date().toISOString().split('T')[0] + 'T00:00:00Z');

  const errors: string[] = [];
  const perPair: PairResult[] = [];

  const scopesToProcess = SCOPES.filter(s => !scopeFilter || s === scopeFilter);
  const histoEarliestDate = new Date(todayUtc.getTime() - HORIZONS_DAYS.H10Y * 86400000)
    .toISOString().split('T')[0];

  const historiesByScope = new Map<string, HistoryRow[]>();
  for (const scope of scopesToProcess) {
    try {
      const hist = await fetchHistoriesForScope(scope, histoEarliestDate);
      historiesByScope.set(scope, hist);
    } catch (e) {
      errors.push(`fetch histories ${scope}: ${String(e).slice(0, 200)}`);
    }
  }

  for (const scope of scopesToProcess) {
    const hist = historiesByScope.get(scope) ?? [];
    if (hist.length === 0) continue;
    for (const horizon of HORIZONS) {
      if (horizonFilter && horizon !== horizonFilter) continue;
      try {
        const res = await rebuildScopeHorizon(scope, horizon, todayUtc, hist, apply);
        perPair.push(res);
      } catch (e) {
        errors.push(`rebuild ${scope}/${horizon}: ${String(e).slice(0, 200)}`);
        perPair.push({ scope, horizon, checked: 0, updated: 0, failed: 0, error: String(e).slice(0, 200) });
      }
    }
  }

  const totalChecked = perPair.reduce((a, p) => a + p.checked, 0);
  const totalUpdated = perPair.reduce((a, p) => a + p.updated, 0);
  const totalFailed = perPair.reduce((a, p) => a + p.failed, 0);
  const durationMs = Date.now() - startedAt;

  const response = {
    success: errors.length === 0,
    dryRun: !apply,
    todayUtc: todayUtc.toISOString().split('T')[0],
    scopesProcessed: scopesToProcess.length,
    horizonsProcessed: perPair.length / Math.max(1, scopesToProcess.length),
    totalChecked,
    totalUpdated,
    totalFailed,
    durationMs,
    perPair,
    errors,
  };

  await sbAuditLog({
    action: 'rebuild_pair_datasets_zk6',
    target: `${todayUtc.toISOString().split('T')[0]}-${apply ? 'apply' : 'dry'}`,
    payload_meta: {
      success: response.success,
      totalChecked,
      totalUpdated,
      totalFailed,
      durationMs,
      errorCount: errors.length,
    },
  });

  return new Response(JSON.stringify(response), {
    status: response.success ? 200 : 500,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
