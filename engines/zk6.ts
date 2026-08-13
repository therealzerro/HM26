/**
 * ZK6 Engine v2.1
 *
 * Fixes over v2.0:
 *  - Fetches ALL horizons (H01Y–H10Y), not just H01Y
 *  - Blends signals across horizons using HORIZON_WEIGHTS decay
 *  - CO signal uses pair classes 5–11 (was class 11 only)
 *  - Same-day exclusion is built into computeSlate (no longer caller's burden)
 *  - mode / engineVersion / source / confidence / dataStats stored in snapshot
 *  - energy = true percentile rank (0–100), not raw indicator × 100
 *  - bestOrder computed from blended pair data across all horizons
 */

import { Scope, SlateSnapshot, SlateDataStats, EngineMetadata } from '@/types/core';
import { getTodayET, getDaysAgoET } from '@/lib/dateUtils';
import { K6_QUOTAS, PAIR_REPETITION_CAP } from '@/constants/zk6';
import { fetchFromSupabase } from '@/lib/supabase';
import { adminOpsFetch } from '@/lib/adminOps';
import {
  H_ALL,
  HORIZON_WEIGHTS,
  MULTIPLICITY_PRIORS,
  toComboSet,
  sortedPair,
  multiplicityOf,
  topPairOf,
  buildUniverse,
  normalizeBoxKey,
  normalizePairKey,
  DGC_REF_STD_DEV,
  computeDGC,
  percentileRankOf,
  maxNorm,
  computeSlateHash,
  computeConfidenceScore,
  computeBoxSignalDetailed,
  blendBoxDsRaw,
  blendBoxTimesDrawn,
  blendPairTimesDrawn,
  getPairSignalFromMap,
  bestOrderFor,
  intelligenceRowExtras,
  computeAdaptiveWeights,
  computeWeightedScore,
  buildWarmingMap,
  buildPressureScaleCtx,
  buildStateStrengthMap,
  type PairTimesDrawnTree,
  type SignalAuc,
  type PressureScaleMode,
  type StateHistoryRow,
} from '@/lib/engineCore';

const ENGINE_VERSION = 'v2.1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeSlateParams {
  scope: Scope;
  /** @deprecated SCRUB-01 (2026-05-27): only 'balanced' is consumed in production.
   *  Param retained for caller compatibility but the value is ignored. */
  weightsKey?: 'balanced';
  targetDate?: string;
  /** Pre-built exclusion set from caller. When provided, internal histories
   *  query is skipped unless skipHistoriesExclusion = false is explicit. */
  excludedCombos?: Set<string>;
  /** Set true when the caller has already supplied exclusions and wants to
   *  avoid the additional histories round-trip inside computeSlate. */
  skipHistoriesExclusion?: boolean;
  /** ComboSets (e.g. "{1,2,3}") to exclude from K6 selection. Used for
   *  supplemental slates generated after hit detection. */
  excludeComboSets?: string[];
  /** Mark this slate as a post-hit supplemental (stores file_meta + _is_supplement flag). */
  is_supplement?: boolean;
}

// boxByHorizon: horizonLabel → (comboSetKey → raw draws_since)
type BoxByHorizon = Map<string, Map<string, number>>;

// pairData: pairKey → classId → horizonLabel → raw ds_raw
type PairTree = Map<string, Map<number, Map<string, number>>>;

interface PairMeta { dsRaw: number; drawsSince: number; timesDrawn: number; }

interface Datasets {
  boxByHorizon: BoxByHorizon;
  // ENH-TDB (2026-05-27): per-horizon BOX times_drawn (parallel to boxByHorizon)
  // for horizon-blended frequency scoring. Legacy timesDrawnMap stays — MAX
  // across horizons — used as the placeholder-vs-real gate. Scoring uses the
  // blend when `box_times_drawn_blend_enabled` is true (CONFIG-08).
  boxTimesDrawnByHorizon: Map<string, Map<string, number>>;
  pairData: PairTree;
  pairTimesDrawnByHorizon: PairTimesDrawnTree;
  pairMetaMap: Map<string, Map<number, PairMeta>>;
  drawsSinceMap: Map<string, number>;   // comboSetKey → draws_since (H01Y preferred)
  dsRawMap: Map<string, number>;        // comboSetKey → ds_raw (H01Y preferred)
  timesDrawnMap: Map<string, number>;
  lastSeenMap: Map<string, string>;
  horizonsPresent: Record<string, boolean>;
  horizonsLoaded: string[];
  usingFallback: boolean;
  boxRowCount: number;
  pairRowCount: number;
  rawBoxRows: any[];
}

// ─── Utilities ────────────────────────────────────────────────────────────────

export function normalizeScope(s: string): Scope {
  const v = String(s ?? '').toLowerCase().replace(/[-\s_]/g, '');
  if (v === 'midday') return 'midday';
  if (v === 'evening') return 'evening';
  return 'allday';
}

/**
 * ENG-DEEPSCOPE-01 P3/D3 (2026-08-13): strict variant for WRITE paths.
 * normalizeScope's silent anything→allday default is fine for display reads,
 * but computeSlate WRITES: a typo'd scope would soft-delete and replace the
 * real allday snapshot + daily_intelligence for the day. Returns null instead
 * of guessing; computeSlate throws before touching any data.
 */
export function normalizeScopeStrict(s: string): Scope | null {
  const v = String(s ?? '').toLowerCase().replace(/[-\s_]/g, '');
  if (v === 'midday' || v === 'evening' || v === 'allday') return v;
  return null;
}

export let lastScopeFallback: string | null = null;


// ─── Data Fetch ───────────────────────────────────────────────────────────────

async function fetchRaw(scopeEnc: string): Promise<{ boxRows: any[]; pairRows: any[] }> {
  // Fetch box data per-horizon in parallel — PostgREST caps single queries at
  // 1000 rows. The national box slice is 220 COMBOSET rows per horizon per
  // scope (live-counted 2026-08-13, ENG-DEEPSCOPE-01 §A3 — an earlier comment
  // here claimed "1000 combos × 10 horizons", which was never the post-rebuild
  // shape). Per-horizon fetches keep each response at 220 rows, 4.5× under
  // the cap, so all 10 horizons load regardless of server limit.
  const boxHorizonFetches = H_ALL.map(h =>
    fetchFromSupabase<any[]>({
      path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${scopeEnc}` +
            `&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=is.null` +
            `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
    }).then(rows => Array.isArray(rows) ? rows : []),
  );

  // BUG-153: PostgREST caps single REST responses at 1000 rows regardless of
  // client `limit`. The pair fetch was returning ~1000 of 1370+ rows per scope,
  // silently dropping the highest-class / oldest-horizon rows. Paginate via
  // offset until a page returns fewer than pageSize rows.
  // BUG-166: every paginated order MUST carry a unique key — unordered (or
  // date_et-only) pagination has unspecified tie order at page boundaries, so
  // rows get dropped/duplicated after heap churn (the BUG-163 mechanism).
  const fetchPairRowsPaginated = async (): Promise<any[]> => {
    const all: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=is.null` +
              `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label` +
              `&order=id.asc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(page) ? page : [];
      all.push(...arr);
      if (arr.length < pageSize) break;
    }
    return all;
  };

  const [boxByHorizonArrays, pairRows] = await Promise.all([
    Promise.all(boxHorizonFetches),
    fetchPairRowsPaginated(),
  ]);

  return {
    boxRows: boxByHorizonArrays.flat(),
    pairRows,
  };
}

async function fetchDatasets(scope: Scope): Promise<Datasets> {
  const normalized = normalizeScope(scope);
  const enc = encodeURIComponent(normalized);
  const timeout = new Promise<never>((_, r) =>
    setTimeout(() => r(new Error('ZK6 fetch timeout (20s)')), 20000),
  );

  console.log('[zk6v2] Fetching all horizons for scope:', normalized);

  let { boxRows, pairRows } = await Promise.race([fetchRaw(enc), timeout]);
  let usingFallback = false;

  if (boxRows.length < 50 && normalized !== 'allday') {
    console.log('[zk6v2] Sparse data for', normalized, '(', boxRows.length, 'rows) — falling back to allday');
    lastScopeFallback = normalized;
    usingFallback = true;
    const fb = await Promise.race([fetchRaw(encodeURIComponent('allday')), timeout]);
    boxRows = fb.boxRows;
    pairRows = fb.pairRows;
  } else {
    lastScopeFallback = null;
  }

  console.log('[zk6v2] Raw fetched:', { boxRows: boxRows.length, pairRows: pairRows.length });

  // ── Build boxByHorizon ────────────────────────────────────────────────────────
  const boxByHorizon: BoxByHorizon = new Map();
  const boxTimesDrawnByHorizon = new Map<string, Map<string, number>>();
  const drawsSinceMap = new Map<string, number>();
  const dsRawMap = new Map<string, number>();
  const timesDrawnMap = new Map<string, number>();
  const lastSeenMap = new Map<string, string>();

  for (const row of boxRows) {
    if (!row || typeof row.key !== 'string') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const rawDs: number =
      typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const rawTd: number =
      typeof row.times_drawn === 'number' ? row.times_drawn : 0;

    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, rawDs);

    if (!boxTimesDrawnByHorizon.has(h)) boxTimesDrawnByHorizon.set(h, new Map());
    boxTimesDrawnByHorizon.get(h)!.set(normKey, rawTd);

    // Always take MAX timesDrawn across all rows for this normKey — multiple raw-combo
    // permutations (e.g. "398", "839", "983") all map to the same comboset "{3,8,9}".
    // Only one permutation gets updated with real data; the others remain 0. Using MAX
    // ensures the real value wins regardless of row ordering. Kept under
    // CONFIG-08 as the placeholder-vs-real gate even when the blend path is on.
    if (row.times_drawn != null && row.times_drawn > (timesDrawnMap.get(normKey) ?? 0)) {
      timesDrawnMap.set(normKey, row.times_drawn);
    }

    // Prefer H01Y for drawsSince/dsRaw metadata; within H01Y prefer non-zero over zero.
    const dsRawVal = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    if (h === 'H01Y' || !drawsSinceMap.has(normKey)) {
      const existingDs = dsRawMap.get(normKey) ?? 0;
      if (existingDs === 0 || dsRawVal > 0) {
        drawsSinceMap.set(normKey, rawDs);
        dsRawMap.set(normKey, dsRawVal);
      }
    }

    // lastSeen: MAX-wins across all horizons (most recent draw is the truth).
    // Parity with compute-slate-zk6 — prior H01Y-first-wins logic could mask a
    // newer last_seen surfacing only in a longer horizon.
    const ls = typeof row.last_seen === 'string' ? row.last_seen : null;
    if (ls && (!lastSeenMap.has(normKey) || ls > lastSeenMap.get(normKey)!)) {
      lastSeenMap.set(normKey, ls);
    }
  }

  console.log('[ZK6-DIAG] timesDrawnMap.size:',
    timesDrawnMap.size,
    'sample:',
    JSON.stringify(Array.from(timesDrawnMap.entries()).slice(0,3))
  )

  // ── Build pairData ────────────────────────────────────────────────────────────
  const pairData: PairTree = new Map();
  const pairTimesDrawnByHorizon: PairTimesDrawnTree = new Map();
  const pairMetaMap = new Map<string, Map<number, PairMeta>>();

  for (const row of pairRows) {
    if (!row || typeof row.class_id !== 'number') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const rawPairKey = row.key_pair ?? row.key;
    const pairKey = normalizePairKey(rawPairKey);
    const ds: number = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const rawTd: number = typeof row.times_drawn === 'number' ? row.times_drawn : 0;

    if (!pairData.has(pairKey)) pairData.set(pairKey, new Map());
    const classMap = pairData.get(pairKey)!;
    if (!classMap.has(row.class_id)) classMap.set(row.class_id, new Map());
    classMap.get(row.class_id)!.set(h, ds);

    // ENH-TDB (CONFIG-08): per-horizon pair times_drawn tree, parallel to pairData.
    if (!pairTimesDrawnByHorizon.has(pairKey)) pairTimesDrawnByHorizon.set(pairKey, new Map());
    const tdClassMap = pairTimesDrawnByHorizon.get(pairKey)!;
    if (!tdClassMap.has(row.class_id)) tdClassMap.set(row.class_id, new Map());
    tdClassMap.get(row.class_id)!.set(h, rawTd);

    // Build pairMetaMap — H01Y preferred for draws_since/times_drawn metadata.
    // Legacy path; superseded by blendPairTimesDrawn when CONFIG-08 flag is on.
    if (h === 'H01Y' || !pairMetaMap.get(pairKey)?.has(row.class_id)) {
      if (!pairMetaMap.has(pairKey)) pairMetaMap.set(pairKey, new Map());
      pairMetaMap.get(pairKey)!.set(row.class_id, {
        dsRaw: typeof row.ds_raw === 'number' ? row.ds_raw : 0,
        drawsSince: typeof row.ds_raw === 'number' ? row.ds_raw : 500,
        timesDrawn: rawTd,
      });
    }
  }

  // ── Horizons present ──────────────────────────────────────────────────────────
  // A horizon is present if ANY row exists for it (including backfilled zeros).
  const horizonsPresent: Record<string, boolean> = {};
  const horizonsLoaded: string[] = [];
  for (const h of H_ALL) {
    const has = (boxByHorizon.get(h)?.size ?? 0) > 0;
    horizonsPresent[h] = has;
    if (has) horizonsLoaded.push(h);
  }
  // If all 10 horizons are present, ensure horizonsLoaded reflects this
  // even when some only have backfilled (ds_raw=0) rows.
  if (horizonsLoaded.length === H_ALL.length) {
    // Already complete — no change needed
  }

  console.log('[zk6v2] Datasets loaded:', {
    horizonsLoaded,
    boxTotalRows: boxRows.length,
    pairTotalRows: pairRows.length,
    usingFallback,
    h01YBoxSize: boxByHorizon.get('H01Y')?.size ?? 0,
  });

  return {
    boxByHorizon, boxTimesDrawnByHorizon, pairData, pairTimesDrawnByHorizon,
    pairMetaMap, drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap,
    horizonsPresent, horizonsLoaded, usingFallback,
    boxRowCount: boxRows.length, pairRowCount: pairRows.length,
    rawBoxRows: boxRows,
  };
}

