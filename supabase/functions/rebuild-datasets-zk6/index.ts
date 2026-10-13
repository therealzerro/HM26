/**
 * rebuild-datasets-zk6 — Supabase Edge Function
 *
 * Server-side port of scripts/intel-tuning/rebuild-datasets.ts. Recomputes
 * datasets_box.ds_raw from histories per (scope × horizon) and PATCHes
 * only the rows that differ. Uses the service-role key so it can write
 * directly past RLS.
 *
 * Designed to run after the evening daily-input import (see
 * useDataIngestion::importDailyMutation). Idempotent — running it twice
 * in a row produces the same result. The second run finds zero diffs.
 *
 * POST body: { scope?, horizon?, dryRun?: boolean }
 *   - omit scope/horizon to process all 3 × 10 = 30 pairs
 *   - dryRun=true returns the diff count without writing
 *
 * Returns:
 *   { success, dryRun, todayUtc, scopesProcessed, horizonsProcessed,
 *     totalChecked, totalUpdated, totalFailed, durationMs,
 *     perPair: [{scope, horizon, checked, updated, failed}],
 *     errors: string[] }
 */

import { getTodayET } from '../_shared/dateUtils.ts';

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
  const r = await fetch(`${SUPABASE_URL}/rest/v1/datasets_box?id=eq.${encodeURIComponent(id)}`, {
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
    console.warn('[rebuild] audit_logs POST failed:', String(e).slice(0, 120));
  }
}

const HORIZONS_DAYS: Record<string, number> = {
  H01Y: 365, H02Y: 730, H03Y: 1095, H04Y: 1460, H05Y: 1825,
  H06Y: 2190, H07Y: 2555, H08Y: 2920, H09Y: 3285, H10Y: 3650,
};
const HORIZONS = Object.keys(HORIZONS_DAYS);
const SCOPES = ['midday', 'evening', 'allday'] as const;

type HistoryRow = { result_digits: string; date_et: string; session: string };

/**
 * Fetch ALL histories for a scope back to the H10Y cutoff (10 years).
 * One paginated query per scope; per-horizon filtering happens in memory
 * downstream. Saves ~27 round trips vs the script's per-horizon fetch.
 */
async function fetchHistoriesForScope(scope: string, sinceDate: string): Promise<HistoryRow[]> {
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const PAGE = 1000;
  const rows: HistoryRow[] = [];
  let from = 0;
  while (true) {
    // ENG-REBUILD-01: id.desc tiebreaker — up to 77 rows share a date_et, and without a unique
    // secondary order PostgREST may hand back ties in a different order per page, dropping or
    // doubling rows across the 1000-row page edge (BUG-163/166 class; the engine fetches already had it).
    const chunk = await sbGet<HistoryRow[]>(
      `/rest/v1/histories?date_et=gte.${sinceDate}${sessionClause}&select=result_digits,date_et,session&order=date_et.desc,id.desc&limit=${PAGE}&offset=${from}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function fetchExistingDataset(scope: string, horizon: string): Promise<Map<string, { ds_raw: number; id: string }>> {
  // HARNESS-NIT-02 (2026-10-13): paginated with a unique order — the old single
  // `limit=5000` GET was silently capped at 1000 rows by PostgREST.
  const rows: Array<{ id: string; key: string; ds_raw: number }> = [];
  const PAGE = 1000;
  for (let from = 0; from < 20000; from += PAGE) {
    const chunk = await sbGet<Array<{ id: string; key: string; ds_raw: number }>>(
      `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${scope}&horizon_label=eq.${horizon}&deleted_at=is.null&jurisdiction=is.null&select=id,key,ds_raw&order=id.asc&limit=${PAGE}&offset=${from}`,
    );
    if (!Array.isArray(chunk) || chunk.length === 0) break;
    rows.push(...chunk);
    if (chunk.length < PAGE) break;
  }
  const m = new Map<string, { ds_raw: number; id: string }>();
  if (Array.isArray(rows)) for (const r of rows) m.set(r.key, { ds_raw: r.ds_raw, id: r.id });
  return m;
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

  // In-memory filter to this horizon's window
  const inWindow = scopeHistories.filter(r => r.date_et >= sinceDate);

  // Most-recent hit per box-set (sorted-digit key) within the horizon
  const mostRecentHit = new Map<string, string>();
  for (const row of inWindow) {
    if (!/^\d{3}$/.test(row.result_digits ?? '')) continue;
    const sorted = row.result_digits.split('').sort().join('');
    const cur = mostRecentHit.get(sorted);
    if (!cur || row.date_et > cur) mostRecentHit.set(sorted, row.date_et);
  }

  const existing = await fetchExistingDataset(scope, horizon);

  // Diff loop — same logic as scripts/intel-tuning/rebuild-datasets.ts
  const updates: Array<{ id: string; newDsRaw: number }> = [];
  let checked = 0;
  for (const [key, ex] of existing) {
    const digits = key.match(/\d/g)?.join('').slice(0, 3) ?? '';
    const sorted = digits.split('').sort().join('');
    const isCanonical = key === sorted;
    if (!isCanonical) continue; // skip permutation rows
    checked++;
    const recent = mostRecentHit.get(sorted);
    if (!recent) continue; // no recent history → leave stored ds_raw alone
    const newDsRaw = daysBetween(todayUtc, recent);
    if (newDsRaw === ex.ds_raw) continue; // already accurate
    updates.push({ id: ex.id, newDsRaw });
  }

  if (!apply) {
    return { scope, horizon, checked, updated: updates.length, failed: 0 };
  }

  // Apply PATCHes — 50 in flight at a time
  let ok = 0, failed = 0;
  for (let i = 0; i < updates.length; i += 50) {
    const batch = updates.slice(i, i + 50);
    await Promise.all(batch.map(async u => {
      try {
        await sbPatch(u.id, { ds_raw: u.newDsRaw, updated_at: new Date().toISOString() });
        ok++;
      } catch (e) {
        failed++;
        console.warn(`[rebuild] PATCH failed ${scope}/${horizon} id=${u.id}: ${String(e).slice(0, 120)}`);
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
  // ENG-REBUILD-01 (2026-10-13): anchor on the EASTERN calendar day, like the engine
  // (getTodayET), not the UTC day — a run between 20:00 and 24:00 ET used to shift every
  // in-window ds_raw by +1 and the horizon boundary by a day vs a morning run of the same
  // data. Kept as a UTC-midnight Date so daysBetween/horizon arithmetic is unchanged.
  const todayUtc = new Date(getTodayET() + 'T00:00:00Z');

  const errors: string[] = [];
  const perPair: PairResult[] = [];

  // Fetch histories ONCE per scope (covers all horizons) — major time savings
  // vs the original per-horizon fetch.
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

  // Per-pair rebuild
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
    todayUtc: todayUtc.toISOString().split('T')[0], // ENG-REBUILD-01: this is the ET calendar day (field name kept for lib/rebuildTrigger.ts)
    anchor: 'ET',
    scopesProcessed: scopesToProcess.length,
    horizonsProcessed: perPair.length / Math.max(1, scopesToProcess.length),
    totalChecked,
    totalUpdated,
    totalFailed,
    durationMs,
    perPair,
    errors,
  };

  // Audit log entry — never blocks the response
  await sbAuditLog({
    action: 'rebuild_datasets_zk6',
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
