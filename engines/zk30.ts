/**
 * ZK30 Engine v1.0 (ARCH-06)
 *
 * Single-state TX Pick 3, 30-pick all-day slate. Parallel to ZK6 — see
 * MASTER_AUDIT ARCH-06 for the architecture lock-in.
 *
 * Hardcoded for v1.0: jurisdiction='TX', scope='allday', mode='balanced'.
 * Type-narrowed: H01Y + H02Y only via ZK30Horizon.
 *
 * Data sources:
 *   • datasets_box / datasets_pair where jurisdiction='TX' AND scope='allday'
 *   • histories_tx for live override (last_seen, draws_since, DGC dates)
 *
 * Write targets:
 *   • slate_snapshots_zk30        (1 row per gen, soft-delete prior)
 *   • daily_intelligence_zk30     (30 picks + hit orphans, DELETE-then-INSERT)
 *   • adaptive_tracking_zk30      (30 primary rows + quartile flags + dominant_signal)
 *   • engine_runs                 (telemetry, non-fatal, jurisdiction='TX')
 *
 * Don't-touch: engines/zk6.ts, lib/engineCore.ts, constants/zk6.ts,
 * compute-slate-zk6 Edge Function, ZK6 tables.
 */

import { SlateSnapshot, SlateDataStats, EngineMetadata, TopKStraightRow } from '@/types/core';
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import {
  ZK30_ENGINE_VERSION,
  ZK30_JURISDICTION,
  ZK30_SCOPE,
  ZK30_HORIZONS,
  HORIZON_WEIGHTS_ZK30,
  ZK30_WEIGHTS,
  K30_QUOTAS,
  PAIR_REPETITION_CAP_ZK30,
  type ZK30Horizon,
  type ZK30Mode,
} from '@/constants/zk30';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  MULTIPLICITY_PRIORS,
  toComboSet,
  sortedPair,
  multiplicityOf,
  topPairOf,
  buildUniverse,
  normalizeBoxKey,
  normalizePairKey,
  percentileRankOf,
  maxNorm,
  computeSlateHash,
  computeConfidenceScore,
  computeBoxSignalDetailed,
  blendBoxDsRaw,
  getPairSignalFromMap,
  bestOrderFor,
} from '@/lib/engineCore';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeSlateZK30Params {
  weightsKey?: ZK30Mode;
  targetDate?: string;
  /** Pre-built exclusion set (3-digit straights). */
  excludedCombos?: Set<string>;
  /** ComboSets to exclude from selection (supplement slates). */
  excludeComboSets?: string[];
  /** Mark as post-hit supplemental. */
  is_supplement?: boolean;
  /** Legacy params accepted-and-ignored for v1.0 (admin call sites still pass them).
   *  In v1.0 we hardcode jurisdiction='TX', scope='allday', mode='balanced'.
   *  Parameterize for real in v2.0 when expanding to SC/OH/NJ/NY/FL. */
  scope?: string;
  jurisdiction?: string;
  mode?: string;
}

type BoxByHorizon = Map<string, Map<string, number>>;
type PairTree = Map<string, Map<number, Map<string, number>>>;
interface PairMeta { dsRaw: number; drawsSince: number; timesDrawn: number; }

interface Datasets {
  boxByHorizon: BoxByHorizon;
  pairData: PairTree;
  pairMetaMap: Map<string, Map<number, PairMeta>>;
  drawsSinceMap: Map<string, number>;
  dsRawMap: Map<string, number>;
  timesDrawnMap: Map<string, number>;
  lastSeenMap: Map<string, string>;
  horizonsPresent: Record<string, boolean>;
  horizonsLoaded: string[];
  boxRowCount: number;
  pairRowCount: number;
  rawBoxRows: any[];
}

interface RailConfig {
  singlesMax: number;
  doublesMax: number;
  triplesMax: number;   // count, not boolean (diverges from ZK6's triplesOn)
  pairRepCap: number;
}

interface EngineConfig {
  weights: typeof ZK30_WEIGHTS.balanced;
  rails: RailConfig;
  pressureThreshold: number;
  minEnergyThreshold: number;
  recentHitCooldown: number;
  synergyOn: boolean;
  synergyWeight: number;
  boxFreqWeight: number;
  boxPressureWeight: number;
  /** DGC reference stdev (days). ZK6's lib/engineCore.ts uses 10 — too tight
   *  for TX single-state pace where median combo stdev ≈ 46d. 50 makes ~57%
   *  of combos register a real DGC signal. Tunable via app_config. */
  dgcRefStdDev: number;
  /** Minimum gap count before computing variance. Below this, computeDGCZK30
   *  returns a 0.15 baseline (not the 1.0 single-sample-variance freak value).
   *  Guards against 2-hit triples dominating maxNorm. */
  dgcMinGaps: number;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  weights: ZK30_WEIGHTS.balanced,
  rails: {
    singlesMax: K30_QUOTAS.singles,
    doublesMax: K30_QUOTAS.doubles,
    triplesMax: K30_QUOTAS.triples,
    pairRepCap: PAIR_REPETITION_CAP_ZK30,
  },
  pressureThreshold: 250,
  minEnergyThreshold: 70,
  recentHitCooldown: 20,
  synergyOn: false,
  synergyWeight: 0.15,
  boxFreqWeight: 0.60,
  boxPressureWeight: 0.40,
  dgcRefStdDev: 50,
  dgcMinGaps: 3,
};