// ─── Blending Helpers ─────────────────────────────────────────────────────────
// All blending lives in lib/engineCore — blendBoxDsRaw (per-combo box ds_raw)
// and blendPairAcrossHorizons (per-pair ds_raw, called via bestOrderFor).


// ─── History overrides ────────────────────────────────────────────────────────
// datasets_box.draws_since / last_seen are only updated on file imports, not from
// live results. Query histories to get the actual last-hit date and draws count
// so that a combo that just drew (like 2 days ago) isn't ranked as overdue.

/**
 * ENH-WARMING-2026-06-06: fetch cross-jurisdiction draws within the prior
 * N-day window. NO session filter — warming counts every national draw in
 * the window across midday/evening/morning/night. Used only when the engine
 * config sets a non-zero warming weight; returns empty array on error
 * (engine falls back to no boost — bit-identical to pre-WARMING behavior).
 */
async function fetchWarmingHistory(
  todayEt: string,
  windowDays: number,
): Promise<{ comboset_sorted: string; date_et: string }[]> {
  try {
    const todayDate = new Date(todayEt + 'T12:00:00');
    todayDate.setDate(todayDate.getDate() - windowDays);
    const fromDate = todayDate.toISOString().split('T')[0];
    const all: { comboset_sorted: string; date_et: string }[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?select=comboset_sorted,date_et` +
          `&date_et=gte.${fromDate}&date_et=lt.${todayEt}` +
          `&order=date_et.desc,id.desc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(page) ? page : [];
      for (const r of arr) {
        if (r && typeof r.comboset_sorted === 'string' && typeof r.date_et === 'string') {
          all.push({ comboset_sorted: r.comboset_sorted, date_et: r.date_et });
        }
      }
      if (arr.length < pageSize) break;
    }
    return all;
  } catch {
    return [];
  }
}

/**
 * ENH-AUDIT v2 STATE_STR (2026-06-10): per-jurisdiction history window for the
 * state-strength channel. Same pagination/shape as fetchWarmingHistory plus
 * the jurisdiction column. All sessions count. Fetched only when the
 * effective STATE_STR weight is non-zero (zero added latency when off);
 * failure returns [] and the engine falls back to no boost (bit-identical).
 */
async function fetchStateStrengthHistory(
  todayEt: string,
  windowDays: number,
): Promise<StateHistoryRow[]> {
  try {
    const todayDate = new Date(todayEt + 'T12:00:00');
    todayDate.setDate(todayDate.getDate() - windowDays);
    const fromDate = todayDate.toISOString().split('T')[0];
    const all: StateHistoryRow[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?select=comboset_sorted,jurisdiction,date_et` +
          `&date_et=gte.${fromDate}&date_et=lt.${todayEt}` +
          `&order=date_et.desc,id.desc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(page) ? page : [];
      for (const r of arr) {
        if (r && typeof r.comboset_sorted === 'string' && typeof r.date_et === 'string') {
          all.push({ comboset_sorted: r.comboset_sorted, jurisdiction: r.jurisdiction ?? null, date_et: r.date_et });
        }
      }
      if (arr.length < pageSize) break;
    }
    return all;
  } catch {
    return [];
  }
}

/**
 * ENG-STATE-DATA-05 (2026-06-09): for each comboSet seen nationally in the
 * prior N-day window, bucket the per-jurisdiction hit counts so the slate
 * output can carry "top states this combo hit in" + total recent hit count.
 *
 * Pure metadata. Does NOT influence selection, sorting, or scoring. Failure
 * returns an empty Map and the engine falls back to picks-without-state-data.
 *
 * Pagination matches fetchWarmingHistory pattern (PostgREST 1000-row cap).
 */
interface StateAgg { totalHits: number; byState: Map<string, number> }
async function fetchStateAggregation(
  todayEt: string,
  windowDays: number,
): Promise<Map<string, StateAgg>> {
  const out = new Map<string, StateAgg>();
  try {
    const todayDate = new Date(todayEt + 'T12:00:00');
    todayDate.setDate(todayDate.getDate() - windowDays);
    const fromDate = todayDate.toISOString().split('T')[0];
    const pageSize = 1000;
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?select=comboset_sorted,jurisdiction` +
          `&date_et=gte.${fromDate}&date_et=lt.${todayEt}` +
          `&order=date_et.desc,id.desc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(page) ? page : [];
      for (const r of arr) {
        if (!r || typeof r.comboset_sorted !== 'string') continue;
        const cs = r.comboset_sorted;
        let agg = out.get(cs);
        if (!agg) {
          agg = { totalHits: 0, byState: new Map() };
          out.set(cs, agg);
        }
        agg.totalHits += 1;
        if (typeof r.jurisdiction === 'string' && r.jurisdiction) {
          agg.byState.set(r.jurisdiction, (agg.byState.get(r.jurisdiction) ?? 0) + 1);
        }
      }
      if (arr.length < pageSize) break;
    }
  } catch (e) {
    console.log('[zk6v2] state-agg fetch warn (non-fatal):', e);
  }
  return out;
}

/**
 * ENG-STATE-DATA-05: brand-safe tag per display position.
 * Strings stored as lowercase metadata; UI maps to localized display copy.
 */
function tagForPosition(pos: number): 'overdue' | 'strong' | 'depth' {
  if (pos === 1) return 'overdue';
  if (pos <= 3) return 'strong';
  return 'depth';
}

/**
 * ENG-SLATE-METRICS-06 (2026-06-09): per-scope recent slate-level match rates.
 * Bucket on-slate daily_intelligence rows by slate_date, find max(hit) per
 * slate, average over 7d and 30d windows. Pure read-only metadata for
 * subscriber/operator context. Defensive: null on failure.
 */
interface SlateMatchRates { recent7dMatchRatePct: number | null; recent30dMatchRatePct: number | null; slates7d: number; slates30d: number }
async function fetchRecentSlateMatchRates(
  scope: Scope,
  todayEt: string,
): Promise<SlateMatchRates> {
  const def: SlateMatchRates = { recent7dMatchRatePct: null, recent30dMatchRatePct: null, slates7d: 0, slates30d: 0 };
  try {
    const todayDate = new Date(todayEt + 'T12:00:00');
    todayDate.setDate(todayDate.getDate() - 30);
    const fromDate = todayDate.toISOString().split('T')[0];
    const sevenDaysAgoDate = new Date(todayEt + 'T12:00:00');
    sevenDaysAgoDate.setDate(sevenDaysAgoDate.getDate() - 7);
    const sevenDaysAgo = sevenDaysAgoDate.toISOString().split('T')[0];
    const rows = await fetchFromSupabase<any[]>({
      path: `/rest/v1/daily_intelligence?scope=eq.${encodeURIComponent(scope)}` +
        `&mode=eq.balanced&on_slate=eq.true` +
        `&slate_date=gte.${fromDate}&slate_date=lt.${todayEt}` +
        `&select=slate_date,hit_box,hit_straight&limit=1000`,
    });
    if (!Array.isArray(rows)) return def;
    const perSlate = new Map<string, boolean>();
    for (const r of rows) {
      if (typeof r?.slate_date !== 'string') continue;
      const hit = !!r.hit_box || !!r.hit_straight;
      perSlate.set(r.slate_date, (perSlate.get(r.slate_date) ?? false) || hit);
    }
    let slates7d = 0, hits7d = 0, slates30d = 0, hits30d = 0;
    for (const [date, hit] of perSlate) {
      slates30d++;
      if (hit) hits30d++;
      if (date >= sevenDaysAgo) {
        slates7d++;
        if (hit) hits7d++;
      }
    }
    return {
      recent7dMatchRatePct: slates7d > 0 ? Math.round((hits7d / slates7d) * 1000) / 10 : null,
      recent30dMatchRatePct: slates30d > 0 ? Math.round((hits30d / slates30d) * 1000) / 10 : null,
      slates7d,
      slates30d,
    };
  } catch (e) {
    console.log('[zk6v2] slate-metrics fetch warn (non-fatal):', e);
    return def;
  }
}

async function fetchHistoryOverrides(scope: Scope): Promise<{
  dsOverride: Map<string, number>;
  lsOverride: Map<string, string>;
  hitDatesMap: Map<string, number[]>;
}> {
  try {
    const sessionClause = scope === 'allday' ? '' : `&session=eq.${encodeURIComponent(scope)}`;
    // BUG-152: PostgREST caps responses at 1000 rows regardless of client `limit`.
    // Paginate via offset until a page returns fewer than pageSize rows.
    const rows: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?select=result_digits,date_et${sessionClause}&order=date_et.desc,id.desc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(page) ? page : [];
      rows.push(...arr);
      if (arr.length < pageSize) break;
    }
    if (rows.length === 0) return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };
    const dsOverride = new Map<string, number>();
    const lsOverride = new Map<string, string>();
    const hitDatesMap = new Map<string, number[]>();
    // ENG-DEEPSCOPE-01 P3/D1 (2026-08-13): anchored to the ET calendar day,
    // VERBATIM parity with compute-slate-zk6 (index.ts fetchHistoryOverrides).
    // The prior Math.floor(Date.now()/86400000) was a UTC-day anchor that
    // incremented at 8PM ET — this map feeds the cooldown gate AND the K6
    // reorder's primary sort key (ds desc), so an evening run on this fallback
    // path could order the same six picks differently than the edge.
    const todayMs = new Date(getTodayET() + 'T00:00:00').getTime();
    rows.forEach((row) => {
      if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) return;
      const cs = toComboSet(row.result_digits);
      if (!dsOverride.has(cs)) {
        const rowMs = row.date_et ? new Date(String(row.date_et)).getTime() : 0;
        const actualDs = rowMs > 0 ? Math.max(0, Math.round((todayMs - rowMs) / 86400000)) : 999;
        dsOverride.set(cs, actualDs);
        lsOverride.set(cs, String(row.date_et));
      }
      if (row.date_et) {
        const dayOffset = Math.floor(new Date(String(row.date_et)).getTime() / 86400000);
        const dates = hitDatesMap.get(cs) ?? [];
        dates.push(dayOffset);
        hitDatesMap.set(cs, dates);
      }
    });
    return { dsOverride, lsOverride, hitDatesMap };
  } catch {
    return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };
  }
}


// ─── Dynamic config loading from app_config ───────────────────────────────────

type WeightSet = { BOX: number; PBURST: number; CO: number; DGC: number };
// SCRUB-01 (2026-05-27): production is balanced-only while in deep live testing.
// Conservative/aggressive removed from production code paths. Harness retains
// all 3 modes for legacy reproducibility. app_config rows for conservative /
// aggressive are kept for rollback safety until 2026-06-03 review.
type WeightPresets = { balanced: WeightSet };

interface RailConfig {
  singlesMax: number;
  doublesMax: number;
  triplesOn: boolean;
  pairRepCap: number;
}

const DEFAULT_WEIGHTS: WeightPresets = {
  balanced: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
};

const DEFAULT_RAILS: RailConfig = {
  singlesMax: K6_QUOTAS.singles,
  doublesMax: K6_QUOTAS.doubles,
  triplesOn:  K6_QUOTAS.triples > 0,
  pairRepCap: PAIR_REPETITION_CAP,
};

