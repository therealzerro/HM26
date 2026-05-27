#!/usr/bin/env tsx
/**
 * compute-daily-auc.ts — ENH-AFL-1 (Adaptive Feedback Loop Phase 1)
 *
 * For each (scope, signal) computes the per-day AUC of that signal's
 * prediction quality: were the combosets that actually hit on day D ranked
 * higher by the signal than those that didn't? Writes one row per
 * (scope, signal, day) to signal_auc_per_day.
 *
 * Methodology:
 *   1. Build universe of 1000 combos → ~220 unique combosets.
 *   2. Score each comboset on day D using raw BOX/PBURST/CO/DGC math from
 *      lib/engineCore. ds_raw is corrected via dsOverride (history-derived,
 *      same approximation as backtest/replay.ts). times_drawn accepts the
 *      forward-drift documented in replay.ts header (~1-3% over 30 days).
 *   3. Identify combosets that actually hit on day D, scope-filtered.
 *   4. Compute AUC per signal via Mann-Whitney U formula:
 *        AUC = (sum_of_positive_ranks − K(K+1)/2) / (K × (N−K))
 *      where K = number of hits, N = number of combosets evaluated.
 *
 * Granularity: comboset (~220 sets), not straight permutation (1000).
 *   - Rationale: signal scores are identical across permutations of a set
 *     (BOX/PBURST/CO/DGC all consume comboset-keyed data).
 *   - Hit = the comboset's sorted-digit form appears in any of day D's
 *     scope-matching histories rows.
 *
 * Per-scope: each scope's histories slice + AUC computation is independent
 * per [[feedback-scopes-separate-data]]. No cross-scope aggregation.
 *
 * Storage: appends to `signal_auc_per_day`. Idempotent via PK ON CONFLICT.
 * Rolling 30-day AUC is read-side (AVG over the last 30 rows per scope/signal).
 *
 * Usage:
 *   npm run compute:daily-auc                       # dry-run for yesterday
 *   npm run compute:daily-auc -- --day 2026-05-26   # one specific day
 *   npm run compute:daily-auc -- --backfill 60      # last 60 days
 *   npm run compute:daily-auc -- --apply            # WRITE to production
 *   npm run compute:daily-auc -- --scope midday     # one scope only
 */

import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.backtest' });

import {
  H_ALL,
  HORIZON_WEIGHTS,
  toComboSet,
  sortedPair,
  buildUniverse,
  normalizeBoxKey,
  normalizePairKey,
  computeDGC,
  computeBoxSignal,
  computePairSignal,
  blendBoxDsRaw,
} from '../../lib/engineCore.js';

const URL = process.env.SUPABASE_URL?.replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.backtest');
  process.exit(1);
}

const HEADERS = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  'Content-Type': 'application/json',
};

type Scope = 'midday' | 'evening' | 'allday';
const SCOPES: Scope[] = ['midday', 'evening', 'allday'];
const SIGNALS = ['BOX', 'PBURST', 'CO', 'DGC'] as const;
type Signal = typeof SIGNALS[number];

// ─── Args ─────────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const a: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      a[argv[i].slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : 'true';
      if (a[argv[i].slice(2)] !== 'true') i++;
    }
  }
  return a;
}