// ─── ZK30-local DGC (replaces engineCore.computeDGC for this engine) ────────
//
// Why a local copy: lib/engineCore.ts is on the don't-touch list (ARCH-06)
// AND the constant DGC_REF_STD_DEV=10 there is calibrated for ZK6's national
// data pace (10× tighter clustering than TX single-state). Two bugs in the
// shared formula bite ZK30 specifically:
//   1. ref=10 vs TX median stdev ≈46 → 98% of combos return 0
//   2. dayOffsets.length<2 special-cased but length==2 yields
//      variance=0 → DGC=1.0 (false "perfect regularity" from one gap)
// This local function fixes both and accepts the constants as args so
// app_config tuning doesn't need a redeploy.
function computeDGCZK30(
  dayOffsets: number[],
  refStdDev: number,
  minGaps: number,
): number {
  if (dayOffsets.length === 0) return 0;
  // length < minGaps+1 means we have fewer than minGaps gaps. Return a weak
  // baseline so low-data combos can't dominate maxNorm with freak 1.0 values
  // but also don't get zeroed out completely.
  if (dayOffsets.length < minGaps + 1) return 0.15;
  const sorted = dayOffsets.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.max(0, 1 - Math.sqrt(variance) / refStdDev);
}

// ─── Slate hash (ZK30-specific, includes jurisdiction) ───────────────────────

/**
 * Wraps engineCore.computeSlateHash with jurisdiction folded in. Distinguishes
 * a TX slate from a hypothetical future SC slate that happens to produce the
 * same 30 picks. Format: prepend jurisdiction to scope so the existing djb2
 * input shape doesn't change.
 */
function computeSlateHashZK30(
  jurisdiction: string,
  scope: string,
  weightsKey: string,
  topCombos: string[],
  horizonsPresent: Record<string, unknown>,
): string {
  return computeSlateHash(
    `${jurisdiction}:${scope}`,
    weightsKey,
    topCombos,
    horizonsPresent,
  );
}

// ─── Config loading ──────────────────────────────────────────────────────────

async function loadEngineConfig(): Promise<EngineConfig> {
  try {
    const keys = [
      'zk30_pressure_threshold',
      'zk30_min_energy_threshold',
      'zk30_recent_hit_cooldown',
      'zk30_synergy_boost_on',
      'zk30_synergy_boost_weight',
      'zk30_box_freq_weight',
      'zk30_box_pressure_weight',
      'zk30_dgc_ref_std_dev',
      'zk30_dgc_min_gaps',
    ];
    const rows = await fetchFromSupabase<any[]>({
      path: '/rest/v1/app_config?key=in.(' + keys.join(',') + ')&select=key,value',
    });
    const cfg: EngineConfig = {
      weights: DEFAULT_ENGINE_CONFIG.weights,
      rails: { ...DEFAULT_ENGINE_CONFIG.rails },
      pressureThreshold: DEFAULT_ENGINE_CONFIG.pressureThreshold,
      minEnergyThreshold: DEFAULT_ENGINE_CONFIG.minEnergyThreshold,
      recentHitCooldown: DEFAULT_ENGINE_CONFIG.recentHitCooldown,
      synergyOn: DEFAULT_ENGINE_CONFIG.synergyOn,
      synergyWeight: DEFAULT_ENGINE_CONFIG.synergyWeight,
      boxFreqWeight: DEFAULT_ENGINE_CONFIG.boxFreqWeight,
      boxPressureWeight: DEFAULT_ENGINE_CONFIG.boxPressureWeight,
      dgcRefStdDev: DEFAULT_ENGINE_CONFIG.dgcRefStdDev,
      dgcMinGaps: DEFAULT_ENGINE_CONFIG.dgcMinGaps,
    };
    if (!Array.isArray(rows)) return cfg;
    for (const row of rows) {
      try {
        if (row.key === 'zk30_pressure_threshold')   { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 50) cfg.pressureThreshold = v; }
        else if (row.key === 'zk30_min_energy_threshold') { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) cfg.minEnergyThreshold = v; }
        else if (row.key === 'zk30_recent_hit_cooldown')  { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) cfg.recentHitCooldown = v; }
        else if (row.key === 'zk30_synergy_boost_on')     { cfg.synergyOn = row.value === 'true'; }
        else if (row.key === 'zk30_synergy_boost_weight') { const v = parseFloat(row.value); if (!isNaN(v) && v >= 0) cfg.synergyWeight = v; }
        else if (row.key === 'zk30_box_freq_weight')      { const v = parseFloat(row.value); if (!isNaN(v)) cfg.boxFreqWeight = v; }
        else if (row.key === 'zk30_box_pressure_weight')  { const v = parseFloat(row.value); if (!isNaN(v)) cfg.boxPressureWeight = v; }
        else if (row.key === 'zk30_dgc_ref_std_dev')      { const v = parseFloat(row.value); if (!isNaN(v) && v > 0) cfg.dgcRefStdDev = v; }
        else if (row.key === 'zk30_dgc_min_gaps')         { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 1) cfg.dgcMinGaps = v; }
      } catch {}
    }
    return cfg;
  } catch {
    return DEFAULT_ENGINE_CONFIG;
  }
}

// ─── Data fetch ──────────────────────────────────────────────────────────────