interface EngineConfig {
  presets: WeightPresets;
  rails: RailConfig;
  pressureThreshold: number;
  minEnergyThreshold: number;
  recentHitCooldown: number;
  synergyOn: boolean;
  synergyWeight: number;
  // ENH-HW (2026-05-13): per-horizon weights for BOX dsRaw blend. Defaults to
  // hardcoded HORIZON_WEIGHTS; admin can override via app_config.horizon_weights
  // (stored as percentages, converted to decimals on load).
  horizonWeights: Record<string, number>;
  // ENH-BP / CONFIG-02 (2026-05-14): BOX freq/pressure split. Production defaults
  // preserve the prior hardcoded 60/40 ratio. 30-day backtest showed pressure
  // is anti-correlated with results on midday (pick lift 0.50× vs baseline);
  // production deploys negative pressure weight on midday + evening via the
  // per-scope override below. allday stays at +0.40 (pressure helps when K is
  // large). Effective resolution: byScope > global > default (0.60 / 0.40).
  boxFreqWeight: number;
  boxPressureWeight: number;
  /** Resolved per-scope BOX freq weight — set at load time, undefined if no scope override. */
  effectiveBoxFreqWeight?: number;
  /** Resolved per-scope BOX pressure weight — set at load time, undefined if no scope override. */
  effectiveBoxPressureWeight?: number;
  // CONFIG-08 (2026-05-27): when true, BOX times_drawn and pair times_drawn
  // honor horizon_weights via blend (blendBoxTimesDrawn + blendPairTimesDrawn).
  // When false, legacy paths: BOX uses MAX across horizons (effectively H02Y),
  // pair uses H01Y row. Read from app_config.box_times_drawn_blend_enabled
  // ('true'/'false' string); defaults to true.
  timesDrawnBlendEnabled: boolean;
  // ENH-AFL-2 (2026-05-27): adaptive signal weights. When enabled, scoring
  // weights are adjusted at slate-gen time using the rolling-30d per-signal
  // AUC from signal_auc_per_day. Default false; flip to true after P2.7
  // backtest validation.
  adaptiveSignalWeightsEnabled: boolean;
  adaptiveSignalWeightsAlpha: number;
  // ENH-WARMING-2026-06-06: 7-day cross-jurisdiction warming signal applied
  // as a post-score additive boost. When effectiveWarmingWeight = 0 (default),
  // bit-identical to pre-WARMING engine. Per-scope override via
  // app_config.warming_weight_${scope}; window from warming_window_days.
  warmingWeight: number;
  effectiveWarmingWeight?: number;
  warmingWindowDays: number;
  // ENG-OBS-05 (2026-06-10): pressure scale mode. 'legacy' = historical 3-branch
  // curve (bit-identical default). 'p95ramp' / 'percentile' recalibrate the
  // pressure channel to the live post-DATA-01 ds_raw distribution. Read from
  // app_config.pressure_scale_mode; ship-gated by backtest (CONFIG-16).
  pressureScaleMode: PressureScaleMode;
  // ENH-AUDIT-2026-05-19 v2 STATE_STR (2026-06-10): per-state pattern-strength
  // channel, post-score additive (warming pattern). Weight 0 (default) =
  // bit-identical 4-channel engine. Keys: state_str_weight (global),
  // state_str_weight_${scope} (override), state_str_half_life_days,
  // state_str_window_days. Ship-gated by backtest per spec.
  stateStrWeight: number;
  effectiveStateStrWeight?: number;
  stateStrHalfLifeDays: number;
  stateStrWindowDays: number;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  presets: DEFAULT_WEIGHTS,
  rails: DEFAULT_RAILS,
  pressureThreshold: 250,
  minEnergyThreshold: 0,
  recentHitCooldown: 20,
  synergyOn: false,
  synergyWeight: 0.15,
  horizonWeights: { ...HORIZON_WEIGHTS },
  boxFreqWeight: 0.60,
  boxPressureWeight: 0.40,
  timesDrawnBlendEnabled: true,
  adaptiveSignalWeightsEnabled: false,
  adaptiveSignalWeightsAlpha: 1.0,
  warmingWeight: 0,
  warmingWindowDays: 7,
  pressureScaleMode: 'legacy',
  stateStrWeight: 0,
  stateStrHalfLifeDays: 14,
  stateStrWindowDays: 60,
};

async function loadEngineConfig(scope?: Scope): Promise<EngineConfig> {
  try {
    // Per-scope cooldown override (2026-05-13 CONFIG-05). When `scope` is passed,
    // also pull `recent_hit_cooldown_${scope}` and overlay it on the global.
    // CONFIG-02 (2026-05-14): same pattern for BOX freq/pressure split — global
    // `box_freq_weight` / `box_pressure_weight` plus per-scope
    // `box_freq_weight_${scope}` / `box_pressure_weight_${scope}` overrides.
    const scopeCooldownKey = scope ? `recent_hit_cooldown_${scope}` : null;
    const scopeBoxFreqKey  = scope ? `box_freq_weight_${scope}`     : null;
    const scopeBoxPressKey = scope ? `box_pressure_weight_${scope}` : null;
    // CONFIG-07 (2026-05-15): per-scope signal-weight overrides. Mirrors the
    // cooldown/freq/pressure per-scope pattern. When set, replaces the preset
    // entirely for that scope. Other scopes still use the global preset.
    // SCRUB-01 (2026-05-27): conservative/aggressive keys no longer consumed
    // in production. The corresponding app_config rows remain for rollback
    // safety until 2026-06-03.
    const scopeBalancedKey = scope ? `engine_weights_balanced_${scope}` : null;
    // ENH-MET (2026-05-18, post engine-split investigation §7): per-scope
    // energy floor override. Investigation Appendix D showed midday picks
    // have ~13-22pp of underperformance beyond what data volume explains;
    // per-scope floor relaxation is a candidate intervention to unlock that
    // headroom without affecting evening/allday (which are at or near their
    // structural ceilings already). Falls back to global min_energy_threshold,
    // then to hardcoded default.
    const scopeMinEnergyKey = scope ? `min_energy_threshold_${scope}` : null;
    // ENH-WARMING-2026-06-06: warming weight per-scope override, plus the
    // shared window-size key. Same resolution as cooldown / freq / pressure.
    const scopeWarmingKey = scope ? `warming_weight_${scope}` : null;
    // ENH-AUDIT v2 STATE_STR (2026-06-10): same per-scope override pattern.
    const scopeStateStrKey = scope ? `state_str_weight_${scope}` : null;
    const keyList = [
      'engine_weights_balanced',
      'k6_singles_max', 'k6_doubles_max', 'k6_triples_on', 'pair_rep_cap',
      'pressure_threshold', 'min_energy_threshold', 'recent_hit_cooldown',
      'synergy_boost_on', 'synergy_boost_weight',
      'horizon_weights',
      'box_freq_weight', 'box_pressure_weight',
      'box_times_drawn_blend_enabled',
      'adaptive_signal_weights_enabled', 'adaptive_signal_weights_alpha',
      'warming_weight', 'warming_window_days',
      'pressure_scale_mode',
      'state_str_weight', 'state_str_half_life_days', 'state_str_window_days',
      ...(scopeStateStrKey ? [scopeStateStrKey] : []),
      ...(scopeCooldownKey ? [scopeCooldownKey] : []),
      ...(scopeBoxFreqKey  ? [scopeBoxFreqKey]  : []),
      ...(scopeBoxPressKey ? [scopeBoxPressKey] : []),
      ...(scopeBalancedKey ? [scopeBalancedKey] : []),
      ...(scopeMinEnergyKey ? [scopeMinEnergyKey] : []),
      ...(scopeWarmingKey ? [scopeWarmingKey] : []),
    ];
    const rows = await fetchFromSupabase<any[]>({
      path: '/rest/v1/app_config?key=in.(' + keyList.join(',') + ')&select=key,value',
    });
    if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_ENGINE_CONFIG;

    const presets: WeightPresets = {
      balanced: { ...DEFAULT_WEIGHTS.balanced },
    };
    const rails: RailConfig = { ...DEFAULT_RAILS };
    let pressureThreshold = 250;
    let minEnergyThreshold = 0;
    let recentHitCooldown = 20;
    let scopeCooldownOverride: number | null = null;
    let synergyOn = false;
    let synergyWeight = 0.15;
    let horizonWeights: Record<string, number> = { ...HORIZON_WEIGHTS };
    let boxFreqWeight = 0.60;
    let boxPressureWeight = 0.40;
    let timesDrawnBlendEnabled = true;
    let adaptiveSignalWeightsEnabled = false;
    let adaptiveSignalWeightsAlpha = 1.0;
    let scopeBoxFreqOverride: number | null = null;
    let scopeBoxPressOverride: number | null = null;
    let scopeBalancedOverride: WeightSet | null = null;
    let scopeMinEnergyOverride: number | null = null;
    let warmingWeight = 0;
    let warmingWindowDays = 7;
    let scopeWarmingOverride: number | null = null;
    let pressureScaleMode: PressureScaleMode = 'legacy';
    let stateStrWeight = 0;
    let stateStrHalfLifeDays = 14;
    let stateStrWindowDays = 60;
    let scopeStateStrOverride: number | null = null;

    for (const row of rows) {
      try {
        if (row.key === 'k6_singles_max')       { const v = parseInt(row.value, 10); if (!isNaN(v)) rails.singlesMax = v; continue; }
        if (row.key === 'k6_doubles_max')       { const v = parseInt(row.value, 10); if (!isNaN(v)) rails.doublesMax = v; continue; }
        if (row.key === 'k6_triples_on')        { rails.triplesOn = row.value === 'true'; continue; }
        if (row.key === 'pair_rep_cap')         { const v = parseInt(row.value, 10); if (!isNaN(v)) rails.pairRepCap = v; continue; }
        if (row.key === 'pressure_threshold')   { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 50) pressureThreshold = v; continue; }
        if (row.key === 'min_energy_threshold') { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) minEnergyThreshold = v; continue; }
        if (row.key === 'recent_hit_cooldown')  { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) recentHitCooldown = v; continue; }
        if (scopeCooldownKey && row.key === scopeCooldownKey) {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 0) scopeCooldownOverride = v;
          continue;
        }
        if (row.key === 'box_freq_weight') {
          const v = parseFloat(row.value);
          if (!isNaN(v)) boxFreqWeight = v;
          continue;
        }
        if (row.key === 'box_pressure_weight') {
          const v = parseFloat(row.value);
          if (!isNaN(v)) boxPressureWeight = v;
          continue;
        }
        if (row.key === 'box_times_drawn_blend_enabled') {
          // String 'true'/'false' (matches the synergy_boost_on pattern).
          // Unknown values fall back to the default (true).
          if (row.value === 'true')  { timesDrawnBlendEnabled = true;  continue; }
          if (row.value === 'false') { timesDrawnBlendEnabled = false; continue; }
          continue;
        }
        if (row.key === 'adaptive_signal_weights_enabled') {
          if (row.value === 'true')  { adaptiveSignalWeightsEnabled = true;  continue; }
          if (row.value === 'false') { adaptiveSignalWeightsEnabled = false; continue; }
          continue;
        }
        if (row.key === 'adaptive_signal_weights_alpha') {
          const v = parseFloat(row.value);
          if (!isNaN(v) && v >= 0 && v <= 2) adaptiveSignalWeightsAlpha = v;
          continue;
        }
        if (scopeBoxFreqKey && row.key === scopeBoxFreqKey) {
          const v = parseFloat(row.value);
          if (!isNaN(v)) scopeBoxFreqOverride = v;
          continue;
        }
        if (scopeBoxPressKey && row.key === scopeBoxPressKey) {
          const v = parseFloat(row.value);
          if (!isNaN(v)) scopeBoxPressOverride = v;
          continue;
        }
        if (scopeMinEnergyKey && row.key === scopeMinEnergyKey) {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 0) scopeMinEnergyOverride = v;
          continue;
        }
        if (row.key === 'warming_weight') {
          const v = parseFloat(row.value);
          if (!isNaN(v) && v >= 0 && v <= 1) warmingWeight = v;
          continue;
        }
        if (row.key === 'warming_window_days') {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 1 && v <= 30) warmingWindowDays = v;
          continue;
        }
        if (scopeWarmingKey && row.key === scopeWarmingKey) {
          const v = parseFloat(row.value);
          if (!isNaN(v) && v >= 0 && v <= 1) scopeWarmingOverride = v;
          continue;
        }
        if (row.key === 'pressure_scale_mode') {
          // ENG-OBS-05: unknown values fall back to legacy (bit-identical curve).
          if (row.value === 'legacy' || row.value === 'p95ramp' || row.value === 'percentile') {
            pressureScaleMode = row.value;
          }
          continue;
        }
        if (row.key === 'state_str_weight') {
          const v = parseFloat(row.value);
          if (!isNaN(v) && v >= 0 && v <= 1) stateStrWeight = v;
          continue;
        }
        if (row.key === 'state_str_half_life_days') {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 1 && v <= 90) stateStrHalfLifeDays = v;
          continue;
        }
        if (row.key === 'state_str_window_days') {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 7 && v <= 365) stateStrWindowDays = v;
          continue;
        }
        if (scopeStateStrKey && row.key === scopeStateStrKey) {
          const v = parseFloat(row.value);
          if (!isNaN(v) && v >= 0 && v <= 1) scopeStateStrOverride = v;
          continue;
        }
        if (row.key === 'synergy_boost_on')     { synergyOn = row.value === 'true'; continue; }
        if (row.key === 'synergy_boost_weight') { const v = parseFloat(row.value); if (!isNaN(v) && v >= 0) synergyWeight = v; continue; }
        if (row.key === 'horizon_weights') {
          // app_config stores percentages (sum ≈ 100) — convert to decimals.
          // Validate: must include all 10 horizons and sum within 1% of 100%.
          try {
            const parsedHw = JSON.parse(row.value);
            const candidate: Record<string, number> = {};
            let sum = 0;
            let valid = true;
            for (const h of Object.keys(HORIZON_WEIGHTS)) {
              const v = parsedHw[h];
              if (typeof v !== 'number' || v < 0) { valid = false; break; }
              candidate[h] = v / 100;
              sum += v;
            }
            if (valid && Math.abs(sum - 100) <= 1) {
              horizonWeights = candidate;
            } else {
              console.warn('[zk6v2] horizon_weights ignored (invalid or sum != 100):', sum);
            }
          } catch { console.warn('[zk6v2] horizon_weights parse failed'); }
          continue;
        }

        const parsed = JSON.parse(row.value);
        const pct2dec = (v: number) => v > 1 ? v / 100 : v;
        const ws: WeightSet = {
          BOX:    pct2dec(parsed.BOX    ?? parsed.box    ?? 0),
          PBURST: pct2dec(parsed.PBURST ?? parsed.pburst ?? 0),
          CO:     pct2dec(parsed.CO     ?? parsed.co     ?? 0),
          DGC:    pct2dec(parsed.DGC    ?? parsed.dgc    ?? DEFAULT_WEIGHTS.balanced.DGC),
        };
        if (ws.BOX + ws.PBURST + ws.CO > 0.05) {
          if (row.key === 'engine_weights_balanced') presets.balanced = ws;
          if (scopeBalancedKey && row.key === scopeBalancedKey) scopeBalancedOverride = ws;
        }
      } catch {}
    }
    // CONFIG-07: per-scope preset override wins over global. Logged so prod diffs
    // are visible in console (mirrors the cooldown/freq/pressure override pattern).
    // SCRUB-01: only balanced is consumed in production.
    if (scopeBalancedOverride && scope) {
      console.log(`[zk6v2] preset override: scope=${scope} preset=balanced ${JSON.stringify(presets.balanced)} → ${JSON.stringify(scopeBalancedOverride)}`);
      presets.balanced = scopeBalancedOverride;
    }
    // Scope override wins over global when present. Logged at the call site
    // so production diffs are visible in the console.
    const effectiveCooldown = scopeCooldownOverride ?? recentHitCooldown;
    if (scopeCooldownOverride !== null && scope) {
      console.log(`[zk6v2] cooldown override: scope=${scope} ${recentHitCooldown} → ${effectiveCooldown}`);
    }
    const effectiveBoxFreqWeight     = scopeBoxFreqOverride  ?? boxFreqWeight;
    const effectiveBoxPressureWeight = scopeBoxPressOverride ?? boxPressureWeight;
    if ((scopeBoxFreqOverride !== null || scopeBoxPressOverride !== null) && scope) {
      console.log(`[zk6v2] box weight override: scope=${scope} freq ${boxFreqWeight}→${effectiveBoxFreqWeight} pressure ${boxPressureWeight}→${effectiveBoxPressureWeight}`);
    }
    const effectiveMinEnergyThreshold = scopeMinEnergyOverride ?? minEnergyThreshold;
    if (scopeMinEnergyOverride !== null && scope) {
      console.log(`[zk6v2] energy floor override: scope=${scope} ${minEnergyThreshold} → ${effectiveMinEnergyThreshold}`);
    }
    const effectiveWarmingWeight = scopeWarmingOverride ?? warmingWeight;
    if (effectiveWarmingWeight > 0) {
      console.log(`[zk6v2] WARMING active: scope=${scope ?? 'global'} weight=${effectiveWarmingWeight} windowDays=${warmingWindowDays}`);
    }
    const effectiveStateStrWeight = scopeStateStrOverride ?? stateStrWeight;
    if (effectiveStateStrWeight > 0) {
      console.log(`[zk6v2] STATE_STR active: scope=${scope ?? 'global'} weight=${effectiveStateStrWeight} halfLife=${stateStrHalfLifeDays}d window=${stateStrWindowDays}d`);
    }
    return {
      presets, rails, pressureThreshold,
      minEnergyThreshold: effectiveMinEnergyThreshold,
      recentHitCooldown: effectiveCooldown,
      synergyOn, synergyWeight, horizonWeights,
      boxFreqWeight, boxPressureWeight,
      effectiveBoxFreqWeight, effectiveBoxPressureWeight,
      timesDrawnBlendEnabled,
      adaptiveSignalWeightsEnabled,
      adaptiveSignalWeightsAlpha,
      warmingWeight,
      effectiveWarmingWeight,
      warmingWindowDays,
      pressureScaleMode,
      stateStrWeight,
      effectiveStateStrWeight,
      stateStrHalfLifeDays,
      stateStrWindowDays,
    };
  } catch {
    return DEFAULT_ENGINE_CONFIG;
  }
}

