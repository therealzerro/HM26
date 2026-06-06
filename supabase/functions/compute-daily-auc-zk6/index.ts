/**
 * compute-daily-auc-zk6 — Supabase Edge Function
 *
 * Server-side port of scripts/intel-tuning/compute-daily-auc.ts. Computes
 * per-scope per-signal AUC for a given past day and upserts to
 * signal_auc_per_day. ENH-AFL-1 Phase 1 wiring; called from admin Daily
 * Workflow button (Step 0.5) so each workflow click freshens yesterday's
 * AUC before the engine reads it for slate generation.
 *
 * POST body: { day?: 'YYYY-MM-DD'; scope?: 'midday'|'evening'|'allday'; dryRun?: boolean }
 *   - day omitted → defaults to yesterday ET
 *   - scope omitted → all 3 scopes
 *   - dryRun=true returns AUC values without writing
 *
 * Methodology + AUC formula match the Node CLI script line-for-line. See
 * scripts/intel-tuning/compute-daily-auc.ts for the design header.
 */

import {
  H_ALL, HORIZON_WEIGHTS,
  toComboSet, sortedPair, buildUniverse,
  normalizeBoxKey, normalizePairKey,
  computeDGC, computeBoxSignal, computePairSignal, blendBoxDsRaw,
  type Scope,
} from '../_shared/engineCore.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const svcHeaders = (extra: Record<string, string> = {}) => ({
  apikey: SVC_KEY,
  Authorization: `Bearer ${SVC_KEY}`,
  'Content-Type': 'application/json',
  ...extra,
});

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error(`${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function sbUpsert(table: string, rows: unknown[]): Promise<void> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: svcHeaders({ 'Prefer': 'resolution=merge-duplicates,return=minimal' }),
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

const SCOPES: Scope[] = ['midday', 'evening', 'allday'];
const SIGNALS = ['BOX', 'PBURST', 'CO', 'DGC'] as const;
type Signal = typeof SIGNALS[number];

function yesterdayET(): string {
  const d = new Date(Date.now() - 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

// ─── Data loaders ─────────────────────────────────────────────────────────────

async function fetchBoxRows(scope: string): Promise<any[]> {
  const enc = encodeURIComponent(scope);
  const perHorizon = await Promise.all(
    H_ALL.map(h =>
      sbGet<any[]>(
        `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${enc}&horizon_label=eq.${h}` +
        `&deleted_at=is.null&jurisdiction=is.null` +
        `&select=key,ds_raw,times_drawn,horizon_label&limit=1100`,
      ).then(r => Array.isArray(r) ? r : []),
    ),
  );
  return perHorizon.flat();
}

async function fetchPairRows(scope: string): Promise<any[]> {
  const enc = encodeURIComponent(scope);
  const all: any[] = [];
  const PAGE = 1000;
  for (let off = 0; off < 20000; off += PAGE) {
    const page = await sbGet<any[]>(
      `/rest/v1/datasets_pair?scope=eq.${enc}&deleted_at=is.null&jurisdiction=is.null` +
      `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=${PAGE}&offset=${off}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

async function fetchHistoryRows(scope: string, endDate: string, lookbackDays: number): Promise<any[]> {
  const since = new Date(new Date(endDate + 'T00:00:00Z').getTime() - lookbackDays * 86400000)
    .toISOString().split('T')[0];
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const all: any[] = [];
  const PAGE = 1000;
  for (let off = 0; off < 20000; off += PAGE) {
    const page = await sbGet<any[]>(
      `/rest/v1/histories?date_et=gte.${since}&date_et=lte.${endDate}${sessionClause}` +
      `&select=result_digits,date_et&order=date_et.desc&limit=${PAGE}&offset=${off}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

// ─── Builders ─────────────────────────────────────────────────────────────────

function buildBoxData(boxRows: any[]) {
  const timesDrawnMap = new Map<string, number>();
  const dsRawMap = new Map<string, number>();
  const boxByHorizon = new Map<string, Map<string, number>>();
  for (const row of boxRows) {
    if (!row || typeof row.key !== 'string') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const td = typeof row.times_drawn === 'number' ? row.times_drawn : 0;
    const ds = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    if (td > (timesDrawnMap.get(normKey) ?? 0)) timesDrawnMap.set(normKey, td);
    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, ds);
    if (h === 'H01Y' || !dsRawMap.has(normKey)) dsRawMap.set(normKey, ds);
  }
  return { timesDrawnMap, dsRawMap, boxByHorizon };
}

type PairMeta = { timesDrawn: number; drawsSince: number };

function buildPairMetaMap(pairRows: any[]): Map<string, Map<number, PairMeta>> {
  const m = new Map<string, Map<number, PairMeta>>();
  for (const row of pairRows) {
    if (!row || typeof row.class_id !== 'number') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const pk = normalizePairKey(row.key_pair ?? row.key);
    if (h !== 'H01Y' && m.get(pk)?.has(row.class_id)) continue;
    if (!m.has(pk)) m.set(pk, new Map());
    m.get(pk)!.set(row.class_id, {
      timesDrawn: typeof row.times_drawn === 'number' ? row.times_drawn : 0,
      drawsSince: typeof row.ds_raw === 'number' ? row.ds_raw : 500,
    });
  }
  return m;
}

function buildHistoryOverrides(historyRows: any[], targetDate: string) {
  const targetMs = new Date(targetDate + 'T00:00:00Z').getTime();
  const dsOverride = new Map<string, number>();
  const hitDatesMap = new Map<string, number[]>();
  const hitOnDay = new Set<string>();
  for (const row of historyRows) {
    if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) continue;
    if (typeof row.date_et !== 'string') continue;
    const cs = toComboSet(row.result_digits);
    const rowMs = new Date(row.date_et).getTime();
    if (row.date_et === targetDate) hitOnDay.add(cs);
    if (rowMs < targetMs && !dsOverride.has(cs)) {
      const ds = Math.max(0, Math.round((targetMs - rowMs) / 86400000));
      dsOverride.set(cs, ds);
    }
    const dayOffset = Math.floor(rowMs / 86400000);
    const arr = hitDatesMap.get(cs) ?? [];
    arr.push(dayOffset);
    hitDatesMap.set(cs, arr);
  }
  return { dsOverride, hitDatesMap, hitOnDay };
}

// ─── Score one comboset ───────────────────────────────────────────────────────

function scoreCombosetSignals(
  combo: string,
  comboSet: string,
  timesDrawnMap: Map<string, number>,
  boxByHorizon: Map<string, Map<string, number>>,
  pairMetaMap: Map<string, Map<number, PairMeta>>,
  hitDatesMap: Map<string, number[]>,
  maxTimesDrawn: number,
  maxPairTimesDrawn: number,
): { BOX: number; PBURST: number; CO: number; DGC: number } {
  const [a, b, c] = combo;
  const ab = sortedPair(a, b);
  const bc = sortedPair(b, c);
  const ac = sortedPair(a, c);

  const td = timesDrawnMap.get(comboSet) ?? 0;
  const ds = blendBoxDsRaw(comboSet, boxByHorizon, HORIZON_WEIGHTS);
  const box = td > 0 ? computeBoxSignal(td, ds, maxTimesDrawn, 250, 0.60, 0.40) : 0;

  const pburstSum = [2, 3, 4].reduce((s, cid, i) => {
    const pk = [ab, bc, ac][i];
    const meta = pairMetaMap.get(pk)?.get(cid);
    return s + (meta ? computePairSignal(meta, maxPairTimesDrawn) : 0);
  }, 0);

  let coSum = 0;
  for (const cid of [5, 6, 7, 8, 9, 10, 11]) {
    for (const pk of [ab, bc, ac]) {
      const meta = pairMetaMap.get(pk)?.get(cid);
      coSum += meta ? computePairSignal(meta, maxPairTimesDrawn) : 0;
    }
  }

  const dates = hitDatesMap.get(comboSet) ?? [];
  const dgc = computeDGC(dates);

  return { BOX: box, PBURST: pburstSum / 3, CO: coSum / 21, DGC: dgc };
}

// ─── AUC ──────────────────────────────────────────────────────────────────────

function computeAUC(pairs: { score: number; hit: boolean }[]): { auc: number; nHits: number; nTotal: number } {
  const nTotal = pairs.length;
  const nHits = pairs.filter(x => x.hit).length;
  const nMisses = nTotal - nHits;
  if (nHits === 0 || nMisses === 0) return { auc: 0.5, nHits, nTotal };

  const sorted = [...pairs].sort((a, b) => a.score - b.score);
  let tieMissBuffer = 0;
  let scoreLessMisses = 0;
  let prevScore: number | null = null;
  let sum = 0;
  for (const cur of sorted) {
    if (prevScore !== null && cur.score !== prevScore) {
      scoreLessMisses += tieMissBuffer;
      tieMissBuffer = 0;
    }
    if (cur.hit) sum += scoreLessMisses + 0.5 * tieMissBuffer;
    else tieMissBuffer++;
    prevScore = cur.score;
  }
  return { auc: sum / (nHits * nMisses), nHits, nTotal };
}

// ─── Compute per scope per day ────────────────────────────────────────────────

interface PerScopeResult {
  scope: Scope;
  day: string;
  perSignal: Record<Signal, { auc: number; nHits: number; nTotal: number }>;
}

async function computeForScopeDay(scope: Scope, day: string): Promise<PerScopeResult | null> {
  const lookbackDays = 365;
  const [boxRows, pairRows, historyRows] = await Promise.all([
    fetchBoxRows(scope),
    fetchPairRows(scope),
    fetchHistoryRows(scope, day, lookbackDays),
  ]);
  if (boxRows.length === 0) return null;

  const { timesDrawnMap, dsRawMap, boxByHorizon } = buildBoxData(boxRows);
  const pairMetaMap = buildPairMetaMap(pairRows);
  const { dsOverride, hitDatesMap, hitOnDay } = buildHistoryOverrides(historyRows, day);

  for (const [cs, actualDs] of dsOverride) {
    const stale = dsRawMap.get(cs);
    if (stale == null || actualDs < stale) dsRawMap.set(cs, actualDs);
  }

  let maxTimesDrawn = 0;
  for (const td of timesDrawnMap.values()) if (td > maxTimesDrawn) maxTimesDrawn = td;
  let maxPairTimesDrawn = 0;
  for (const cm of pairMetaMap.values()) {
    for (const m of cm.values()) {
      if (m.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = m.timesDrawn;
    }
  }

  const universe = buildUniverse();
  const seen = new Set<string>();
  const scored: { comboset: string; BOX: number; PBURST: number; CO: number; DGC: number; hit: boolean }[] = [];
  for (const combo of universe) {
    const cs = toComboSet(combo);
    if (seen.has(cs)) continue;
    seen.add(cs);
    const s = scoreCombosetSignals(
      combo, cs,
      timesDrawnMap, boxByHorizon, pairMetaMap, hitDatesMap,
      maxTimesDrawn, maxPairTimesDrawn,
    );
    scored.push({ comboset: cs, ...s, hit: hitOnDay.has(cs) });
  }

  const perSignal = {} as Record<Signal, { auc: number; nHits: number; nTotal: number }>;
  for (const sig of SIGNALS) {
    const pairsArr = scored.map(x => ({ score: x[sig], hit: x.hit }));
    perSignal[sig] = computeAUC(pairsArr);
  }
  return { scope, day, perSignal };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  const startedAt = Date.now();
  let body: { day?: string; scope?: Scope; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* empty body OK */ }
  const day = body.day || yesterdayET();
  const scopes = body.scope ? [body.scope] : SCOPES;
  const apply = body.dryRun !== true;

  const results: PerScopeResult[] = [];
  const errors: string[] = [];

  for (const scope of scopes) {
    try {
      const r = await computeForScopeDay(scope, day);
      if (r) results.push(r);
    } catch (e) {
      errors.push(`${scope}: ${String(e).slice(0, 200)}`);
    }
  }

  const rowsToWrite: Array<{ scope: string; signal: string; day: string; auc: number; n_hits: number; n_combosets: number }> = [];
  for (const r of results) {
    for (const sig of SIGNALS) {
      const x = r.perSignal[sig];
      rowsToWrite.push({
        scope: r.scope, signal: sig, day: r.day,
        auc: Math.round(x.auc * 10000) / 10000,
        n_hits: x.nHits,
        n_combosets: x.nTotal,
      });
    }
  }

  if (apply && rowsToWrite.length > 0) {
    try {
      for (let i = 0; i < rowsToWrite.length; i += 200) {
        await sbUpsert('signal_auc_per_day', rowsToWrite.slice(i, i + 200));
      }
    } catch (e) {
      errors.push(`upsert: ${String(e).slice(0, 200)}`);
    }
  }

  const response = {
    success: errors.length === 0,
    dryRun: !apply,
    day,
    scopesProcessed: results.length,
    rowsWritten: apply ? rowsToWrite.length : 0,
    durationMs: Date.now() - startedAt,
    perSignal: results.map(r => ({
      scope: r.scope,
      BOX: r.perSignal.BOX.auc,
      PBURST: r.perSignal.PBURST.auc,
      CO: r.perSignal.CO.auc,
      DGC: r.perSignal.DGC.auc,
      nHits: r.perSignal.BOX.nHits,
    })),
    errors,
  };

  return new Response(JSON.stringify(response), {
    status: response.success ? 200 : 500,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
