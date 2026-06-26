#!/usr/bin/env tsx
/**
 * universe-auc-stratified.ts — SIGNAL-INFO-01 (2026-06-10)
 *
 * The decisive "do the signals carry information?" test. Computes per-day
 * full-universe AUC per (scope, signal) like compute-daily-auc.ts, but fixes
 * the two confounds that make signal_auc_per_day unusable for that question:
 *
 *   1. MULTIPLICITY STRATIFICATION. The stored table pools all 220 combosets.
 *      Per draw, a singles comboset is 6× as likely to hit as a triples and
 *      2× a doubles — and BOX/PBURST/CO all correlate with historical
 *      frequency, which encodes multiplicity. Pooled AUC > 0.5 is therefore
 *      partially mechanical. Within SINGLES ONLY (120 combosets), fair draws
 *      make every comboset exactly equiprobable → true AUC must be 0.500.
 *      Any persistent deviation is real structure (or leakage).
 *
 *   2. DGC TARGET-DAY LEAKAGE. compute-daily-auc builds hitDatesMap from
 *      rows date_et <= day, so DGC sees the outcome it is judged on.
 *      Here the DGC pool is strictly date_et < day.
 *
 * Also differs from compute-daily-auc:
 *   - BOX pressure ds is as-of corrected from histories (dsOverride wins over
 *     the dataset value, which reflects TODAY's rebuild → forward leakage for
 *     backfilled days). times_drawn keeps the documented ~1-3% forward drift
 *     (full as-of reconstruction is a v2).
 *   - pressureThreshold 100 + per-scope freq/pressure weights = prod parity
 *     post-CONFIG-12 (compute-daily-auc still hardcodes the stale 250 global).
 *   - Datasets fetched ONCE per scope (they are current-values anyway);
 *     histories fetched once per scope for the whole window and sliced per
 *     day in memory. Read-only: ZERO database writes.
 *
 * Usage:
 *   npx tsx scripts/intel-tuning/universe-auc-stratified.ts --from 2026-05-13 --to 2026-06-09
 *   npx tsx scripts/intel-tuning/universe-auc-stratified.ts --from 2026-05-13 --to 2026-06-09 --scope allday
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
  multiplicityOf,
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
const HEADERS = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

type Scope = 'midday' | 'evening' | 'allday';
const SCOPES: Scope[] = ['midday', 'evening', 'allday'];
// CEN_RAW  — "all raw data points closest to their average": z-score box_ds,
//            box_td, pair_ds, pair_td vs the universe that day; centrality =
//            exp(-mean z²). High = combo that is dead-average on every feature.
// CEN_SIG  — same idea in signal-space (BOX/PBURST/CO/DGC z-scored).
const SIGNALS = ['BOX', 'PBURST', 'CO', 'DGC', 'CEN_RAW', 'CEN_SIG'] as const;
type Signal = typeof SIGNALS[number];

function meanStd(xs: number[]): { mean: number; std: number } {
  const n = xs.length || 1;
  const mean = xs.reduce((s, v) => s + v, 0) / n;
  const std = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / n);
  return { mean, std };
}
const STRATA = ['singles', 'doubles', 'pooled'] as const;
type Stratum = typeof STRATA[number];

// Prod-parity BOX shape post-CONFIG-12 (pressure_threshold 100 global) and
// ENH-BP per-scope freq/pressure weights — matches prod_parity_2026_06_10.
const PRESSURE_THRESHOLD = 100;
const BOX_WEIGHTS: Record<Scope, { freq: number; pressure: number }> = {
  midday:  { freq: 0.60, pressure: -0.40 },
  evening: { freq: 0.60, pressure: -0.40 },
  allday:  { freq: 0.60, pressure: 0.40 },
};

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

function dateRangeInclusive(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = new Date(from + 'T00:00:00Z'); d.toISOString().split('T')[0] <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().split('T')[0]);
  }
  return out;
}

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(`${URL}/rest/v1${path}`, { headers: HEADERS });
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return r.json();
}

// ── Data loaders (datasets once per scope; histories once per scope+window) ──

async function fetchBoxRows(scope: string): Promise<any[]> {
  const enc = encodeURIComponent(scope);
  const perHorizon = await Promise.all(
    H_ALL.map(h =>
      sbGet<any[]>(
        `/datasets_box?class_id=eq.1&scope=eq.${enc}&horizon_label=eq.${h}` +
        `&deleted_at=is.null&jurisdiction=is.null` +
        `&select=key,ds_raw,times_drawn,horizon_label&limit=1100`,
      ).then(r => (Array.isArray(r) ? r : [])),
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

async function fetchHistoryWindow(scope: string, from: string, to: string): Promise<{ result_digits: string; date_et: string }[]> {
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const all: { result_digits: string; date_et: string }[] = [];
  const PAGE = 1000;
  for (let off = 0; off < 100000; off += PAGE) {
    const page = await sbGet<any[]>(
      `/histories?date_et=gte.${from}&date_et=lte.${to}${sessionClause}` +
      `&select=result_digits,date_et&order=date_et.desc&limit=${PAGE}&offset=${off}`,
    );
    if (!Array.isArray(page) || page.length === 0) break;
    for (const r of page) {
      if (typeof r?.result_digits === 'string' && /^\d{3}$/.test(r.result_digits) && typeof r?.date_et === 'string') {
        all.push({ result_digits: r.result_digits, date_et: r.date_et });
      }
    }
    if (page.length < PAGE) break;
  }
  return all;
}

// ── Dataset builders (same shapes as compute-daily-auc) ──────────────────────

function buildBoxData(boxRows: any[]) {
  const timesDrawnMap = new Map<string, number>();
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
  }
  return { timesDrawnMap, boxByHorizon };
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

// ── AUC (mid-rank tie handling, identical math to compute-daily-auc) ─────────

function computeAUC(items: { score: number; hit: boolean }[]): { auc: number; nHits: number } | null {
  const nHits = items.filter(x => x.hit).length;
  const nMisses = items.length - nHits;
  if (nHits === 0 || nMisses === 0) return null;
  const sorted = [...items].sort((a, b) => a.score - b.score);
  let tieMissBuffer = 0;
  let prevScore: number | null = null;
  let scoreLessMisses = 0;
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
  return { auc: sum / (nHits * nMisses), nHits };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = args.from ?? '2026-05-13';
  const to = args.to ?? '2026-06-09';
  const scopes = args.scope ? [args.scope as Scope] : SCOPES;
  const days = dateRangeInclusive(from, to);
  const LOOKBACK_DAYS = 365;
  const histFrom = new Date(new Date(from + 'T00:00:00Z').getTime() - LOOKBACK_DAYS * 86400000)
    .toISOString().split('T')[0];

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('  CENTRALITY-AUC: does "all data points near their average" predict? (read-only)');
  console.log(`  Window: ${from} → ${to} (${days.length} days), scopes: ${scopes.join(', ')}`);
  console.log('  CEN_RAW/CEN_SIG = exp(-mean z²) across features; high = dead-average combo.');
  console.log('  Fair-draw null hypothesis: singles-stratum AUC = 0.500 for every signal.');
  console.log('═══════════════════════════════════════════════════════════════');

  // Universe combosets with multiplicity, deduped.
  const universe = buildUniverse();
  const combosets: { combo: string; cs: string; mult: ReturnType<typeof multiplicityOf> }[] = [];
  const seen = new Set<string>();
  for (const combo of universe) {
    const cs = toComboSet(combo);
    if (seen.has(cs)) continue;
    seen.add(cs);
    combosets.push({ combo, cs, mult: multiplicityOf(combo) });
  }

  // Accumulator: scope → signal → stratum → per-day AUC list.
  const acc = new Map<string, number[]>();
  const key = (sc: Scope, sig: Signal, st: Stratum) => `${sc}|${sig}|${st}`;

  for (const scope of scopes) {
    console.log(`\n── ${scope}: fetching datasets + ${histFrom}…${to} histories…`);
    const [boxRows, pairRows, histRows] = await Promise.all([
      fetchBoxRows(scope),
      fetchPairRows(scope),
      fetchHistoryWindow(scope, histFrom, to),
    ]);
    console.log(`   box=${boxRows.length} pair=${pairRows.length} hist=${histRows.length}`);
    if (boxRows.length === 0) { console.warn(`   no box data — skipping ${scope}`); continue; }

    const { timesDrawnMap, boxByHorizon } = buildBoxData(boxRows);
    const pairMetaMap = buildPairMetaMap(pairRows);
    let maxTimesDrawn = 0;
    for (const td of timesDrawnMap.values()) if (td > maxTimesDrawn) maxTimesDrawn = td;
    let maxPairTimesDrawn = 0;
    for (const cm of pairMetaMap.values()) for (const m of cm.values()) {
      if (m.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = m.timesDrawn;
    }
    const bw = BOX_WEIGHTS[scope];

    // Pre-index history rows by date for fast per-day slicing.
    const rowsByDate = new Map<string, string[]>(); // date → result_digits[]
    for (const r of histRows) {
      const arr = rowsByDate.get(r.date_et) ?? [];
      arr.push(r.result_digits);
      rowsByDate.set(r.date_et, arr);
    }
    const sortedDates = [...rowsByDate.keys()].sort();

    for (const day of days) {
      const hitOnDay = new Set<string>((rowsByDate.get(day) ?? []).map(toComboSet));
      if (hitOnDay.size === 0) continue; // no draws that day for this scope

      // As-of state strictly BEFORE `day`: dsOverride (most recent prior hit,
      // in days) + DGC hit-date pool. Leakage-free by construction.
      const dayMs = new Date(day + 'T00:00:00Z').getTime();
      const dsOverride = new Map<string, number>();
      const hitDatesMap = new Map<string, number[]>();
      for (const d of sortedDates) {
        if (d >= day) break;
        const dMs = new Date(d + 'T00:00:00Z').getTime();
        for (const digits of rowsByDate.get(d)!) {
          const cs = toComboSet(digits);
          const ds = Math.max(0, Math.round((dayMs - dMs) / 86400000));
          const prev = dsOverride.get(cs);
          if (prev == null || ds < prev) dsOverride.set(cs, ds);
          const arr = hitDatesMap.get(cs) ?? [];
          arr.push(Math.floor(dMs / 86400000));
          hitDatesMap.set(cs, arr);
        }
      }

      // Score every comboset. Capture the engine signals AND the raw feature
      // vector the centrality construct needs (box_ds, box_td, pair_ds, pair_td).
      type Row = {
        mult: string; hit: boolean;
        BOX: number; PBURST: number; CO: number; DGC: number;
        CEN_RAW: number; CEN_SIG: number;
        boxDs: number; boxTd: number; pairDs: number; pairTd: number;
      };
      const scored: Row[] = [];
      for (const { combo, cs, mult } of combosets) {
        const [a, b, c] = combo;
        const ab = sortedPair(a, b);
        const bc = sortedPair(b, c);
        const ac = sortedPair(a, c);

        const td = timesDrawnMap.get(cs) ?? 0;
        // As-of pressure input: exact history-derived days-since wins over the
        // dataset value (which reflects today's rebuild → forward leakage).
        const dsDataset = blendBoxDsRaw(cs, boxByHorizon, HORIZON_WEIGHTS);
        const ds = dsOverride.get(cs) ?? dsDataset;
        const box = td > 0
          ? computeBoxSignal(td, ds, maxTimesDrawn, PRESSURE_THRESHOLD, bw.freq, bw.pressure)
          : 0;

        const pburst = [2, 3, 4].reduce((s, cid, i) => {
          const meta = pairMetaMap.get([ab, bc, ac][i])?.get(cid);
          return s + (meta ? computePairSignal(meta, maxPairTimesDrawn) : 0);
        }, 0) / 3;

        let coSum = 0;
        for (const cid of [5, 6, 7, 8, 9, 10, 11]) {
          for (const pk of [ab, bc, ac]) {
            const meta = pairMetaMap.get(pk)?.get(cid);
            coSum += meta ? computePairSignal(meta, maxPairTimesDrawn) : 0;
          }
        }

        // Raw pair features: mean drawsSince / timesDrawn over the 3 pairs'
        // PBURST-class (2/3/4) metas. Missing meta → buildPairMetaMap defaults
        // (drawsSince 500, timesDrawn 0).
        let pdSum = 0, ptSum = 0, pn = 0;
        for (const cid of [2, 3, 4]) {
          for (const pk of [ab, bc, ac]) {
            const meta = pairMetaMap.get(pk)?.get(cid);
            pdSum += meta?.drawsSince ?? 500;
            ptSum += meta?.timesDrawn ?? 0;
            pn++;
          }
        }

        scored.push({
          mult,
          hit: hitOnDay.has(cs),
          BOX: box,
          PBURST: pburst,
          CO: coSum / 21,
          DGC: computeDGC(hitDatesMap.get(cs) ?? []),
          CEN_RAW: 0, CEN_SIG: 0,           // filled in the centrality pass below
          boxDs: ds, boxTd: td, pairDs: pdSum / pn, pairTd: ptSum / pn,
        });
      }

      // ── Centrality pass: z-score each feature across the full universe this
      //    day, then centrality = exp(-mean z²). Higher = closer to the centroid
      //    on every axis ("all data points closest to their average").
      const rawFeats: (keyof Row)[] = ['boxDs', 'boxTd', 'pairDs', 'pairTd'];
      const sigFeats: (keyof Row)[] = ['BOX', 'PBURST', 'CO', 'DGC'];
      const stats = (feats: (keyof Row)[]) =>
        feats.map(f => ({ f, ...meanStd(scored.map(r => r[f] as number)) }));
      const rawStats = stats(rawFeats);
      const sigStats = stats(sigFeats);
      const centrality = (r: Row, st: { f: keyof Row; mean: number; std: number }[]) => {
        let sumZ2 = 0;
        for (const { f, mean, std } of st) {
          const z = std > 0 ? ((r[f] as number) - mean) / std : 0;
          sumZ2 += z * z;
        }
        return Math.exp(-sumZ2 / st.length);
      };
      for (const r of scored) {
        r.CEN_RAW = centrality(r, rawStats);
        r.CEN_SIG = centrality(r, sigStats);
      }

      for (const sig of SIGNALS) {
        for (const st of STRATA) {
          const pool = st === 'pooled' ? scored : scored.filter(x => x.mult === st);
          const r = computeAUC(pool.map(x => ({ score: x[sig], hit: x.hit })));
          if (r) {
            const k = key(scope, sig, st);
            (acc.get(k) ?? acc.set(k, []).get(k)!).push(r.auc);
          }
        }
      }
    }
    console.log(`   ${scope} done.`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n═══════════════ RESULTS — mean per-day AUC vs 0.500 ═══════════════');
  console.log('  scope    signal  stratum   days   meanAUC      sd    t-stat');
  console.log('  ─────────────────────────────────────────────────────────────');
  for (const scope of scopes) {
    for (const sig of SIGNALS) {
      for (const st of STRATA) {
        const arr = acc.get(key(scope, sig, st));
        if (!arr || arr.length < 2) continue;
        const n = arr.length;
        const mean = arr.reduce((s, v) => s + v, 0) / n;
        const sd = Math.sqrt(arr.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1));
        const t = sd > 0 ? (mean - 0.5) / (sd / Math.sqrt(n)) : 0;
        const flag = Math.abs(t) >= 2.8 ? (mean > 0.5 ? ' ↑↑' : ' ↓↓') : Math.abs(t) >= 2.0 ? (mean > 0.5 ? ' ↑' : ' ↓') : '';
        console.log(
          `  ${scope.padEnd(8)} ${sig.padEnd(7)} ${st.padEnd(8)} ${String(n).padStart(4)}   ` +
          `${mean.toFixed(4)}  ${sd.toFixed(4)}  ${t >= 0 ? '+' : ''}${t.toFixed(2)}${flag}`,
        );
      }
      console.log('');
    }
  }
  console.log('  Interpretation: singles stratum is the fair test (all 120 combosets');
  console.log('  equiprobable under fair draws). |t| ≥ 2.8 ≈ p < .01 two-sided. Pooled');
  console.log('  stratum includes the mechanical multiplicity confound — reference only.');
  console.log('═════════════════════════════════════════════════════════════════════\n');
}

main().catch(err => { console.error('fatal:', err); process.exit(1); });