/**
 * ENH-AFL-2: Load rolling 30-day per-signal AUC from signal_auc_per_day.
 * Returns null when < 14 days of data are available (cold-start fallback).
 */
async function loadRollingAuc(scope: Scope): Promise<SignalAuc | null> {
  try {
    const sinceDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const rows = await fetchFromSupabase<{ signal: string; auc: number }[]>({
      path: `/rest/v1/signal_auc_per_day?scope=eq.${encodeURIComponent(scope)}&day=gte.${sinceDate}&select=signal,auc&limit=200`,
    });
    if (!Array.isArray(rows)) return null;
    const buckets: Record<string, number[]> = { BOX: [], PBURST: [], CO: [], DGC: [] };
    for (const r of rows) {
      if (r.signal in buckets && typeof r.auc === 'number') buckets[r.signal].push(r.auc);
    }
    // Require ≥14 days for each signal — otherwise too noisy.
    for (const sig of ['BOX', 'PBURST', 'CO', 'DGC']) {
      if (buckets[sig].length < 14) return null;
    }
    const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
    return {
      BOX: avg(buckets.BOX),
      PBURST: avg(buckets.PBURST),
      CO: avg(buckets.CO),
      DGC: avg(buckets.DGC),
    };
  } catch {
    return null;
  }
}

// ─── saveSlateSnapshot ────────────────────────────────────────────────────────

async function saveSlateSnapshot(snapshot: SlateSnapshot, extraFields?: Record<string, unknown>): Promise<string> {
  console.log('[zk6v2] Saving snapshot:', {
    id: snapshot.id, scope: snapshot.scope,
    hash: snapshot.hash?.slice(0, 8),
    topK: Array.isArray(snapshot.top_k_straights_json)
      ? snapshot.top_k_straights_json.length : 0,
  });

  const payload: Record<string, unknown> = {
    scope: snapshot.scope,
    // ENG-DEEPSCOPE-01 P3/D5 (2026-08-13): written EXPLICITLY. The column was
    // previously filled only by a DB-side default — and ENG-STALE-01's prior-
    // slate query filters `mode=neq.zk30`, whose SQL `<>` semantics silently
    // drop NULL rows. If that default is ever lost (schema migration, fresh
    // environment), the staleness block dies with no error. Same value the
    // default supplies today; byte-identical rows.
    mode: snapshot.mode ?? 'balanced',
    horizons_present_json: snapshot.horizons_present_json,
    weights_json: snapshot.weights_json,
    top_k_straights_json: snapshot.top_k_straights_json,
    top_k_boxes_json: snapshot.top_k_boxes_json,
    components_json: snapshot.components_json,
    updated_at_et: snapshot.updated_at_et,
    slate_date: snapshot.slate_date ?? null,
    snapshot_hash: snapshot.hash ?? null,
    hash: snapshot.hash ?? null,
    admin_published: true,
    ...(extraFields ?? {}),
  };

  const saveToAuditFallback = async (reason: string) => {
    try {
      await adminOpsFetch({
        path: '/rest/v1/audit_logs',
        method: 'POST',
        body: {
          actor_id: 'system',
          action: 'slate_snapshot_fallback',
          target: snapshot.scope,
          payload_meta: { reason, snapshot: payload },
        },
      });
      console.log('[zk6v2] Snapshot stored in audit_logs (RLS fallback).');
    } catch (e) {
      console.log('[zk6v2] audit_logs fallback also failed:', String(e));
    }
  };

  // Soft-delete any active snapshot for the same scope on the same ET date before inserting.
  // Skip for supplemental slates — they coexist alongside the primary snapshot.
  const isSupplementSave = (() => {
    try {
      const fm = extraFields?.file_meta;
      const parsed = typeof fm === 'string' ? JSON.parse(fm) : fm;
      return !!(parsed as any)?.is_supplement;
    } catch { return false; }
  })();
  if (!isSupplementSave) {
    try {
      const effectiveSd = snapshot.slate_date ?? getTodayET();
      await adminOpsFetch<any>({
        path: `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(snapshot.scope)}&slate_date=eq.${effectiveSd}&deleted_at=is.null`,
        method: 'PATCH',
        prefer: 'return=minimal',
        body: { deleted_at: new Date().toISOString() },
      });
    } catch (patchErr) {
      console.warn('[zk6v2] soft-delete prior snapshots warn:', String(patchErr));
    }
  }

  try {
    const res = await adminOpsFetch<any>({
      path: '/rest/v1/slate_snapshots',
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: payload,
    });
    const dbId = Array.isArray(res) && res.length > 0
      ? (res[0]?.id as string | undefined) : undefined;
    console.log('[zk6v2] Snapshot saved:', { scope: snapshot.scope, dbId });
    return dbId ?? snapshot.id;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const isRls = /42501|row-level security|RLS|violates row-level security/i.test(msg);
    console.log('[zk6v2] Save error:', { msg: msg.slice(0, 200), isRls });
    if (isRls) { await saveToAuditFallback(msg); return snapshot.id; }
    throw err instanceof Error ? err : new Error('Failed to save slate snapshot');
  }
}

// ─── computeSlate ─────────────────────────────────────────────────────────────