function yesterdayET(): string {
  const d = new Date(Date.now() - 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function dateRange(endDate: string, days: number): string[] {
  const out: string[] = [];
  const end = new Date(endDate + 'T00:00:00Z');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

// ─── REST helpers ─────────────────────────────────────────────────────────────

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

async function sbUpsert(table: string, rows: unknown[]): Promise<void> {
  const r = await fetch(`${URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...HEADERS, Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`POST ${table} ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ─── Data loaders (paginated, mirrors compute-slate-zk6) ─────────────────────

async function fetchBoxRows(scope: string): Promise<any[]> {
  const enc = encodeURIComponent(scope);
  const perHorizon = await Promise.all(
    H_ALL.map(h =>
      sbGet<any[]>(
        `/datasets_box?class_id=eq.1&scope=eq.${enc}&horizon_label=eq.${h}` +
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
      `/datasets_pair?scope=eq.${enc}&deleted_at=is.null&jurisdiction=is.null` +
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
      `/histories?date_et=gte.${since}&date_et=lte.${endDate}${sessionClause}` +
      `&select=result_digits,date_et&order=date_et.desc&limit=${PAGE}&offset=${off}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    all.push(...page);
    if (page.length < PAGE) break;
  }
  return all;
}

// ─── Dataset builders (focused — only what AUC scoring needs) ────────────────

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

    // Hits ON target day
    if (row.date_et === targetDate) hitOnDay.add(cs);

    // For ds-override, look at hits STRICTLY BEFORE target day (engine doesn't
    // know about target-day hits when scoring target day's slate).
    if (rowMs < targetMs && !dsOverride.has(cs)) {
      const ds = Math.max(0, Math.round((targetMs - rowMs) / 86400000));
      dsOverride.set(cs, ds);
    }

    // DGC builds from full lookback window of hit dates.
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
  dsRawMap: Map<string, number>,
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

/**
 * Mann-Whitney U → AUC. Ties contribute 0.5 each (standard mid-rank handling).
 * scoredCombosets: array of { score, hit } pairs.
 */
function computeAUC(scoredCombosets: { score: number; hit: boolean }[]): { auc: number; nHits: number; nTotal: number } {
  const nTotal = scoredCombosets.length;
  const nHits = scoredCombosets.filter(x => x.hit).length;
  const nMisses = nTotal - nHits;
  if (nHits === 0 || nMisses === 0) return { auc: 0.5, nHits, nTotal };

  // For each hit, count: (# misses with strictly lower score) + 0.5 × (# misses tied).
  // Sort all by score asc and use a sweep for O(N log N).
  const sorted = [...scoredCombosets].sort((a, b) => a.score - b.score);
  let rankCount = 0; // misses seen so far (strict-less-than for next hit)
  let tieMissBuffer = 0;
  let prevScore: number | null = null;
  let scoreLessMisses = 0; // misses with score strictly < current score group
  let sum = 0;

  for (let i = 0; i < sorted.length; i++) {
    const cur = sorted[i];
    if (prevScore !== null && cur.score !== prevScore) {
      // close the previous tie group: tied misses promoted to "strict less" for future hits
      scoreLessMisses += tieMissBuffer;
      tieMissBuffer = 0;
    }
    if (cur.hit) {
      // Strict-less misses already counted in scoreLessMisses; tied misses still in tieMissBuffer
      sum += scoreLessMisses + 0.5 * tieMissBuffer;
    } else {
      tieMissBuffer++;
    }
    prevScore = cur.score;
    rankCount++;
  }
  // Note: rankCount unused in final calc; left for clarity / future debug.
  void rankCount;

  return { auc: sum / (nHits * nMisses), nHits, nTotal };
}

// ─── Main compute per scope per day ──────────────────────────────────────────

interface DayResult {
  scope: Scope;
  day: string;
  perSignal: Record<Signal, { auc: number; nHits: number; nTotal: number }>;
}

async function computeForScopeDay(scope: Scope, day: string): Promise<DayResult | null> {
  // Lookback window must cover the longest horizon for DGC + pair pressure.
  // 90 days is enough for DGC (handful of recurrences); pair ds_raw is in the
  // dataset tables (separate). For AUC simplicity, use 365d window for DGC.
  const lookbackDays = 365;

  const [boxRows, pairRows, historyRows] = await Promise.all([
    fetchBoxRows(scope),
    fetchPairRows(scope),
    fetchHistoryRows(scope, day, lookbackDays),
  ]);
  if (boxRows.length === 0) {
    console.warn(`  ${scope} ${day} — no box data, skipping`);
    return null;
  }

  const { timesDrawnMap, dsRawMap, boxByHorizon } = buildBoxData(boxRows);
  const pairMetaMap = buildPairMetaMap(pairRows);
  const { dsOverride, hitDatesMap, hitOnDay } = buildHistoryOverrides(historyRows, day);

  // Apply ds override (history wins when more recent than stored).
  for (const [cs, actualDs] of dsOverride) {
    const stale = dsRawMap.get(cs);
    if (stale == null || actualDs < stale) dsRawMap.set(cs, actualDs);
  }

  // maxTimesDrawn over the universe (for normalization-equivalent in computeBoxSignal).
  let maxTimesDrawn = 0;
  for (const td of timesDrawnMap.values()) if (td > maxTimesDrawn) maxTimesDrawn = td;
  let maxPairTimesDrawn = 0;
  for (const cm of pairMetaMap.values()) {
    for (const m of cm.values()) {
      if (m.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = m.timesDrawn;
    }
  }

  // Score every comboset. Each combo in 000-999 maps to its comboset; same
  // score per comboset (deduped here).
  const universe = buildUniverse();
  const seen = new Set<string>();
  const scored: { comboset: string; BOX: number; PBURST: number; CO: number; DGC: number; hit: boolean }[] = [];
  for (const combo of universe) {
    const cs = toComboSet(combo);
    if (seen.has(cs)) continue;
    seen.add(cs);
    const s = scoreCombosetSignals(
      combo, cs,
      timesDrawnMap, dsRawMap, boxByHorizon, pairMetaMap, hitDatesMap,
      maxTimesDrawn, maxPairTimesDrawn,
    );
    scored.push({ comboset: cs, ...s, hit: hitOnDay.has(cs) });
  }

  const perSignal = {} as Record<Signal, { auc: number; nHits: number; nTotal: number }>;
  for (const sig of SIGNALS) {
    const pairs = scored.map(x => ({ score: x[sig], hit: x.hit }));
    perSignal[sig] = computeAUC(pairs);
  }

  return { scope, day, perSignal };
}

// ─── Driver ───────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const apply = args.apply === 'true';
  const scopeFilter = args.scope as Scope | undefined;
  const days = args.backfill ? dateRange(yesterdayET(), parseInt(args.backfill, 10))
              : args.day ? [args.day]
              : [yesterdayET()];
  const scopes = scopeFilter ? [scopeFilter] : SCOPES;

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  ENH-AFL-1: per-signal AUC compute');
  console.log(`  Mode: ${apply ? '🔴 APPLY (writing to signal_auc_per_day)' : '🟢 DRY-RUN'}`);
  console.log(`  Days: ${days.length} (${days[0]}…${days[days.length - 1]})`);
  console.log(`  Scopes: ${scopes.join(', ')}`);
  console.log('═══════════════════════════════════════════════════════════\n');

  const rowsToWrite: Array<{ scope: string; signal: string; day: string; auc: number; n_hits: number; n_combosets: number }> = [];

  for (const day of days) {
    console.log(`\n── ${day} ──`);
    for (const scope of scopes) {
      const result = await computeForScopeDay(scope, day);
      if (!result) continue;
      const parts = SIGNALS.map(sig => {
        const r = result.perSignal[sig];
        return `${sig}=${r.auc.toFixed(3)} (n_hits=${r.nHits})`;
      });
      console.log(`  ${scope.padEnd(8)} ${parts.join('  ')}`);
      for (const sig of SIGNALS) {
        const r = result.perSignal[sig];
        rowsToWrite.push({
          scope, signal: sig, day,
          auc: Math.round(r.auc * 10000) / 10000,
          n_hits: r.nHits,
          n_combosets: r.nTotal,
        });
      }
    }
  }

  if (apply && rowsToWrite.length > 0) {
    console.log(`\n  Writing ${rowsToWrite.length} rows to signal_auc_per_day…`);
    // Chunk to stay well under URL/body size limits.
    for (let i = 0; i < rowsToWrite.length; i += 200) {
      await sbUpsert('signal_auc_per_day', rowsToWrite.slice(i, i + 200));
    }
    console.log(`  ✓ Wrote ${rowsToWrite.length} rows.`);
  } else if (!apply) {
    console.log(`\n  💡 Re-run with --apply to persist (${rowsToWrite.length} rows would be written).`);
  }

  console.log('\n═══════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