async function fetchRaw(): Promise<{ boxRows: any[]; pairRows: any[] }> {
  // Box: per-horizon parallel fetches. Only 2 horizons for ZK30 (H01Y, H02Y),
  // so 2 parallel requests instead of ZK6's 10.
  const boxHorizonFetches = ZK30_HORIZONS.map((h: ZK30Horizon) =>
    fetchFromSupabase<any[]>({
      path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${ZK30_SCOPE}` +
            `&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=eq.${ZK30_JURISDICTION}` +
            `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
    }).then(rows => Array.isArray(rows) ? rows : []),
  );

  // BUG-153 pagination on the pair fetch. TX pair universe per (scope,horizon)
  // is 685 rows × 2 horizons = 1370, exceeding the 1000-row PostgREST cap.
  const fetchPairRowsPaginated = async (): Promise<any[]> => {
    const all: any[] = [];
    const pageSize = 1000;
    const horizonClause = `horizon_label=in.(${ZK30_HORIZONS.join(',')})`;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/datasets_pair?scope=eq.${ZK30_SCOPE}&deleted_at=is.null` +
              `&jurisdiction=eq.${ZK30_JURISDICTION}&${horizonClause}` +
              `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label` +
              `&limit=${pageSize}&offset=${offset}`,
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

  return { boxRows: boxByHorizonArrays.flat(), pairRows };
}

async function fetchDatasets(): Promise<Datasets> {
  const timeout = new Promise<never>((_, r) =>
    setTimeout(() => r(new Error('ZK30 fetch timeout (20s)')), 20000),
  );
  console.log('[zk30] Fetching TX datasets (H01Y + H02Y)');

  const { boxRows, pairRows } = await Promise.race([fetchRaw(), timeout]);
  console.log('[zk30] Raw fetched:', { boxRows: boxRows.length, pairRows: pairRows.length });

  // Build boxByHorizon — same H01Y-preferred-metadata convention as ZK6 since
  // PBURST/CO consume metadata at the H01Y horizon (recon item 2).
  const boxByHorizon: BoxByHorizon = new Map();
  const drawsSinceMap = new Map<string, number>();
  const dsRawMap = new Map<string, number>();
  const timesDrawnMap = new Map<string, number>();
  const lastSeenMap = new Map<string, string>();

  for (const row of boxRows) {
    if (!row || typeof row.key !== 'string') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const rawDs: number = typeof row.ds_raw === 'number' ? row.ds_raw : 0;

    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, rawDs);

    if (row.times_drawn != null && row.times_drawn > (timesDrawnMap.get(normKey) ?? 0)) {
      timesDrawnMap.set(normKey, row.times_drawn);
    }
    if (h === 'H01Y' || !drawsSinceMap.has(normKey)) {
      const existing = dsRawMap.get(normKey) ?? 0;
      if (existing === 0 || rawDs > 0) {
        drawsSinceMap.set(normKey, rawDs);
        dsRawMap.set(normKey, rawDs);
      }
    }
    const ls = typeof row.last_seen === 'string' ? row.last_seen : null;
    if (ls && (!lastSeenMap.has(normKey) || ls > lastSeenMap.get(normKey)!)) {
      lastSeenMap.set(normKey, ls);
    }
  }

  // Build pairData + pairMetaMap (H01Y-preferred for meta per recon item 2).
  const pairData: PairTree = new Map();
  const pairMetaMap = new Map<string, Map<number, PairMeta>>();
  for (const row of pairRows) {
    if (!row || typeof row.class_id !== 'number') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const rawPairKey = row.key_pair ?? row.key;
    const pairKey = normalizePairKey(rawPairKey);
    const ds: number = typeof row.ds_raw === 'number' ? row.ds_raw : 0;

    if (!pairData.has(pairKey)) pairData.set(pairKey, new Map());
    const classMap = pairData.get(pairKey)!;
    if (!classMap.has(row.class_id)) classMap.set(row.class_id, new Map());
    classMap.get(row.class_id)!.set(h, ds);

    if (h === 'H01Y' || !pairMetaMap.get(pairKey)?.has(row.class_id)) {
      if (!pairMetaMap.has(pairKey)) pairMetaMap.set(pairKey, new Map());
      pairMetaMap.get(pairKey)!.set(row.class_id, {
        dsRaw: ds,
        drawsSince: ds || 500,
        timesDrawn: typeof row.times_drawn === 'number' ? row.times_drawn : 0,
      });
    }
  }

  const horizonsPresent: Record<string, boolean> = {};
  const horizonsLoaded: string[] = [];
  for (const h of ZK30_HORIZONS) {
    const has = (boxByHorizon.get(h)?.size ?? 0) > 0;
    horizonsPresent[h] = has;
    if (has) horizonsLoaded.push(h);
  }

  console.log('[zk30] Datasets loaded:', {
    horizonsLoaded, boxRows: boxRows.length, pairRows: pairRows.length,
    h01yBoxSize: boxByHorizon.get('H01Y')?.size ?? 0,
  });

  return {
    boxByHorizon, pairData, pairMetaMap, drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap,
    horizonsPresent, horizonsLoaded,
    boxRowCount: boxRows.length, pairRowCount: pairRows.length,
    rawBoxRows: boxRows,
  };
}

// ─── History overrides from histories_tx ─────────────────────────────────────

async function fetchHistoryOverrides(): Promise<{
  dsOverride: Map<string, number>;
  lsOverride: Map<string, string>;
  hitDatesMap: Map<string, number[]>;
}> {
  try {
    const rows: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await fetchFromSupabase<any[]>({
        path: `/rest/v1/histories_tx?select=result_digits,date_et&order=date_et.desc&limit=${pageSize}&offset=${offset}`,
      });
      const arr = Array.isArray(page) ? page : [];
      rows.push(...arr);
      if (arr.length < pageSize) break;
    }
    if (rows.length === 0) return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };

    const dsOverride = new Map<string, number>();
    const lsOverride = new Map<string, string>();
    const hitDatesMap = new Map<string, number[]>();
    const todayDays = Math.floor(Date.now() / 86400000);
    for (const row of rows) {
      if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) continue;
      const cs = toComboSet(row.result_digits);
      if (!dsOverride.has(cs)) {
        const rowMs = row.date_et ? new Date(String(row.date_et)).getTime() : 0;
        const actualDs = rowMs > 0 ? Math.max(0, todayDays - Math.floor(rowMs / 86400000)) : 999;
        dsOverride.set(cs, actualDs);
        lsOverride.set(cs, String(row.date_et));
      }
      if (row.date_et) {
        const dayOffset = Math.floor(new Date(String(row.date_et)).getTime() / 86400000);
        const dates = hitDatesMap.get(cs) ?? [];
        dates.push(dayOffset);
        hitDatesMap.set(cs, dates);
      }
    }
    return { dsOverride, lsOverride, hitDatesMap };
  } catch {
    return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };
  }
}

// ─── Snapshot save ───────────────────────────────────────────────────────────

async function saveSlateSnapshot(snapshot: SlateSnapshot, extraFields?: Record<string, unknown>): Promise<string> {
  const payload: Record<string, unknown> = {
    jurisdiction: ZK30_JURISDICTION,
    scope: snapshot.scope,
    mode: (snapshot as any).mode ?? 'balanced',
    engine_version: ZK30_ENGINE_VERSION,
    slate_date: snapshot.slate_date,
    horizons_present_json: snapshot.horizons_present_json,
    weights_json: snapshot.weights_json,
    top_k_straights_json: snapshot.top_k_straights_json,
    top_k_boxes_json: snapshot.top_k_boxes_json,
    components_json: snapshot.components_json,
    updated_at_et: snapshot.updated_at_et,
    snapshot_hash: snapshot.hash ?? '',
    hash: snapshot.hash ?? '',
    admin_published: true,
    ...(extraFields ?? {}),
  };

  // Soft-delete prior snapshot for same slate_date (skip for supplements).
  const isSupplement = (() => {
    try {
      const fm = extraFields?.file_meta;
      const parsed = typeof fm === 'string' ? JSON.parse(fm) : fm;
      return !!(parsed as any)?.is_supplement;
    } catch { return false; }
  })();
  if (!isSupplement) {
    try {
      await fetchFromSupabase<any>({
        path: `/rest/v1/slate_snapshots_zk30?slate_date=eq.${snapshot.slate_date}&deleted_at=is.null`,
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { deleted_at: new Date().toISOString() },
      });
    } catch (e) {
      console.warn('[zk30] soft-delete prior snapshots warn:', String(e));
    }
  }

  try {
    const res = await fetchFromSupabase<any>({
      path: '/rest/v1/slate_snapshots_zk30',
      method: 'POST',
      headers: { 'Prefer': 'return=representation' },
      body: payload,
    });
    const dbId = Array.isArray(res) && res.length > 0 ? (res[0]?.id as string | undefined) : undefined;
    console.log('[zk30] Snapshot saved:', { id: dbId, hash: (snapshot.hash ?? '').slice(0, 8) });
    return dbId ?? snapshot.id;
  } catch (err) {
    console.error('[zk30] Snapshot save failed:', String(err).slice(0, 300));
    throw err;
  }
}

// ─── computeSlateZK30 ────────────────────────────────────────────────────────

export async function computeSlateZK30({
  weightsKey = 'balanced',
  targetDate,
  excludedCombos = new Set<string>(),
  excludeComboSets = [],
  is_supplement = false,
  scope: legacyScope,
  jurisdiction: legacyJurisdiction,
  mode: legacyMode,
}: ComputeSlateZK30Params = {}): Promise<SlateSnapshot> {
  // v1.0 lock — warn if legacy call sites pass non-default values.
  if (legacyScope && legacyScope !== ZK30_SCOPE) {
    console.warn(`[zk30] ignoring scope='${legacyScope}' — v1.0 hardcoded to '${ZK30_SCOPE}'`);
  }
  if (legacyJurisdiction && legacyJurisdiction !== ZK30_JURISDICTION) {
    console.warn(`[zk30] ignoring jurisdiction='${legacyJurisdiction}' — v1.0 hardcoded to '${ZK30_JURISDICTION}'`);
  }
  if (legacyMode && legacyMode !== 'balanced') {
    console.warn(`[zk30] ignoring mode='${legacyMode}' — v1.0 hardcoded to 'balanced'`);
  }
  // Feature flag for future Edge Function migration (step 5).
  if (process.env.EXPO_PUBLIC_USE_EDGE_ZK30 === 'true') {
    console.log('[zk30] Edge mode — delegating to compute-slate-zk30');
    return await fetchFromSupabase<SlateSnapshot>({
      path: '/functions/v1/compute-slate-zk30',
      method: 'POST',
      body: { weightsKey, targetDate, excludeComboSets, is_supplement },
      timeoutMs: 60000,
    });
  }

  const now = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;

  const cfg = await loadEngineConfig();
  const { weights, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown,
          synergyOn, synergyWeight, boxFreqWeight, boxPressureWeight } = cfg;

  const universe = buildUniverse();
  console.log('[zk30] computeSlateZK30:', { date: effectiveDate, mode: weightsKey });
  console.log('[zk30] weights:', weights, 'rails:', rails);

  // 1. Fetch + overrides
  const [ds, { dsOverride, lsOverride, hitDatesMap }] = await Promise.all([
    fetchDatasets(),
    fetchHistoryOverrides(),
  ]);

  for (const [cs, actualDs] of dsOverride) {
    const stale = ds.drawsSinceMap.get(cs);
    if (stale == null || actualDs < stale) ds.drawsSinceMap.set(cs, actualDs);
  }
  for (const [cs, actualLs] of lsOverride) {
    const stale = ds.lastSeenMap.get(cs);
    if (!stale || actualLs > stale) ds.lastSeenMap.set(cs, actualLs);
  }

  const dgcMap = new Map<string, number>();
  // Use the ZK30-local DGC (engineCore.computeDGC is calibrated for ZK6's
  // national-pace data; TX needs ref ≈ 50 + min-gaps guard). See
  // computeDGCZK30 docblock for the two bugs this addresses.
  for (const [cs, dates] of hitDatesMap) {
    dgcMap.set(cs, computeDGCZK30(dates, cfg.dgcRefStdDev, cfg.dgcMinGaps));
  }

  if (ds.horizonsLoaded.length === 0) {
    throw new Error('No BOX data available for ZK30/TX');
  }

  // 2. Recent draws exclusion (today + yesterday) — HARD block.
  const todayHitComboSets = new Set<string>();
  const effectiveExcluded = new Set<string>(excludedCombos);
  const yesterdayEt = getYesterdayET();

  try {
    const recent = await fetchFromSupabase<any[]>({
      path: `/rest/v1/histories_tx?date_et=gte.${yesterdayEt}&date_et=lte.${todayEt}&select=result_digits&limit=1000`,
    });
    if (Array.isArray(recent)) {
      for (const w of recent) {
        if (typeof w?.result_digits === 'string' && /^\d{3}$/.test(w.result_digits)) {
          todayHitComboSets.add(toComboSet(w.result_digits));
          effectiveExcluded.add(w.result_digits);
        }
      }
    }
  } catch (e) { console.log('[zk30] recent exclusion warn:', e); }

  try {
    const di = await fetchFromSupabase<any[]>({
      path: `/rest/v1/daily_intelligence_zk30?slate_date=gte.${yesterdayEt}&or=(hit_box.eq.true,hit_straight.eq.true,hit_fireball_box.eq.true,hit_fireball_straight.eq.true)&select=combo_set,matched_result&limit=500`,
    });
    if (Array.isArray(di)) {
      for (const r of di) {
        if (typeof r?.combo_set === 'string' && r.combo_set) todayHitComboSets.add(r.combo_set);
        if (typeof r?.matched_result === 'string' && /^\d{3}$/.test(r.matched_result)) {
          todayHitComboSets.add(toComboSet(r.matched_result));
          effectiveExcluded.add(r.matched_result);
        }
      }
    }
  } catch (e) { console.log('[zk30] di exclusion warn:', e); }

  console.log('[zk30] Hard-block hit comboSets:', todayHitComboSets.size,
              'effective excluded straights:', effectiveExcluded.size);

  // 3. Find maxes for normalization
  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const td = ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0;
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  let maxPairTimesDrawn = 0;
  for (const classMap of ds.pairMetaMap.values()) {
    for (const meta of classMap.values()) {
      if (meta.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = meta.timesDrawn;
    }
  }
  const getPairSignal = (pk: string, cid: number): number =>
    getPairSignalFromMap(ds.pairMetaMap, pk, cid, maxPairTimesDrawn);

  // 4. Raw signals for 1000 combos
  const rawBox      = new Float64Array(1000);
  const rawFreq     = new Float64Array(1000);
  const rawPressure = new Float64Array(1000);
  const rawPburst   = new Float64Array(1000);
  const rawCo       = new Float64Array(1000);
  const rawDgc      = new Float64Array(1000);

  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const normKey = toComboSet(combo);
    const [a, b, c] = combo;

    const td = ds.timesDrawnMap.get(normKey) ?? 0;
    const dsVal = blendBoxDsRaw(normKey, ds.boxByHorizon, HORIZON_WEIGHTS_ZK30 as Record<string, number>);
    const parts = computeBoxSignalDetailed(td, dsVal, maxTimesDrawn, pressureThreshold,
                                           boxFreqWeight, boxPressureWeight);
    rawFreq[i] = parts.freq;
    rawPressure[i] = parts.pressure;
    rawBox[i] = parts.box;

    const ab = sortedPair(a, b);
    const bc = sortedPair(b, c);
    const ac = sortedPair(a, c);
    rawPburst[i] = (getPairSignal(ab, 2) + getPairSignal(bc, 3) + getPairSignal(ac, 4)) / 3;

    let coSum = 0;
    const pairs = [ab, bc, ac];
    for (const cid of [5, 6, 7, 8, 9, 10, 11]) {
      for (const pk of pairs) coSum += getPairSignal(pk, cid);
    }
    rawCo[i] = coSum / (7 * 3);

    rawDgc[i] = dgcMap.get(normKey) ?? 0;
  }

  // 5. Normalize 0–1
  const rawBoxArr = Array.from(rawBox);
  const realBoxMasked = rawBoxArr.map((v, i) =>
    (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? v : 0);
  const normBoxRaw = maxNorm(realBoxMasked, true);
  const normBox = normBoxRaw.map((v, i) =>
    (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) === 0 ? 0 : v);
  const normPburst = maxNorm(Array.from(rawPburst), true);
  const normCo     = maxNorm(Array.from(rawCo), true);
  const normDgc    = maxNorm(Array.from(rawDgc), true);

  // 6. Final scores
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const multAdj = MULTIPLICITY_PRIORS[multiplicityOf(combo)];
    finalScores[i] =
      weights.BOX    * normBox[i] +
      weights.PBURST * normPburst[i] +
      weights.CO     * normCo[i] +
      weights.DGC    * normDgc[i] +
      multAdj;
    if (synergyOn && [normBox[i], normPburst[i], normCo[i], normDgc[i]].filter(v => v >= 0.65).length >= 2) {
      finalScores[i] *= (1 + synergyWeight);
    }
  }

  // 7. Six-pass K30 selection
  const realIdx: number[] = [];
  const placeholderIdx: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const nk = toComboSet(universe[i]);
    if ((ds.timesDrawnMap.get(nk) ?? 0) > 0) realIdx.push(i);
    else placeholderIdx.push(i);
  }
  const scoreCmp = (a: number, b: number) =>
    finalScores[b] !== finalScores[a] ? finalScores[b] - finalScores[a]
                                       : universe[a].localeCompare(universe[b]);
  realIdx.sort(scoreCmp);
  placeholderIdx.sort(scoreCmp);

  const scorePoolForEnergy = Array.from(finalScores).sort((a, b) => a - b);

  interface K30Item {
    combo: string; normKey: string;
    indicator: number;
    freqS: number; pressureS: number;
    boxS: number; pburstS: number; coS: number; dgcS: number;
    energy: number; multiplicity: 'singles' | 'doubles' | 'triples'; topPair: string;
  }
  const k30: K30Item[] = [];
  let singles = 0, doubles = 0, triples = 0;
  const pairCounts: Record<string, number> = {};
  const selectedComboSets = new Set<string>();
  const excludeSet = new Set(excludeComboSets);

  const tryAdd = (
    idx: number,
    relaxExcludes = false,
    relaxPairCap = false,
    relaxCooldown = false,
    relaxMultCaps = false,
  ): boolean => {
    if (k30.length >= 30) return false;
    const combo = universe[idx];
    const normKey = toComboSet(combo);
    if (selectedComboSets.has(normKey)) return false;
    if (todayHitComboSets.size > 0 && todayHitComboSets.has(normKey)) return false;
    if (!relaxExcludes && effectiveExcluded.has(combo)) return false;
    if (!relaxExcludes && excludeSet.size > 0 && excludeSet.has(normKey)) return false;
    const mult = multiplicityOf(combo);
    if (!relaxMultCaps) {
      if (mult === 'singles' && singles >= rails.singlesMax) return false;
      if (mult === 'doubles' && doubles >= rails.doublesMax) return false;
      if (mult === 'triples' && triples >= rails.triplesMax) return false;
    }
    const tp = topPairOf(combo);
    if (!relaxPairCap && (pairCounts[tp] ?? 0) >= rails.pairRepCap) return false;
    const energy = percentileRankOf(finalScores[idx], scorePoolForEnergy);
    if (minEnergyThreshold > 0 &&
        (ds.timesDrawnMap.get(normKey) ?? 0) > 0 &&
        energy < minEnergyThreshold) return false;
    const recentDs = ds.drawsSinceMap.get(normKey) ?? 999;
    if (!relaxCooldown && recentHitCooldown > 0 && dsOverride.has(normKey) &&
        (ds.timesDrawnMap.get(normKey) ?? 0) > 0 && recentDs < recentHitCooldown) return false;
    k30.push({
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

  // Pass 1: real data, full rails
  for (const idx of realIdx) { if (k30.length >= 30) break; tryAdd(idx); }
  // Pass 2: placeholder fill
  if (k30.length < 30) {
    console.warn('[zk30] Pass 1 short:', k30.length, '— filling placeholders');
    for (const idx of placeholderIdx) { if (k30.length >= 30) break; tryAdd(idx); }
  }
  // Pass 3: relax excludes
  if (k30.length < 30) {
    console.log('[zk30] Pass 2 →', k30.length, '— relax excludes');
    for (const idx of allIdx) { if (k30.length >= 30) break; tryAdd(idx, true); }
  }
  // Pass 4: + relax pairRepCap
  if (k30.length < 30) {
    console.log('[zk30] Pass 3 →', k30.length, '— relax pairRepCap');
    for (const idx of allIdx) { if (k30.length >= 30) break; tryAdd(idx, true, true); }
  }
  // Pass 5: + relax cooldown
  if (k30.length < 30) {
    console.log('[zk30] Pass 4 →', k30.length, '— relax cooldown');
    for (const idx of allIdx) { if (k30.length >= 30) break; tryAdd(idx, true, true, true); }
  }
  // Pass 6: + relax mult caps (last resort)
  if (k30.length < 30) {
    console.log('[zk30] Pass 5 →', k30.length, '— relax mult caps');
    for (const idx of allIdx) { if (k30.length >= 30) break; tryAdd(idx, true, true, true, true); }
  }

  k30.sort((a, b) => b.indicator - a.indicator);
  console.log('[zk30] K30 composition:', { singles, doubles, triples, total: k30.length });

  // 8. Confidence + snapshot
  const scopeConfidence = computeConfidenceScore(ds.horizonsLoaded.length, ds.boxRowCount);

  // TopKStraightRow doesn't formally type the `signals` extra (ZK6 also writes
  // it informally); cast to keep TS happy while preserving the shape the UI
  // expects.
  const topKStraights = k30.map((x, idx) => ({
    combo: x.combo,
    comboSet: x.normKey,
    indicator: x.indicator,
    box: x.boxS, pburst: x.pburstS, co: x.coS,
    signals: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
    multiplicity: x.multiplicity,
    topPair: x.topPair,
    energy: x.energy,
    temperature: x.energy,
    rank: idx + 1,
    bestOrder: bestOrderFor(x.combo, ds.pairData),
    confidence: Math.round(scopeConfidence * 100),
    drawsSince: ds.dsRawMap.get(x.normKey) ?? undefined,
    timesDrawn: ds.timesDrawnMap.get(x.normKey) ?? 0,
    dsRaw: ds.dsRawMap.get(x.normKey) ?? 0,
    lastSeen: ds.lastSeenMap.get(x.normKey) ?? undefined,
  })) as TopKStraightRow[];

  // ZK30-specific hash includes jurisdiction.
  const hash = computeSlateHashZK30(
    ZK30_JURISDICTION, ZK30_SCOPE, weightsKey,
    k30.map(x => x.combo), ds.horizonsPresent,
  );

  const dataStats: SlateDataStats = {
    boxRowsUsed: ds.boxRowCount,
    pairRowsUsed: ds.pairRowCount,
    horizonsLoaded: ds.horizonsLoaded,
    usingFallback: false,
  };

  const horizonsMeta: EngineMetadata = {
    ...ds.horizonsPresent,
    _engineVersion: ZK30_ENGINE_VERSION,
    _mode: weightsKey,
    _confidence: Math.round(scopeConfidence * 100),
    _dataStats: dataStats,
    _source: 'live',
    ...(is_supplement ? { _is_supplement: true } : {}),
  };

  const snapshot: SlateSnapshot = {
    id: `zk30-${ZK30_JURISDICTION}-${Date.now()}`,
    scope: ZK30_SCOPE,
    horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: weightsKey },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k30.map(x => x.normKey),
    components_json: k30.map(x => ({
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
    mode: weightsKey,
    engineVersion: ZK30_ENGINE_VERSION,
    source: 'live',
    confidence: Math.round(scopeConfidence * 100),
    dataStats,
  };

  const supplementExtra = is_supplement ? {
    file_meta: JSON.stringify({
      is_supplement: true,
      supplement_reason: 'post_hit_refresh',
      excluded_combo_sets: excludeComboSets,
    }),
  } : undefined;
  const savedId = await saveSlateSnapshot(snapshot, supplementExtra);
  if (typeof savedId === 'string' && savedId.length > 0) snapshot.id = savedId;

  // Telemetry — non-fatal.
  if (!is_supplement) {
    try {
      await fetchFromSupabase({
        path: '/rest/v1/engine_runs',
        method: 'POST',
        // engine_runs has UNIQUE (slate_hash, mode); merge-duplicates upserts
        // on re-runs (avoids 409). Parity with ZK6 telemetry + edge fn.
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: {
          slate_hash:           hash,
          scope:                ZK30_SCOPE,
          mode:                 weightsKey,
          slate_date:           effectiveDate,
          effective_weights:    { ...weights, _mode: weightsKey, _engine: 'zk30', _jurisdiction: ZK30_JURISDICTION },
          horizons_present:     ds.horizonsPresent,
          horizons_loaded:      ds.horizonsLoaded,
          confidence_score:     Math.round(scopeConfidence * 100),
          using_fallback:       false,
          box_freq_weight:      boxFreqWeight,
          box_pressure_weight:  boxPressureWeight,
          recent_hit_cooldown:  recentHitCooldown,
          min_energy_threshold: minEnergyThreshold,
          source:               'live',
          generated_at_et:      now,
        },
      });
    } catch (e) {
      console.warn('[zk30] engine_runs telemetry failed (non-fatal):', String(e));
    }
  }

  // ── daily_intelligence_zk30 — DELETE-then-INSERT (BUG-139 pattern) ─────
  if (!is_supplement) {
    try {
      const placedCombos = new Set(k30.map(x => x.combo));

      // Recover existing hits from adaptive_tracking_zk30 BEFORE the delete.
      const hitsByCombo = new Map<string, {
        hit_box: boolean; hit_straight: boolean;
        hit_fireball_box: boolean; hit_fireball_straight: boolean;
        matched_session: string | null; matched_result: string | null; matched_fireball: string | null;
      }>();
      try {
        const at = await fetchFromSupabase<any[]>({
          path: `/rest/v1/adaptive_tracking_zk30?slate_date=eq.${effectiveDate}&or=(hit_box.eq.true,hit_straight.eq.true,hit_fireball_box.eq.true,hit_fireball_straight.eq.true)&select=combo,hit_box,hit_straight,hit_fireball_box,hit_fireball_straight,matched_session,matched_result,matched_fireball&limit=200`,
        });
        if (Array.isArray(at)) {
          for (const r of at) {
            if (!r.combo) continue;
            const existing = hitsByCombo.get(r.combo);
            // Prefer rows that have a straight match
            if (!existing || (r.hit_straight && !existing.hit_straight)) {
              hitsByCombo.set(r.combo, {
                hit_box: !!r.hit_box,
                hit_straight: !!r.hit_straight,
                hit_fireball_box: !!r.hit_fireball_box,
                hit_fireball_straight: !!r.hit_fireball_straight,
                matched_session: r.matched_session ?? null,
                matched_result: r.matched_result ?? null,
                matched_fireball: r.matched_fireball ?? null,
              });
            }
          }
        }
      } catch (e) { console.warn('[zk30] adaptive_tracking_zk30 hits fetch warn:', String(e)); }

      const stamp = (combo: string) =>
        hitsByCombo.get(combo) ?? {
          hit_box: false, hit_straight: false,
          hit_fireball_box: false, hit_fireball_straight: false,
          matched_session: null, matched_result: null, matched_fireball: null,
        };

      // 30 slate rows
      const k30Rows = k30.map((x, idx) => ({
        slate_date: effectiveDate,
        rank: idx + 1,
        combo: x.combo,
        combo_set: x.normKey,
        multiplicity: x.multiplicity,
        top_pair: x.topPair,
        signal_box: x.boxS,
        signal_pburst: x.pburstS,
        signal_co: x.coS,
        signal_dgc: x.dgcS,
        energy_score: x.energy,
        draws_since: ds.dsRawMap.get(x.normKey) ?? null,
        times_drawn: ds.timesDrawnMap.get(x.normKey) ?? 0,
        best_order: bestOrderFor(x.combo, ds.pairData),
        on_slate: true,
        ...stamp(x.combo),
      }));

      // Hit-orphan rows: combos that hit but aren't on this slate.
      const hitOrphanRows = [...hitsByCombo.entries()]
        .filter(([combo]) => !placedCombos.has(combo))
        .map(([combo, h], i) => ({
          slate_date: effectiveDate,
          rank: 30 + i + 1,
          combo,
          combo_set: toComboSet(combo),
          multiplicity: null as any,
          top_pair: null as any,
          signal_box: 0, signal_pburst: 0, signal_co: 0, signal_dgc: 0,
          energy_score: 0,
          draws_since: null,
          times_drawn: 0,
          best_order: combo,
          on_slate: false,
          hit_box: h.hit_box,
          hit_straight: h.hit_straight,
          hit_fireball_box: h.hit_fireball_box,
          hit_fireball_straight: h.hit_fireball_straight,
          matched_session: h.matched_session,
          matched_result: h.matched_result,
          matched_fireball: h.matched_fireball,
        }));

      const diRows = [...k30Rows, ...hitOrphanRows];

      const delErr = await fetchFromSupabase({
        path: `/rest/v1/daily_intelligence_zk30?slate_date=eq.${effectiveDate}`,
        method: 'DELETE',
        headers: { 'Prefer': 'return=minimal' },
      }).then(() => null).catch((e: unknown) => e);
      if (delErr) console.warn('[zk30] daily_intelligence_zk30 DELETE warn:', String(delErr));

      await fetchFromSupabase({
        path: '/rest/v1/daily_intelligence_zk30',
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
        body: diRows,
      });
      console.log('[zk30] daily_intelligence_zk30: wrote', diRows.length,
                  'rows (' + hitOrphanRows.length + ' hit-orphans)');
    } catch (e) {
      console.error('[zk30] daily_intelligence_zk30 write FAILED:', String(e));
    }

    // ── adaptive_tracking_zk30 — 30 primary rows + quartiles + dominant_signal
    // Idempotent: skip INSERT if (slate_hash, slate_date) already has primary
    // rows. slate_date scope-down was added 2026-05-25 after step 5.4 surfaced
    // hash-only dedup blocking second-day writes (identical TX data + algorithm
    // produced same hash across dates).
    try {
      const existing = await fetchFromSupabase<any[]>({
        path: `/rest/v1/adaptive_tracking_zk30?slate_hash=eq.${encodeURIComponent(hash)}&slate_date=eq.${effectiveDate}&matched_session=is.null&select=id&limit=1`,
      });
      if (Array.isArray(existing) && existing.length > 0) {
        console.log('[zk30] adaptive_tracking_zk30: primary rows already exist for hash, skipping');
      } else {
        const q75 = (vals: number[]) => {
          const sorted = [...vals].sort((a, b) => a - b);
          return sorted.length === 0 ? 0 : sorted[Math.floor(sorted.length * 0.75)] ?? 0;
        };
        const boxQ75    = q75(k30.map(p => p.boxS));
        const pburstQ75 = q75(k30.map(p => p.pburstS));
        const coQ75     = q75(k30.map(p => p.coS));
        const dgcQ75    = q75(k30.map(p => p.dgcS));

        const atRows = k30.map((x, idx) => {
          const dominant: 'box' | 'pburst' | 'co' | 'dgc' =
            x.boxS >= x.pburstS && x.boxS >= x.coS && x.boxS >= x.dgcS ? 'box' :
            x.pburstS >= x.coS && x.pburstS >= x.dgcS ? 'pburst' :
            x.coS >= x.dgcS ? 'co' : 'dgc';
          return {
            slate_date: effectiveDate,
            slate_hash: hash,
            rank: idx + 1,
            combo: x.combo,
            combo_set: x.normKey,
            signal_box: x.boxS,
            signal_pburst: x.pburstS,
            signal_co: x.coS,
            signal_dgc: x.dgcS,
            energy_score: x.energy,
            box_top_quartile:    x.boxS    >= boxQ75,
            pburst_top_quartile: x.pburstS >= pburstQ75,
            co_top_quartile:     x.coS     >= coQ75,
            dgc_top_quartile:    x.dgcS    >= dgcQ75,
            dominant_signal: dominant,
            // hit_* + matched_* left NULL until hit detection runs.
          };
        });

        await fetchFromSupabase({
          path: '/rest/v1/adaptive_tracking_zk30',
          method: 'POST',
          headers: { 'Prefer': 'return=minimal' },
          body: atRows,
        });
        console.log('[zk30] adaptive_tracking_zk30: wrote', atRows.length, 'primary rows');
      }
    } catch (e) {
      console.warn('[zk30] adaptive_tracking_zk30 primary write failed:', String(e));
    }
  }

  return snapshot;
}

/**
 * Legacy alias kept so existing admin call sites (e.g. DashboardView.tsx)
 * continue to compile. Same behavior as computeSlateZK30 — v1.0 ignores any
 * scope/jurisdiction/mode args silently (with a console.warn).
 */
export const computeZK30Slate = computeSlateZK30;