export async function computeSlate({
  scope: rawScope,
  weightsKey = 'balanced',
  targetDate,
  excludedCombos = new Set<string>(),
  skipHistoriesExclusion = false,
  excludeComboSets = [],
  is_supplement = false,
}: ComputeSlateParams): Promise<SlateSnapshot> {
  // Feature flag: delegate to Edge Function when enabled.
  // Flip EXPO_PUBLIC_USE_EDGE_ZK6=true after parity verification (Step 6).
  if (process.env.EXPO_PUBLIC_USE_EDGE_ZK6 === 'true') {
    console.log('[zk6v2] Edge Function mode — delegating to compute-slate-zk6');
    // Edge-fn invocation, NOT a table write — stays on fetchFromSupabase
    // (the admin-ops gateway only proxies /rest/v1/ table paths).
    const result = await fetchFromSupabase<SlateSnapshot>({
      path: '/functions/v1/compute-slate-zk6',
      method: 'POST',
      body: { scope: rawScope, weightsKey, targetDate, excludeComboSets, is_supplement },
      timeoutMs: 60000,
    });
    return result;
  }

  // ENG-DEEPSCOPE-01 P3/D3: computeSlate WRITES — reject unknown scopes rather
  // than silently computing (and overwriting) allday. Typed callers never hit
  // this; it exists for untyped call sites and malformed workflow invocations.
  const strictScope = normalizeScopeStrict(rawScope);
  if (!strictScope) {
    throw new Error(`computeSlate: unknown scope "${String(rawScope)}" — expected midday | evening | allday`);
  }
  const scope: Scope = strictScope;
  const now = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;

  const cfg = await loadEngineConfig(scope);
  const { presets: weightPresets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown, synergyOn, synergyWeight, horizonWeights } = cfg;
  // SCRUB-01: production is balanced-only. weightsKey param is retained for
  // backward caller compatibility but always resolves to balanced.
  const baseWeights = weightPresets.balanced;

  // ENH-AFL-2: adaptive signal weights. When enabled, load rolling 30d AUC
  // and adjust weights toward signals that have been predicting well in this
  // scope's recent history. Falls back to baseWeights when AUC data isn't
  // available (< 14 days) or the flag is off.
  let weights = baseWeights;
  let adaptiveDiagnostics: ReturnType<typeof computeAdaptiveWeights>['diagnostics'] | null = null;
  if (cfg.adaptiveSignalWeightsEnabled) {
    const rollingAuc = await loadRollingAuc(scope);
    if (rollingAuc) {
      const adaptive = computeAdaptiveWeights(baseWeights, rollingAuc, cfg.adaptiveSignalWeightsAlpha);
      weights = adaptive.weights;
      adaptiveDiagnostics = adaptive.diagnostics;
      console.log(`[zk6v2] ENH-AFL-2 adaptive: scope=${scope} α=${cfg.adaptiveSignalWeightsAlpha}`,
        `auc=${JSON.stringify(rollingAuc)}`,
        `base→adj: ${JSON.stringify(baseWeights)} → ${JSON.stringify(weights)}`);
    } else {
      console.log(`[zk6v2] ENH-AFL-2 adaptive: scope=${scope} — insufficient AUC data, using base weights`);
    }
  }
  // CONFIG-02 (2026-05-14): effective per-scope BOX freq/pressure split.
  const effBoxFreqWeight     = cfg.effectiveBoxFreqWeight     ?? cfg.boxFreqWeight;
  const effBoxPressureWeight = cfg.effectiveBoxPressureWeight ?? cfg.boxPressureWeight;
  const universe = buildUniverse();

  console.log('[zk6v2] computeSlate:', { scope, weightsKey });
  console.log('[zk6v2] using weights: BOX=' + weights.BOX + ' PBURST=' + weights.PBURST + ' CO=' + weights.CO);
  console.log('[zk6v2] K6 rails: singles≤' + rails.singlesMax + ' doubles≤' + rails.doublesMax + ' triples=' + rails.triplesOn + ' pairRepCap=' + rails.pairRepCap);
  console.log('[zk6v2] intelligence config: pressureThreshold=' + pressureThreshold + ' minEnergyThreshold=' + minEnergyThreshold + ' recentHitCooldown=' + recentHitCooldown);
  console.log('[zk6v2] BOX split: freq=' + effBoxFreqWeight + ' pressure=' + effBoxPressureWeight);

  // ── 1. Fetch all horizons + live history overrides ───────────────────────────
  // ENH-WARMING-2026-06-06: when warming weight is non-zero for this scope,
  // also fetch the prior-N-day cross-jurisdiction history window. Skipped
  // entirely when weight is 0 (zero added latency).
  const warmingActive = (cfg.effectiveWarmingWeight ?? 0) > 0;
  // ENG-STATE-DATA-05 (2026-06-09): state-agg fetch parallelized with other
  // slow ops. 14d window. Pure metadata; failure returns empty Map and slate
  // generation proceeds with empty state fields on each pick (UX-only).
  // ENG-SLATE-METRICS-06 (2026-06-09): per-scope recent slate match rates.
  // Also parallelized; nulls on failure. Pure read-only metadata.
  const STATE_AGG_WINDOW_DAYS = 14;
  // ENH-AUDIT v2 STATE_STR: per-jurisdiction window fetched only when active.
  const stateStrActive = (cfg.effectiveStateStrWeight ?? 0) > 0;
  const [ds, { dsOverride, lsOverride, hitDatesMap }, warmingRows, stateAggMap, slateMatchRates, stateStrRows] = await Promise.all([
    fetchDatasets(scope),
    fetchHistoryOverrides(scope),
    warmingActive
      ? fetchWarmingHistory(todayEt, cfg.warmingWindowDays)
      : Promise.resolve([] as { comboset_sorted: string; date_et: string }[]),
    fetchStateAggregation(todayEt, STATE_AGG_WINDOW_DAYS),
    fetchRecentSlateMatchRates(scope, todayEt),
    stateStrActive
      ? fetchStateStrengthHistory(effectiveDate, cfg.stateStrWindowDays)
      : Promise.resolve([] as StateHistoryRow[]),
  ]);
  if (warmingActive) {
    console.log(`[zk6v2] WARMING fetched ${warmingRows.length} rows over ${cfg.warmingWindowDays}d window`);
  }
  console.log(`[zk6v2] state-agg: ${stateAggMap.size} unique comboSets over ${STATE_AGG_WINDOW_DAYS}d window`);
  console.log(`[zk6v2] slate-metrics: 7d=${slateMatchRates.recent7dMatchRatePct}% (${slateMatchRates.slates7d} slates), 30d=${slateMatchRates.recent30dMatchRatePct}% (${slateMatchRates.slates30d} slates)`);

  // Merge: history wins when it shows a MORE RECENT hit than the imported dataset.
  // This corrects stale draws_since/last_seen without requiring a re-import.
  for (const [cs, actualDs] of dsOverride) {
    const staleDs = ds.drawsSinceMap.get(cs);
    if (staleDs == null || actualDs < staleDs) ds.drawsSinceMap.set(cs, actualDs);
  }
  for (const [cs, actualLs] of lsOverride) {
    const staleLs = ds.lastSeenMap.get(cs);
    if (!staleLs || actualLs > staleLs) ds.lastSeenMap.set(cs, actualLs);
  }
  console.log('[zk6v2] History overrides applied — corrected draws_since for', dsOverride.size, 'combos');

  const dgcMap = new Map<string, number>();
  for (const [cs, dates] of hitDatesMap) {
    dgcMap.set(cs, computeDGC(dates));
  }

  if (ds.horizonsLoaded.length === 0) {
    const label = scope === 'allday' ? 'All-Day'
      : scope.charAt(0).toUpperCase() + scope.slice(1);
    throw new Error(`No BOX data available for scope: ${label}`);
  }

  // ── 2. Recent draws (today + yesterday) — ALWAYS excluded, unconditionally ───
  // This runs regardless of skipHistoriesExclusion or any caller-supplied sets.
  // Two independent sources are checked so the block works even when only one
  // has been updated: (A) histories table (raw imported draw results) and
  // (B) daily_intelligence table (hit flags set by hit detection flow).
  // Yesterday is a hard block because Pass 5 would otherwise relax the cooldown
  // and allow recently-hit combos back into the slate.
  //
  // ENG-BLOCK-NARROW-01 (2026-06-09) narrowed this block to "today only" for ALL
  // scopes. That removed the one working mechanism that rotated recently-hit
  // high-score combos off the slate: at morning slate-gen "today" is empty, so
  // the block is empty and Pass 1 re-selects the same top-indicator combos every
  // day (the cooldown rail can't do the job — it has a days/draws unit defect and
  // is relaxed by Pass 5). Symptom: 923/298 pinned to every evening+allday slate
  // 6/10→6/18 (HIT-PERSIST-01).
  //
  // ENG-BLOCK-PERSCOPE-02 (2026-06-22): widen the per-scope recent-hit hard block.
  // ENG-ROT-MID-01 (2026-08-02): midday joins the 3-day block (was yesterday+today per
  // ENG-BLOCK-PERSCOPE-01) — measured-cost texture ship, see MASTER_AUDIT. evening +
  // allday move from today-only to a 3-DAY block ([D-3, today]) so a combo that just
  // drew cannot return to the next 1–3 slates — the operator's "after a combo hits it
  // should cool down, not instantly return". 30d backtest (dbl_fix_singles6 baseline
  // vs hitblock1..4, per-scope rows on the window ending 6/22):
  //   evening N=1..3 = +3.5pp (82.8 vs 79.3); N=4 = −3.4pp → sweet spot N≤3
  //   allday  N=1..4 = neutral within noise (82.8–89.7 vs 89.7, n=29; prior −7pp
  //                    did not replicate on the current window)
  //   midday  unchanged (already blocked; benefits further but out of scope here)
  // N=3 chosen: matches the operator's "ride max 3 days" workflow, evening favorable,
  // allday flat. Same non-relaxable hard block (todayHitComboSets) — never relaxed by
  // any K6 pass. CAVEAT: this only rotates combos that HIT; never-hitting overdue
  // repeaters (923/298) need the separate staleness lever (ENG-STALE-01, in progress).
  const RECENT_HIT_BLOCK_DAYS: Record<string, number> = { midday: 3, evening: 3, allday: 3 };
  const blockFromEt = getDaysAgoET(RECENT_HIT_BLOCK_DAYS[scope] ?? 1);
  const todayHitComboSets = new Set<string>();
  const effectiveExcluded = new Set<string>(excludedCombos);

  // Source A: histories table (raw draw results from imports) — [blockFromEt, today]
  // BUG-166: ordered + paginated — an unordered 1000-capped query returns an
  // arbitrary subset once the block window outgrows the cap.
  try {
    const pageSize = 1000;
    for (let offset = 0; offset < 10000; offset += pageSize) {
      const recentWinners = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories?date_et=gte.${blockFromEt}&date_et=lte.${todayEt}&select=result_digits` +
          `&order=date_et.desc,id.desc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(recentWinners) ? recentWinners : [];
      arr.forEach(w => {
        if (typeof w?.result_digits === 'string' && /^\d{3}$/.test(w.result_digits)) {
          todayHitComboSets.add(toComboSet(w.result_digits));
          effectiveExcluded.add(w.result_digits);
        }
      });
      if (arr.length < pageSize) break;
    }
  } catch (e) {
    console.log('[zk6v2] histories exclusion fetch warn (non-fatal):', e);
  }

  // Source B: daily_intelligence hit flags — [blockFromEt, today] (also catches
  // supplemental slates where hit detection ran on earlier-session picks)
  try {
    const diHits = await fetchFromSupabase<any[]>({
      path: `/rest/v1/daily_intelligence?slate_date=gte.${blockFromEt}&slate_date=lte.${todayEt}&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo_set,hit_result&limit=500`,
    });
    if (Array.isArray(diHits)) {
      diHits.forEach(row => {
        if (typeof row?.combo_set === 'string' && row.combo_set) {
          todayHitComboSets.add(row.combo_set);
        }
        if (typeof row?.hit_result === 'string' && /^\d{3}$/.test(row.hit_result)) {
          todayHitComboSets.add(toComboSet(row.hit_result));
          effectiveExcluded.add(row.hit_result);
        }
      });
    }
  } catch (e) {
    console.log('[zk6v2] daily_intelligence exclusion fetch warn (non-fatal):', e);
  }

  console.log('[zk6v2] Recent hit exclusion (per-scope block window, both sources):', {
    todayEt, blockFromEt, scope,
    hardBlockSets: todayHitComboSets.size,
    totalStraights: effectiveExcluded.size,
  });

  // ENG-STALE-01 (2026-06-22): slate-appearance staleness block. A comboSet present on
  // ALL of the last N slates for this scope (evening/allday) is hard-blocked, capping any
  // combo at N consecutive appearances so the never-hitting overdue repeaters (923/298)
  // are forced to rotate — the hit-based block above can't catch them (they don't hit).
  // 30d backtest: hit-rate-NEUTRAL within noise (rotation is a mechanical guarantee, not
  // a hit-rate bet; SIGNAL-INFO-01). K6-only (matches the backtest); DI top-30 untouched.
  // midday joined 2026-08-02 (ENG-ROT-MID-01, stale2). Mirror in supabase/functions/compute-slate-zk6.
  const SLATE_STALENESS_DAYS: Record<string, number> = { midday: 2, evening: 2, allday: 2 };
  const staleComboSets = new Set<string>();
  const staleN = SLATE_STALENESS_DAYS[scope] ?? 0;
  if (staleN > 0) {
    try {
      const prior = await fetchFromSupabase<any[]>({
        path: `/rest/v1/slate_snapshots?scope=eq.${scope}&deleted_at=is.null&mode=neq.zk30&slate_date=lt.${todayEt}&select=slate_date,top_k_boxes_json,top_k_straights_json,updated_at_et&order=slate_date.desc,updated_at_et.desc&limit=20`,
      });
      const byDate = new Map<string, string[]>();
      if (Array.isArray(prior)) for (const r of prior) {
        if (byDate.has(r.slate_date)) continue; // first per date = latest (updated_at desc)
        const sets = Array.isArray(r.top_k_boxes_json) && r.top_k_boxes_json.length
          ? r.top_k_boxes_json.map(String)
          : (Array.isArray(r.top_k_straights_json) ? r.top_k_straights_json.map((p: any) => String(p?.comboSet ?? '')).filter(Boolean) : []);
        if (sets.length) byDate.set(r.slate_date, sets);
      }
      const lastN = [...byDate.values()].slice(0, staleN);
      if (lastN.length >= staleN) {
        for (const cs of lastN[0]) {
          if (lastN.every(slate => slate.includes(cs))) staleComboSets.add(cs);
        }
      }
    } catch (e) {
      console.log('[zk6v2] ENG-STALE-01 staleness fetch warn (non-fatal):', e);
    }
  }
  console.log('[zk6v2] ENG-STALE-01 staleness block:', { scope, staleN, stale: [...staleComboSets] });

  // ── 3. First pass — raw signal scores for all 1000 combos ────────────────────
  // CONFIG-08 (2026-05-27): when timesDrawnBlendEnabled is true, BOX + pair
  // times_drawn honor horizon_weights via blend. Build a synthetic pairMetaMap
  // keyed by the blended times_drawn (drawsSince stays H01Y — ds_raw is
  // invariant across horizons by construction). Legacy pairMetaMap stays for
  // the K6 cooldown reads which already gate on a single combo's recent ds_raw.
  const tdBlend = cfg.timesDrawnBlendEnabled === true;
  let pairMetaForSignals = ds.pairMetaMap;
  if (tdBlend) {
    pairMetaForSignals = new Map();
    for (const [pairKey, classMap] of ds.pairTimesDrawnByHorizon.entries()) {
      const newClassMap = new Map<number, PairMeta>();
      for (const classId of classMap.keys()) {
        const blendedTd = blendPairTimesDrawn(pairKey, classId, ds.pairTimesDrawnByHorizon, horizonWeights);
        const legacyMeta = ds.pairMetaMap.get(pairKey)?.get(classId);
        newClassMap.set(classId, {
          dsRaw: legacyMeta?.dsRaw ?? 0,
          drawsSince: legacyMeta?.drawsSince ?? 500,
          timesDrawn: blendedTd,
        });
      }
      pairMetaForSignals.set(pairKey, newClassMap);
    }
  }

  // Pre-pass: find maxTimesDrawn so frequency can be normalised 0-1
  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const nk = toComboSet(universe[i]);
    const td = tdBlend
      ? blendBoxTimesDrawn(nk, ds.boxTimesDrawnByHorizon, horizonWeights)
      : (ds.timesDrawnMap.get(nk) ?? 0);
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  console.log('[zk6v2] CONFIG-08 blend:', tdBlend, 'maxTimesDrawn:', maxTimesDrawn, 'horizonWeights:', JSON.stringify(horizonWeights));

  // ENG-OBS-05: pressure scale context — built once from real combos' dsVals.
  // undefined (legacy mode) keeps computeBoxSignalDetailed bit-identical.
  let pressureScaleCtx: ReturnType<typeof buildPressureScaleCtx>;
  if (cfg.pressureScaleMode !== 'legacy') {
    const realDsVals: number[] = [];
    for (let i = 0; i < 1000; i++) {
      const nk = toComboSet(universe[i]);
      const td = tdBlend
        ? blendBoxTimesDrawn(nk, ds.boxTimesDrawnByHorizon, horizonWeights)
        : (ds.timesDrawnMap.get(nk) ?? 0);
      if (td > 0) realDsVals.push(blendBoxDsRaw(nk, ds.boxByHorizon, horizonWeights));
    }
    pressureScaleCtx = buildPressureScaleCtx(cfg.pressureScaleMode, realDsVals);
    console.log(`[zk6v2] ENG-OBS-05 pressure scale: mode=${cfg.pressureScaleMode}`,
      pressureScaleCtx?.mode === 'p95ramp' ? `dsP95=${pressureScaleCtx.dsP95}` : `n=${realDsVals.length}`);
  }

  // Pre-pass: find maxTimesDrawn across all pair rows for frequency normalization.
  // Bug fix: previously used dsRaw (draws-since = staleness) as "freqScore", which
  // made PBURST/CO reward the most stale pairs (inversely correlated with hits).
  // Now uses timesDrawn (historical count) to match the BOX signal's frequency logic.
  let maxPairTimesDrawn = 0;
  for (const classMap of pairMetaForSignals.values()) {
    for (const meta of classMap.values()) {
      if (meta.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = meta.timesDrawn;
    }
  }

  // Pair signal lookup: delegates to engineCore.getPairSignalFromMap which
  // implements the canonical 70% freq + 30% pressure formula. When CONFIG-08
  // blend is on, pairMetaForSignals carries the blended times_drawn.
  const getPairSignal = (pairKey: string, classId: number): number =>
    getPairSignalFromMap(pairMetaForSignals, pairKey, classId, maxPairTimesDrawn);

  const rawBox      = new Float64Array(1000);
  const rawFreq     = new Float64Array(1000); // freq component before weighting
  const rawPressure = new Float64Array(1000); // pressure component before weighting
  const rawPburst   = new Float64Array(1000);
  const rawCo       = new Float64Array(1000);
  const rawDgc      = new Float64Array(1000);

  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const normKey = toComboSet(combo);
    const [a, b, c] = combo;

    // BOX signal delegates to engineCore.computeBoxSignalDetailed — the canonical
    // (freqWeight × freq) + (pressureWeight × pressure) formula, with per-component
    // values preserved for diagnostic logging (rawFreq/rawPressure).
    // ENH-HW: dsVal is a horizon-weighted blend (app_config.horizon_weights);
    // with {H01Y:1.0, rest:0} behavior matches the prior H01Y-only lookup.
    // CONFIG-08: when blend is on, times_drawn is also horizon-blended; legacy
    // path used MAX-across-horizons (effectively H02Y).
    const timesDrawnVal = tdBlend
      ? blendBoxTimesDrawn(normKey, ds.boxTimesDrawnByHorizon, horizonWeights)
      : (ds.timesDrawnMap.get(normKey) ?? 0);
    const dsVal = blendBoxDsRaw(normKey, ds.boxByHorizon, horizonWeights);
    const parts = computeBoxSignalDetailed(
      timesDrawnVal, dsVal, maxTimesDrawn, pressureThreshold,
      effBoxFreqWeight, effBoxPressureWeight, pressureScaleCtx,
    );
    rawFreq[i]     = parts.freq;
    rawPressure[i] = parts.pressure;
    rawBox[i]      = parts.box;

    // PBURST signal: position-specific pairs (classes 2, 3, 4) — combined freq+pressure pairSignal
    const ab = sortedPair(a, b);
    const bc = sortedPair(b, c);
    const ac = sortedPair(a, c);
    rawPburst[i] = (
      getPairSignal(ab, 2) +
      getPairSignal(bc, 3) +
      getPairSignal(ac, 4)
    ) / 3;

    // CO signal: pattern co-occurrence (classes 5–11) — combined freq+pressure pairSignal
    let coSum = 0;
    const pairs = [ab, bc, ac];
    for (const classId of [5, 6, 7, 8, 9, 10, 11]) {
      for (const pk of pairs) {
        coSum += getPairSignal(pk, classId);
      }
    }
    rawCo[i] = coSum / (7 * 3); // 7 classes × 3 pairs

    rawDgc[i] = dgcMap.get(normKey) ?? 0;
  }

  // ── 4. Normalize each signal to 0–1 ──────────────────────────────────────────
  // BOX: only real combos (timesDrawn > 0) participate in the max; placeholders stay 0.
  const rawBoxArr = Array.from(rawBox);
  const realBoxMasked = rawBoxArr.map((v, i) =>
    (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? v : 0);
  const normBoxRaw = maxNorm(realBoxMasked, true);
  const normBox = normBoxRaw.map((v, i) =>
    (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) === 0 ? 0 : v);

  const normPburst = maxNorm(Array.from(rawPburst), true);
  const normCo     = maxNorm(Array.from(rawCo), true);
  const normDgc    = maxNorm(Array.from(rawDgc), true);

  // ── 5. Final scores ───────────────────────────────────────────────────────────
  // ENG-AUDIT-01 (2026-06-06): inline body replaced with the shared
  // computeWeightedScore helper. Behavior bit-identical at the default
  // synergy threshold (0.65) and minCount (2), which matches the prior
  // inline implementation. Edge fn (compute-slate-zk6/index.ts:~702)
  // still has its inline copy; consolidation deferred to keep this commit
  // RN-only (no edge fn deploy in this change).
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const multAdj = MULTIPLICITY_PRIORS[multiplicityOf(combo)];
    finalScores[i] = computeWeightedScore(
      normBox[i], normPburst[i], normCo[i], normDgc[i],
      weights, multAdj, synergyOn, synergyWeight,
    );
  }

  // ── 5b. ENH-WARMING post-score boost ──────────────────────────────────────────
  // When effectiveWarmingWeight > 0, build the warming map from the prior-N-day
  // history rows fetched above, max-norm across the universe, and add
  // warmingWeight × normWarming to each combo's finalScore before energy
  // percentile + K6 selection. Skipped when weight is 0 (bit-identical to
  // pre-WARMING engine).
  let rawWarming: Float64Array | null = null;
  let normWarming: number[] | null = null;
  if (warmingActive) {
    const warmingMap = buildWarmingMap(warmingRows);
    rawWarming = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) {
      const nk = toComboSet(universe[i]);
      rawWarming[i] = warmingMap.get(nk) ?? 0;
    }
    normWarming = maxNorm(Array.from(rawWarming), true);
    const wWeight = cfg.effectiveWarmingWeight ?? 0;
    for (let i = 0; i < 1000; i++) {
      finalScores[i] += wWeight * normWarming[i];
    }
    const nonZero = Array.from(rawWarming).filter(v => v > 0).length;
    const maxW = Array.from(rawWarming).reduce((m, v) => v > m ? v : m, 0);
    console.log(`[zk6v2] WARMING applied: weight=${wWeight} nonZeroCombos=${nonZero} maxRaw=${maxW}`);
  }

  // ── 5c. ENH-AUDIT v2 STATE_STR post-score boost ──────────────────────────────
  // Per-state pattern strength (max across jurisdictions of recency-weighted
  // per-draw hit rate), max-normed, added as effectiveStateStrWeight ×
  // normStateStr. Skipped when weight is 0 — bit-identical 4-channel engine.
  if (stateStrActive) {
    const strengthMap = buildStateStrengthMap(stateStrRows, effectiveDate, cfg.stateStrHalfLifeDays);
    const rawStateStr = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) {
      rawStateStr[i] = strengthMap.get(toComboSet(universe[i])) ?? 0;
    }
    const normStateStr = maxNorm(Array.from(rawStateStr), true);
    const ssWeight = cfg.effectiveStateStrWeight ?? 0;
    for (let i = 0; i < 1000; i++) {
      finalScores[i] += ssWeight * normStateStr[i];
    }
    console.log(`[zk6v2] STATE_STR applied: weight=${ssWeight} comboSetsWithStrength=${strengthMap.size} rows=${stateStrRows.length}`);
  }

  // ── 6. Two-pass K6 selection ──────────────────────────────────────────────────
  // Pass 1: real data combos (timesDrawn > 0), full diversity rails, sorted by score.
  // Pass 2: fill any remaining slots with placeholder combos, sorted by the same
  // finalScore (which for zero-history combos reduces to their PBURST/CO pair
  // signals — BOX is masked to 0). An earlier comment claimed "sorted by PBURST
  // only"; the sort has always been finalScore (ENG-DEEPSCOPE-01 §D6).

  const realIdx: number[] = [];
  const placeholderIdx: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const nk = toComboSet(universe[i]);
    if ((ds.timesDrawnMap.get(nk) ?? 0) > 0) realIdx.push(i);
    else placeholderIdx.push(i);
  }
  realIdx.sort((a, b) =>
    finalScores[b] !== finalScores[a]
      ? finalScores[b] - finalScores[a]
      : universe[a].localeCompare(universe[b]),
  );
  placeholderIdx.sort((a, b) =>
    finalScores[b] !== finalScores[a]
      ? finalScores[b] - finalScores[a]
      : universe[a].localeCompare(universe[b]),
  );

  const scorePoolForEnergy = Array.from(finalScores).sort((a, b) => a - b);

  // Top-30 pre-diversity-rail list for daily_intelligence (before K6 rails are applied)
  const top30PreRail = Array.from({ length: 1000 }, (_, i) => {
    const combo = universe[i];
    const normKey = toComboSet(combo);
    return {
      combo,
      comboSet: normKey,
      finalScore: finalScores[i],
      mult: multiplicityOf(combo),
      topPair: topPairOf(combo),
      signals: { BOX: normBox[i], PBURST: normPburst[i], CO: normCo[i], DGC: normDgc[i] },
      energy: percentileRankOf(finalScores[i], scorePoolForEnergy),
      drawsSince: ds.drawsSinceMap.get(normKey) ?? null,
      timesDrawn: ds.timesDrawnMap.get(normKey) ?? 0,
    };
  })
    // top30 must respect the same yesterday-hit hard block as K6 selection so
    // daily_intelligence and the slate stay aligned (see compute-slate-zk6/index.ts)
    .filter(p => !(todayHitComboSets.size > 0 && todayHitComboSets.has(p.comboSet)))
    .sort((a, b) => b.finalScore - a.finalScore).slice(0, 30);

  // Key-matching diagnostics — log first 5 real combos to verify normKey lookups
  const keyDiag = realIdx.slice(0, 5).map(i => {
    const c = universe[i];
    const nk = toComboSet(c);
    return {
      combo: c, normKey: nk,
      timesDrawn: ds.timesDrawnMap.get(nk) ?? 0,
      dsRaw: ds.dsRawMap.get(nk) ?? 0,
      drawsSince: ds.drawsSinceMap.get(nk) ?? 0,
      score: finalScores[i].toFixed(4),
    };
  });
  console.log('[zk6v2] Key diagnostics (top 5 real):', JSON.stringify(keyDiag));
  console.log('[zk6v2] Pool sizes — real:', realIdx.length, 'placeholder:', placeholderIdx.length);

  interface K6Item {
    combo: string; normKey: string;
    indicator: number;
    freqS: number; pressureS: number;
    boxS: number; pburstS: number; coS: number; dgcS: number;
    energy: number; multiplicity: 'singles' | 'doubles' | 'triples'; topPair: string;
  }

  const k6: K6Item[] = [];
  let singles = 0, doubles = 0, triples = 0;
  const pairCounts: Record<string, number> = {};
  const selectedComboSets = new Set<string>();

  const excludeComboSetsSet = new Set(excludeComboSets);

  // Rail relaxation flags (applied progressively across passes):
  // relaxExcludeComboSets — allow yesterday's combo sets back
  // relaxPairRepCap       — ignore pairRepCap diversity cap
  // relaxCooldown         — ignore recentHitCooldown suppression
  // relaxMultCaps         — ignore singles/doubles/triples quotas (last resort)
  // Hard blocks never relaxed: selectedComboSets (no dupe picks) + todayHitComboSets (recent winners over the per-scope block window, per ENG-BLOCK-PERSCOPE-01)
  const tryAdd = (
    idx: number,
    relaxExcludeComboSets = false,
    relaxPairRepCap = false,
    relaxCooldown = false,
    relaxMultCaps = false,
  ): boolean => {
    if (k6.length >= 6) return false;
    const combo = universe[idx];
    const normKey = toComboSet(combo);
    if (selectedComboSets.has(normKey)) return false;
    if (todayHitComboSets.size > 0 && todayHitComboSets.has(normKey)) return false;
    // ENG-STALE-01: non-relaxable staleness block (never relaxed by any pass).
    if (staleComboSets.size > 0 && staleComboSets.has(normKey)) return false;
    if (!relaxExcludeComboSets && effectiveExcluded.has(combo)) return false;
    if (!relaxExcludeComboSets && excludeComboSetsSet.size > 0 && excludeComboSetsSet.has(normKey)) return false;
    const mult = multiplicityOf(combo);
    // ENG-TRIPLES-LEAK-01 (2026-06-09): triplesOn=false is a harder invariant
    // than the singles/doubles count caps — never let Pass 6 (relaxMultCaps=true)
    // leak a triple into the slate. Caps remain inside the relax guard so Pass 6
    // can still over-fill on singles/doubles to guarantee 6 picks.
    if (mult === 'triples' && !rails.triplesOn) return false;
    if (!relaxMultCaps) {
      if (mult === 'singles' && singles >= rails.singlesMax) return false;
      if (mult === 'doubles' && doubles >= rails.doublesMax) return false;
    }
    const tp = topPairOf(combo);
    if (!relaxPairRepCap && (pairCounts[tp] ?? 0) >= rails.pairRepCap) return false;
    const energy = percentileRankOf(finalScores[idx], scorePoolForEnergy);
    if (minEnergyThreshold > 0 &&
      (ds.timesDrawnMap.get(normKey) ?? 0) > 0 &&
      energy < minEnergyThreshold) return false;
    const recentDs = ds.drawsSinceMap.get(normKey) ?? 999;
    if (!relaxCooldown && recentHitCooldown > 0 && dsOverride.has(normKey) &&
      (ds.timesDrawnMap.get(normKey) ?? 0) > 0 && recentDs < recentHitCooldown) return false;
    k6.push({
      combo, normKey,
      indicator: finalScores[idx],
      freqS: rawFreq[idx], pressureS: rawPressure[idx],
      boxS: normBox[idx], pburstS: normPburst[idx], coS: normCo[idx], dgcS: normDgc[idx],
      energy, multiplicity: mult, topPair: tp,
    });
    if (mult === 'singles') singles++;
    else if (mult === 'doubles') doubles++;
    else triples++;
    pairCounts[tp] = (pairCounts[tp] ?? 0) + 1;
    selectedComboSets.add(normKey);
    return true;
  };

  const allIdx = [...realIdx, ...placeholderIdx];

  // Pass 1: real data only, all rails enforced
  for (const idx of realIdx) {
    if (k6.length >= 6) break;
    tryAdd(idx);
  }

  // Pass 2: fill remaining slots with placeholder combos (zero-history — data gap)
  if (k6.length < 6) {
    console.warn('[zk6v2] Pass 1 yielded only', k6.length, 'picks — filling with zero-history combos (import data may be incomplete)');
    for (const idx of placeholderIdx) {
      if (k6.length >= 6) break;
      tryAdd(idx);
    }
  }

  // Pass 3: relax yesterday-exclusion
  if (k6.length < 6) {
    console.log('[zk6v2] Pass 2 yielded', k6.length, '— pass 3: relax excludeComboSets');
    for (const idx of allIdx) {
      if (k6.length >= 6) break;
      tryAdd(idx, true);
    }
  }

  // Pass 4: also relax pairRepCap
  if (k6.length < 6) {
    console.log('[zk6v2] Pass 3 yielded', k6.length, '— pass 4: relax pairRepCap');
    for (const idx of allIdx) {
      if (k6.length >= 6) break;
      tryAdd(idx, true, true);
    }
  }

  // Pass 5: also relax cooldown
  if (k6.length < 6) {
    console.log('[zk6v2] Pass 4 yielded', k6.length, '— pass 5: relax cooldown');
    for (const idx of allIdx) {
      if (k6.length >= 6) break;
      tryAdd(idx, true, true, true);
    }
  }

  // Pass 6: relax singles/doubles/triples quotas — if DB config caps sum < 6,
  // this guarantees we always deliver exactly 6 picks scored by the engine.
  // Only hard blocks remaining: no duplicate comboSets + no recent winners (today/yesterday).
  if (k6.length < 6) {
    console.log('[zk6v2] Pass 5 yielded', k6.length, '— pass 6: relax mult caps (DB quota < 6)');
    for (const idx of allIdx) {
      if (k6.length >= 6) break;
      tryAdd(idx, true, true, true, true);
    }
  }

  // Sort by indicator desc so position 1 is the highest-conviction pick (selection
  // happens pass-by-pass and can place low-indicator pass-1 picks ahead of higher-
  // indicator pass-5 picks). Same set of 6 combos, just reordered for display.
  //
  // ENG-MIDDAY-REORDER-01 + ENG-EVENING-REORDER-02 + ENG-REORDER-TIEBREAK-03
  // + ENG-ALLDAY-REORDER-04 (2026-06-09): all 3 scopes sort by `draws_since
  // desc` with a SCOPE-SPECIFIC tiebreak. Ties on ds are very frequent
  // (28/28 evening, 19/28 midday, similar for allday). Tiebreaker chosen
  // empirically — the signal that best discriminates hits among due picks:
  //   midday  → BOX asc    (CO=64 dominates score; pick #1 → 42.9%)
  //   evening → CO asc     (CONFIG-15 zeroed CO; pick #1 → 39.3%)
  //   allday  → PBURST desc (BOX-saturated score; pick #1 → 53.6%)
  // Empirical 30d pick #1 lift:
  //   midday  21.4% → 42.9% (+21.5pp)
  //   evening 21.4% → 39.3% (+17.9pp)
  //   allday  46.4% → 53.6% (+7.2pp)
  // Pick #2 also lifts substantially on midday/evening (midday p2: 7.1 → 32.1,
  // +25pp). Mid-rank picks (3-4) absorb the redistribution loss; slate-level
  // hit rate ≥1-of-6 unchanged (same combos, different order).
  // Per-state intelligence (ENH-AUDIT-2026-05-19 v2) is the structural fix;
  // this is the surgical interim.
  if (scope === 'midday') {
    k6.sort((a, b) => {
      const aDs = ds.drawsSinceMap.get(a.normKey) ?? 0;
      const bDs = ds.drawsSinceMap.get(b.normKey) ?? 0;
      if (aDs !== bDs) return bDs - aDs;
      return a.boxS - b.boxS;
    });
  } else if (scope === 'evening') {
    k6.sort((a, b) => {
      const aDs = ds.drawsSinceMap.get(a.normKey) ?? 0;
      const bDs = ds.drawsSinceMap.get(b.normKey) ?? 0;
      if (aDs !== bDs) return bDs - aDs;
      return a.coS - b.coS;
    });
  } else if (scope === 'allday') {
    k6.sort((a, b) => {
      const aDs = ds.drawsSinceMap.get(a.normKey) ?? 0;
      const bDs = ds.drawsSinceMap.get(b.normKey) ?? 0;
      if (aDs !== bDs) return bDs - aDs;
      return b.pburstS - a.pburstS;
    });
  } else {
    k6.sort((a, b) => b.indicator - a.indicator);
  }

  console.log('[zk6v2] K6 after rails:', k6.map(x => `${x.combo}(e=${x.energy})`));

  // Data quality verification log — ZK6 multi-signal component scores
  const top3 = k6.slice(0, 3).map(x => ({
    combo: x.combo,
    times_drawn: ds.timesDrawnMap.get(x.normKey) ?? 0,
    ds_raw: ds.dsRawMap.get(x.normKey) ?? 0,
    freqScore: x.freqS.toFixed(3),
    pressureScore: x.pressureS.toFixed(3),
    boxSignal: x.boxS.toFixed(3),
    pburstSignal: x.pburstS.toFixed(3),
    coSignal: x.coS.toFixed(3),
    finalScore: x.indicator.toFixed(4),
    energy: x.energy,
    isReal: (ds.timesDrawnMap.get(x.normKey) ?? 0) > 0,
  }));
  console.log('[zk6v2] Top-3 data quality check:', JSON.stringify(top3, null, 2));
  if (top3.some(x => !x.isReal)) {
    console.warn('[zk6v2] WARNING: placeholder in top 3 — only', realIdx.length, 'real-data combos available');
  }

  // ── 7. Confidence score ───────────────────────────────────────────────────────
  const scopeConfidence = computeConfidenceScore(ds.horizonsLoaded.length, ds.boxRowCount);

  // ── 8. Build output ───────────────────────────────────────────────────────────
  const sortedComboKey = (combo: string) =>
    combo.split('').sort().join('');

  const topKStraights = k6.map((x, idx) => {
    const sk = sortedComboKey(x.combo);
    // Direct row lookup avoids any key-normalization mismatch between map and combo
    const boxRow = ds.rawBoxRows.find(
      r => r && (
        (typeof r.key === 'string' && sortedComboKey(r.key.replace(/[^0-9]/g, '').slice(0, 3)) === sk) ||
        (typeof r.key_box === 'string' && sortedComboKey(r.key_box.replace(/[^0-9]/g, '').slice(0, 3)) === sk)
      )
    );
    // ENG-STATE-DATA-05 (2026-06-09): pure read-only metadata for UX badges +
    // state context. Defensive: if stateAggMap fetch failed earlier, these
    // fields default to safe empty values. Does NOT influence selection or sort.
    const stateAgg = stateAggMap.get(x.normKey);
    const topJurisdictions = stateAgg && stateAgg.byState.size > 0
      ? Array.from(stateAgg.byState.entries())
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .slice(0, 5)
          .map(([state, hits]) => ({ state, hits }))
      : [];
    return {
      combo: x.combo,
      comboSet: x.normKey,
      indicator: x.indicator,
      box: x.boxS,
      pburst: x.pburstS,
      co: x.coS,
      signals: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
      multiplicity: x.multiplicity,
      topPair: x.topPair,
      energy: x.energy,
      temperature: x.energy,        // backward compat
      rank: idx + 1,
      bestOrder: bestOrderFor(x.combo, ds.pairData, horizonWeights),
      confidence: Math.round(scopeConfidence * 100),
      // ENG-DEEPSCOPE-01 P3/D2 (2026-08-13): history-corrected map, matching
      // the DI top-30 rows — dsRawMap here showed the stale import-time value
      // whenever histories was fresher, so the slate card and the Intel row
      // disagreed about the same combo's overdue-ness. dsRaw below stays raw
      // by design (it is the dataset diagnostic, not the display field).
      drawsSince: ds.drawsSinceMap.get(x.normKey) ?? boxRow?.ds_raw ?? null,
      timesDrawn: boxRow?.times_drawn ?? ds.timesDrawnMap.get(x.normKey) ?? 0,
      dsRaw: boxRow?.ds_raw ?? ds.dsRawMap.get(x.normKey) ?? 0,
      lastSeen: ds.lastSeenMap.get(x.normKey) ?? boxRow?.last_seen ?? null,
      // ENG-STATE-DATA-05 metadata fields:
      tag: tagForPosition(idx + 1),
      topJurisdictions,
      recentStateHits14d: stateAgg?.totalHits ?? 0,
    };
  });

  // Hash for snapshot dedup — unsigned djb2 (always positive, includes mode)
  // Hash is deterministic: same scope+mode+picks+horizons → same hash.
  const hash = computeSlateHash(scope, weightsKey, k6.map(x => x.combo), ds.horizonsPresent);

  const dataStats: SlateDataStats = {
    boxRowsUsed: ds.boxRowCount,
    pairRowsUsed: ds.pairRowCount,
    horizonsLoaded: ds.horizonsLoaded,
    usingFallback: ds.usingFallback,
  };

  const horizonsMeta: EngineMetadata = {
    ...ds.horizonsPresent,
    _engineVersion: ENGINE_VERSION,
    _mode: weightsKey,
    _confidence: Math.round(scopeConfidence * 100),
    _dataStats: dataStats,
    _source: 'live',
    // ENG-SLATE-METRICS-06: recent slate-level match rates for operator/subscriber context.
    _recent7dMatchRatePct: slateMatchRates.recent7dMatchRatePct,
    _recent30dMatchRatePct: slateMatchRates.recent30dMatchRatePct,
    _slates7dCount: slateMatchRates.slates7d,
    _slates30dCount: slateMatchRates.slates30d,
    ...(is_supplement ? { _is_supplement: true } : {}),
  };

  const snapshot: SlateSnapshot = {
    id: `zk6-${scope}-${Date.now()}`,
    scope,
    horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: weightsKey },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k6.map(x => x.normKey),
    components_json: k6.map(x => ({
      combo: x.combo,
      components: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
      temperature: x.energy,
      multiplicity: x.multiplicity,
      topPair: x.topPair,
      indicator: x.indicator,
      energy: x.energy,
    })),
    updated_at_et: now,
    slate_date: effectiveDate,
    hash,
    // In-memory extended fields
    mode: weightsKey,
    engineVersion: ENGINE_VERSION,
    source: 'live',
    confidence: Math.round(scopeConfidence * 100),
    dataStats,
  };

  console.log('[zk6v2] Slate computed:', {
    scope, weightsKey,
    k6Count: k6.length,
    horizonsLoaded: ds.horizonsLoaded,
    usingFallback: ds.usingFallback,
    confidence: snapshot.confidence,
    hash: hash.slice(0, 8),
    topPicks: k6.slice(0, 6).map(x =>
      `${x.combo}(freq=${x.freqS.toFixed(2)},pres=${x.pressureS.toFixed(2)},box=${x.boxS.toFixed(2)},e=${x.energy})`
    ),
    dataStats,
  });

  const supplementExtra = is_supplement ? {
    file_meta: JSON.stringify({
      is_supplement: true,
      supplement_reason: 'post_hit_refresh',
      excluded_combo_sets: excludeComboSets,
    }),
  } : undefined;
  const savedId = await saveSlateSnapshot(snapshot, supplementExtra);
  if (typeof savedId === 'string' && savedId.length > 0) {
    snapshot.id = savedId;
  }

  // ENH-08: engine_runs telemetry — one row per slate generation capturing the
  // effective post-override config used. Parity with compute-slate-zk6/index.ts.
  // Non-fatal: a telemetry write failure never blocks slate save.
  if (!is_supplement) {
    try {
      await adminOpsFetch({
        path: '/rest/v1/engine_runs',
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: {
          slate_hash:           hash,
          scope,
          mode:                 weightsKey,
          slate_date:           effectiveDate,
          effective_weights:    {
            ...weights,
            _mode: weightsKey,
            // ENH-AFL-2: include adaptive diagnostics when applied. Null when
            // adaptive is disabled or fell back to base weights (cold-start).
            _adaptive: adaptiveDiagnostics ? {
              alpha: cfg.adaptiveSignalWeightsAlpha,
              auc: adaptiveDiagnostics.auc,
              base: adaptiveDiagnostics.base,
              clamped: adaptiveDiagnostics.clampedSignals,
            } : null,
          },
          horizons_present:     ds.horizonsPresent,
          horizons_loaded:      ds.horizonsLoaded,
          confidence_score:     Math.round(scopeConfidence * 100),
          using_fallback:       ds.usingFallback,
          box_freq_weight:      effBoxFreqWeight,
          box_pressure_weight:  effBoxPressureWeight,
          recent_hit_cooldown:  cfg.recentHitCooldown,
          min_energy_threshold: cfg.minEnergyThreshold,
          source:               'live',
          generated_at_et:      now,
        },
      });
    } catch (e) {
      console.warn('[zk6v2] engine_runs telemetry write failed (non-fatal):', String(e));
    }
  }

  // Write top 30 pre-rail picks to daily_intelligence.
  // Skip for supplemental slates — they use post-hit-exclusion picks which
  // would overwrite the original intelligence data with incomplete signal data.
  //
  // BUG-139 fix: previous write strategy was DELETE-WHERE-hit_box=false then INSERT
  // new top30 with `Prefer: resolution=ignore-duplicates`. This preserved rows where
  // hits had already been stamped, but caused the entire INSERT batch to abort
  // silently when the new top30 occupied a rank held by a preserved hit-row — the
  // unique constraint on (slate_date, scope, mode, rank) fired before
  // ignore-duplicates could short-circuit it. 2026-05-13 allday demonstrated this:
  // 916/924 preserved at ranks 2/8, regen failed to write the remaining ~28 rows,
  // Intel screen showed only those 2 picks. Midday/evening had no hits → no rank
  // conflict → wrote cleanly.
  //
  // New strategy: DELETE ALL rows unconditionally, INSERT fresh top30 + K6-extras
  // with hit annotations stamped from adaptive_tracking (slate_hash-keyed, the
  // canonical hit log per ENH-01). Combos that hit today but fell outside the new
  // top30/K6 get appended past rank 30 so the Track Record band's hit_box=true
  // count and Intel's "hit chip" still find them.
  if (!is_supplement) {
    try {
      const k6ComboSet = new Set(k6.map(x => x.combo));
      const top30Combos = new Set(top30PreRail.map(p => p.combo));

      // Recover hits from adaptive_tracking BEFORE the delete — combo → primary
      // match. Multi-state secondaries live in adaptive_tracking but
      // daily_intelligence has 1-row-per-(date,scope,mode,combo), so collapse here.
      const hitsByCombo = new Map<string, { hit_box: boolean; hit_straight: boolean; hit_state: string | null; hit_session: string | null; hit_result: string | null }>();
      try {
        const at = await fetchFromSupabase<any[]>({
          path: `/rest/v1/adaptive_tracking?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${encodeURIComponent(weightsKey)}&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo,hit_box,hit_straight,matched_state,matched_session,actual_result&limit=200`,
        });
        if (Array.isArray(at)) {
          for (const r of at) {
            if (!r.combo) continue;
            const existing = hitsByCombo.get(r.combo);
            if (!existing || (r.hit_straight && !existing.hit_straight)) {
              hitsByCombo.set(r.combo, {
                hit_box: !!r.hit_box,
                hit_straight: !!r.hit_straight,
                hit_state: r.matched_state ?? null,
                hit_session: r.matched_session ?? null,
                hit_result: r.actual_result ?? null,
              });
            }
          }
        }
      } catch (e) {
        console.warn('[zk6v2] adaptive_tracking hits fetch warn:', String(e));
      }

      const stamp = (combo: string) =>
        hitsByCombo.get(combo) ?? { hit_box: false, hit_straight: false, hit_state: null, hit_session: null, hit_result: null };

      const top30Rows = top30PreRail.map((pick, idx) => ({
        slate_date: effectiveDate,
        scope,
        mode: weightsKey,
        rank: idx + 1,
        combo: pick.combo,
        combo_set: pick.comboSet,
        multiplicity: pick.mult,
        top_pair: pick.topPair,
        signal_box: pick.signals.BOX,
        signal_pburst: pick.signals.PBURST,
        signal_co: pick.signals.CO,
        signal_dgc: pick.signals.DGC,
        energy_score: pick.energy,
        ...intelligenceRowExtras(pick.combo, pick.comboSet, ds.drawsSinceMap, ds.timesDrawnMap, ds.pairData, horizonWeights),
        on_slate: k6ComboSet.has(pick.combo),
        ...stamp(pick.combo),
      }));

      const extraK6Rows = k6
        .filter(x => !top30Combos.has(x.combo))
        .map((x, i) => ({
          slate_date: effectiveDate,
          scope,
          mode: weightsKey,
          rank: 30 + i + 1,
          combo: x.combo,
          combo_set: x.normKey,
          multiplicity: x.multiplicity,
          top_pair: x.topPair,
          signal_box: x.boxS,
          signal_pburst: x.pburstS,
          signal_co: x.coS,
          signal_dgc: x.dgcS,
          energy_score: x.energy,
          ...intelligenceRowExtras(x.combo, x.normKey, ds.drawsSinceMap, ds.timesDrawnMap, ds.pairData, horizonWeights),
          on_slate: true,
          ...stamp(x.combo),
        }));

      // Append any hit-bearing combo not placed by top30/K6 so Intel + Track
      // Record still see it. Typical case: today-hit comboSets are excluded
      // from the new top30 by design, but their historical hit row should
      // remain visible.
      const placedCombos = new Set([...top30Combos, ...k6ComboSet]);
      const k6ExtraEndRank = 30 + extraK6Rows.length;
      const hitOrphanRows = [...hitsByCombo.entries()]
        .filter(([combo]) => !placedCombos.has(combo))
        .map(([combo, h], i) => ({
          slate_date: effectiveDate,
          scope,
          mode: weightsKey,
          rank: k6ExtraEndRank + i + 1,
          combo,
          combo_set: `{${combo.split('').sort().join(',')}}`,
          multiplicity: null as any,
          top_pair: null as any,
          signal_box: 0, signal_pburst: 0, signal_co: 0, signal_dgc: 0,
          energy_score: 0,
          ...intelligenceRowExtras(combo, `{${combo.split('').sort().join(',')}}`, null, null, null),
          on_slate: false,
          hit_box: h.hit_box,
          hit_straight: h.hit_straight,
          hit_state: h.hit_state,
          hit_session: h.hit_session,
          hit_result: h.hit_result,
        }));

      const diRows = [...top30Rows, ...extraK6Rows, ...hitOrphanRows];
      const delErr = await adminOpsFetch({
        path: `/rest/v1/daily_intelligence?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${encodeURIComponent(weightsKey)}`,
        method: 'DELETE',
        prefer: 'return=minimal',
      }).then(() => null).catch((e: unknown) => e);
      if (delErr) {
        console.warn('[zk6v2] daily_intelligence DELETE failed (rows may already be absent):', String(delErr));
      }
      await adminOpsFetch({
        path: '/rest/v1/daily_intelligence',
        method: 'POST',
        prefer: 'return=minimal',
        body: diRows,
      });
      console.log('[zk6v2] daily_intelligence: wrote', diRows.length, 'rows for scope:', scope, 'date:', effectiveDate, '(' + hitOrphanRows.length + ' hit-orphans appended)');
    } catch (e) {
      console.error('[zk6v2] daily_intelligence write FAILED — date will not increment:', String(e));
    }

    // ─── E1+E2+E5: adaptive_tracking K6 primary rows ──────────────────────
    // One row per K6 pick at slate-gen time with full signals + quartile
    // flags + dominant_signal. Outcome columns (hit_box, hit_straight,
    // actual_result, matched_state) stay NULL until hit detection runs.
    // Together with hitDetection's UPSERT-style update path, this gives
    // adaptive_tracking complete signal/outcome pairs across BOTH hits and
    // misses — the foundation the Calibration Dashboard + intel:propose
    // need for real AUC analysis.
    //
    // Idempotency: skip INSERT if primary rows already exist for this
    // (slate_hash, mode). Same slate_hash → same picks → no new data.
    try {
      const existing = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking?slate_hash=eq.${encodeURIComponent(hash)}&mode=eq.${encodeURIComponent(weightsKey)}&matched_state=is.null&select=id&limit=1`,
      });
      if (Array.isArray(existing) && existing.length > 0) {
        console.log('[zk6v2] adaptive_tracking: slate_hash already has primary rows, skipping');
      } else {
      // Quartile thresholds — top-25% of the top30PreRail pool per signal.
      const q75 = (vals: number[]) => {
        const sorted = [...vals].sort((a, b) => a - b);
        return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length * 0.75)] ?? 0;
      };
      const boxQ75    = q75(top30PreRail.map(p => p.signals.BOX));
      const pburstQ75 = q75(top30PreRail.map(p => p.signals.PBURST));
      const coQ75     = q75(top30PreRail.map(p => p.signals.CO));
      const dgcQ75    = q75(top30PreRail.map(p => p.signals.DGC ?? 0));

      const atRows = k6.map((x, idx) => {
        const bs = x.boxS, ps = x.pburstS, cs = x.coS, ds = x.dgcS;
        const dominant =
          bs >= ps && bs >= cs && bs >= ds ? 'BOX' :
          ps >= cs && ps >= ds              ? 'PBURST' :
          cs >= ds                          ? 'CO' : 'DGC';
        return {
          slate_date: effectiveDate,
          scope,
          slate_hash: hash,
          rank: idx + 1,
          combo: x.combo,
          combo_set: x.normKey,
          signal_box:    bs,
          signal_pburst: ps,
          signal_co:     cs,
          // adaptive_tracking uses `signal_burst` as the DGC slot (legacy
          // name predates the DGC rename; renaming would break the existing
          // *_top_quartile column pair `burst_top_quartile`). Engine code
          // writes DGC values here; reads should treat them as DGC.
          signal_burst:  ds,
          energy_score:  x.energy,
          mode: weightsKey,
          // Outcome left NULL — hit detection fills these:
          // hit_box, hit_straight, actual_result, actual_set,
          // matched_state, matched_session, result_at.
          box_top_quartile:    bs >= boxQ75,
          pburst_top_quartile: ps >= pburstQ75,
          co_top_quartile:     cs >= coQ75,
          burst_top_quartile:  ds >= dgcQ75,  // DGC quartile lives in this flag
          dominant_signal: dominant,
        };
      });
      // Idempotent: regen will overwrite via merge-duplicates on (slate_hash, rank, combo).
      // No unique constraint exists, so successive regens just append historical
      // rows — that's fine since slate_hash differs per regen.
      await adminOpsFetch({
        path: '/rest/v1/adaptive_tracking',
        method: 'POST',
        prefer: 'return=minimal',
        body: atRows,
      });
      console.log('[zk6v2] adaptive_tracking: wrote', atRows.length, 'K6 primary rows');
      }
    } catch (e) {
      console.warn('[zk6v2] adaptive_tracking pre-write failed:', String(e));
    }
  }

  return snapshot;
}
