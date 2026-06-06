/**
 * replay.ts — computeSlateAsOf(date, scope, config)
 *
 * Re-runs the ZK6 engine for a past date with an explicit config.
 * Uses today's datasets_box/datasets_pair (approximation — see note below).
 * History-derived dsOverride corrects drawsSince accurately for any past date.
 *
 * APPROXIMATION: datasets_box and datasets_pair reflect current data, not
 * data as it existed on the backtest date. timesDrawn is slightly forward-biased
 * (a combo with 50 hits today may have had 48 on the backtest date; ~1-3% drift
 * over 30 days). Relative comparisons between configs are reliable. Absolute hit
 * rate may be slightly inflated. A v2 enhancement can reconstruct full as-of
 * stats from histories.
 *
 * ZERO DATABASE WRITES: only GET requests are issued.
 */

import { dbGet } from './data.js';
import {
  toComboSet, normalizePairKey, normalizeBoxKey, buildUniverse,
  multiplicityOf, topPairOf, sortedPair,
  computeBoxSignal, maxNorm, percentileRankOf,
  MULTIPLICITY_PRIORS, H_ALL, HORIZON_WEIGHTS,
  blendBoxTimesDrawn, blendPairTimesDrawn,
  computeAdaptiveWeights,
  type PairTimesDrawnTree,
  type SignalAuc,
  computeDGC, blendBoxDsRaw, getPairSignalFromMap,
  bestOrderFor, type PairDataTree,
  computeWeightedScore,
  buildWarmingMap,
} from '../../lib/engineCore.js';
import type { EngineConfig, ReplayPick, Scope } from './types.js';

type PairMeta = { dsRaw: number; drawsSince: number; timesDrawn: number };

// ── Data fetch helpers ────────────────────────────────────────────────────────

async function fetchBoxRows(scopeEnc: string): Promise<any[]> {
  const perHorizon = await Promise.all(
    H_ALL.map(h =>
      dbGet<any[]>(
        `/datasets_box?class_id=eq.1&scope=eq.${scopeEnc}&horizon_label=eq.${h}` +
        `&deleted_at=is.null&jurisdiction=is.null` +
        `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
      ).then(r => (Array.isArray(r) ? r : [])),
    ),
  );
  return perHorizon.flat();
}

async function fetchPairRows(scopeEnc: string): Promise<any[]> {
  // BUG-153: PostgREST caps responses at 1000 rows; paginate to get the full
  // pair dataset across all classes × horizons. Mirrors the production fix in
  // engines/zk6.ts + compute-slate-zk6.
  const all: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const page = await dbGet<any[]>(
      `/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=is.null` +
      `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=${pageSize}&offset=${offset}`,
    );
    const arr = Array.isArray(page) ? page : [];
    all.push(...arr);
    if (arr.length < pageSize) break;
  }
  return all;
}

async function fetchHistoryRows(date: string, scope: Scope): Promise<any[]> {
  // BUG-152: PostgREST caps responses at 1000 rows; paginate to get the full
  // intended window. Mirrors the production fix planned for engines/zk6.ts +
  // compute-slate-zk6 edge fn.
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const all: any[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 20000; offset += pageSize) {
    const page = await dbGet<any[]>(
      `/histories?select=result_digits,date_et,session` +
      `&date_et=lt.${date}${sessionClause}&order=date_et.desc&limit=${pageSize}&offset=${offset}`,
    );
    const rows = Array.isArray(page) ? page : [];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

/**
 * ENH-WARMING-2026-06-06: fetch draws within the prior N-day window for
 * warming-signal computation.
 *
 * v1 (cross-session): NO session filter — counts every national draw in window.
 * Backtest showed midday r1 collapse + allday slate -6.9pp, hypothesis was
 * "cross-session noise pollutes scope-specific predictions."
 *
 * v2 (scope-matched): when `scope` is midday or evening, filters to matching
 * session — matches the engine's existing data pattern (datasets_box/_pair
 * are scope-filtered too). When scope is allday, no filter (all sessions
 * count, same as v1). Caller picks v1 vs v2 via the `scopeMatched` parameter
 * — config field warmingScopeMatched plumbs through.
 */
async function fetchWarmingHistory(
  date: string,
  windowDays: number,
  scope: Scope,
  scopeMatched: boolean,
): Promise<{ comboset_sorted: string; date_et: string }[]> {
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - windowDays);
  const fromDate = d.toISOString().split('T')[0];
  const sessionClause = (scopeMatched && scope !== 'allday') ? `&session=eq.${scope}` : '';
  const all: { comboset_sorted: string; date_et: string }[] = [];
  const pageSize = 1000;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const page = await dbGet<any[]>(
      `/histories?select=comboset_sorted,date_et` +
      `&date_et=gte.${fromDate}&date_et=lt.${date}${sessionClause}` +
      `&order=date_et.desc&limit=${pageSize}&offset=${offset}`,
    );
    const rows = Array.isArray(page) ? page : [];
    for (const r of rows) {
      if (r && typeof r.comboset_sorted === 'string' && typeof r.date_et === 'string') {
        all.push({ comboset_sorted: r.comboset_sorted, date_et: r.date_et });
      }
    }
    if (rows.length < pageSize) break;
  }
  return all;
}

async function fetchYesterdayResults(date: string): Promise<Set<string>> {
  // Yesterday's actual draws → hard exclusion set (same logic as production engine)
  const d = new Date(date + 'T12:00:00');
  d.setDate(d.getDate() - 1);
  const yesterday = d.toISOString().split('T')[0];
  const rows = await dbGet<any[]>(
    `/histories?date_et=eq.${yesterday}&select=result_digits&limit=500`,
  );
  const s = new Set<string>();
  if (Array.isArray(rows)) {
    for (const r of rows) {
      if (typeof r?.result_digits === 'string' && /^\d{3}$/.test(r.result_digits)) {
        s.add(toComboSet(r.result_digits));
      }
    }
  }
  return s;
}

// ── Dataset builder ───────────────────────────────────────────────────────────

function buildDatasets(boxRows: any[], pairRows: any[]) {
  const timesDrawnMap = new Map<string, number>();
  const dsRawMap = new Map<string, number>();       // H01Y preferred, used for BOX scoring
  const drawsSinceMap = new Map<string, number>();  // will be corrected by dsOverride
  // ENH-HW: per-horizon ds_raw, so BOX scoring can blend across horizons
  // using config.horizonWeights. Mirrors engine's boxByHorizon.
  const boxByHorizon = new Map<string, Map<string, number>>();
  // ENH-TDB (2026-05-27): per-horizon BOX times_drawn for the blend path.
  // Built unconditionally so any config can opt in; legacy timesDrawnMap stays.
  const boxTimesDrawnByHorizon = new Map<string, Map<string, number>>();

  for (const row of boxRows) {
    if (!row || typeof row.key !== 'string') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const rawDs = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const rawTd = typeof row.times_drawn === 'number' ? row.times_drawn : 0;

    if (row.times_drawn != null && row.times_drawn > (timesDrawnMap.get(normKey) ?? 0)) {
      timesDrawnMap.set(normKey, row.times_drawn);
    }

    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, rawDs);

    if (!boxTimesDrawnByHorizon.has(h)) boxTimesDrawnByHorizon.set(h, new Map());
    boxTimesDrawnByHorizon.get(h)!.set(normKey, rawTd);

    // H01Y preferred for drawsSince/dsRaw; within H01Y, non-zero wins
    if (h === 'H01Y' || !drawsSinceMap.has(normKey)) {
      const existing = dsRawMap.get(normKey) ?? 0;
      if (existing === 0 || rawDs > 0) {
        drawsSinceMap.set(normKey, rawDs);
        dsRawMap.set(normKey, rawDs);
      }
    }
  }

  const pairMetaMap = new Map<string, Map<number, PairMeta>>();
  // Per-horizon pair ds_raw tree — needed by bestOrderFor to compute the
  // position-pair maximised arrangement of each pick (production parity:
  // engines/zk6.ts builds the same structure). Indexed pairKey → classId →
  // horizonLabel → ds_raw.
  const pairData: PairDataTree = new Map();
  // ENH-TDB: per-horizon pair times_drawn tree, parallel structure to pairData.
  // Indexed pairKey → classId → horizonLabel → times_drawn. Consumed by the
  // blend path via blendPairTimesDrawn.
  const pairTimesDrawnByHorizon: PairTimesDrawnTree = new Map();

  for (const row of pairRows) {
    if (!row || typeof row.class_id !== 'number') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const rawPairKey = row.key_pair ?? row.key;
    const pairKey = normalizePairKey(rawPairKey);
    const dsRaw = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const rawTd = typeof row.times_drawn === 'number' ? row.times_drawn : 0;

    // Per-horizon pair ds_raw tree (consumed by bestOrderFor).
    if (!pairData.has(pairKey)) pairData.set(pairKey, new Map());
    const classMap = pairData.get(pairKey)!;
    if (!classMap.has(row.class_id)) classMap.set(row.class_id, new Map());
    classMap.get(row.class_id)!.set(h, dsRaw);

    // Per-horizon pair times_drawn tree (consumed by blendPairTimesDrawn).
    if (!pairTimesDrawnByHorizon.has(pairKey)) pairTimesDrawnByHorizon.set(pairKey, new Map());
    const tdClassMap = pairTimesDrawnByHorizon.get(pairKey)!;
    if (!tdClassMap.has(row.class_id)) tdClassMap.set(row.class_id, new Map());
    tdClassMap.get(row.class_id)!.set(h, rawTd);

    if (h === 'H01Y' || !pairMetaMap.get(pairKey)?.has(row.class_id)) {
      if (!pairMetaMap.has(pairKey)) pairMetaMap.set(pairKey, new Map());
      pairMetaMap.get(pairKey)!.set(row.class_id, {
        dsRaw,
        drawsSince: typeof row.ds_raw === 'number' ? row.ds_raw : 500,
        timesDrawn: rawTd,
      });
    }
  }

  return { timesDrawnMap, dsRawMap, drawsSinceMap, pairMetaMap, boxByHorizon, pairData, boxTimesDrawnByHorizon, pairTimesDrawnByHorizon };
}

// ── History overrides ─────────────────────────────────────────────────────────

function buildOverrides(historyRows: any[], date: string) {
  const targetMs = new Date(date + 'T00:00:00').getTime();
  const dsOverride = new Map<string, number>();
  const hitDatesMap = new Map<string, number[]>();

  for (const row of historyRows) {
    if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) continue;
    const cs = toComboSet(row.result_digits);
    if (!dsOverride.has(cs)) {
      const rowMs = row.date_et ? new Date(String(row.date_et)).getTime() : 0;
      const actualDs = rowMs > 0 ? Math.max(0, Math.round((targetMs - rowMs) / 86400000)) : 999;
      dsOverride.set(cs, actualDs);
    }
    if (row.date_et) {
      const dayOffset = Math.floor(new Date(String(row.date_et)).getTime() / 86400000);
      const dates = hitDatesMap.get(cs) ?? [];
      dates.push(dayOffset);
      hitDatesMap.set(cs, dates);
    }
  }

  return { dsOverride, hitDatesMap };
}

// ── Scoring pipeline ──────────────────────────────────────────────────────────
// Pair / box helpers now live in lib/engineCore — see getPairSignalFromMap and
// blendBoxDsRaw. This file used to carry a near-duplicate getPairSignal that
// could drift from the production engines.

// ── K6 selection ──────────────────────────────────────────────────────────────

function runK6Selection(
  universe: string[],
  finalScores: Float64Array,
  timesDrawnMap: Map<string, number>,
  drawsSinceMap: Map<string, number>,
  todayHitComboSets: Set<string>,
  config: EngineConfig,
  weights: { BOX: number; PBURST: number; CO: number; DGC: number },
  scorePoolForEnergy: number[],
  scope: Scope,
  pairData: PairDataTree,
  horizonWeights: Record<string, number>,
): ReplayPick[] {
  const { rails } = config;
  // Per-scope energy floor override wins when present; global is the fallback.
  // Mirrors production's `min_energy_threshold_${scope}` app_config key
  // (ENH-MET, 2026-05-18). Distinct from minEnergyThresholdByMultiplicity
  // which is per-multiplicity (and which still applies on top of this).
  const minEnergyThreshold = config.minEnergyThresholdByScope?.[scope] ?? config.minEnergyThreshold;
  // Per-scope cooldown override wins when present; global is the fallback.
  // Mirrors production's `recent_hit_cooldown_${scope}` app_config key.
  const recentHitCooldown = config.recentHitCooldownByScope?.[scope] ?? config.recentHitCooldown;

  const realIdx: number[] = [];
  const placeholderIdx: number[] = [];
  for (let i = 0; i < 1000; i++) {
    const nk = toComboSet(universe[i]);
    if ((timesDrawnMap.get(nk) ?? 0) > 0) realIdx.push(i);
    else placeholderIdx.push(i);
  }
  realIdx.sort((a, b) => finalScores[b] - finalScores[a]);
  placeholderIdx.sort((a, b) => finalScores[b] - finalScores[a]);

  const k6: ReplayPick[] = [];
  const selectedComboSets = new Set<string>();
  let singles = 0, doubles = 0;
  const pairCounts: Record<string, number> = {};

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
    const mult = multiplicityOf(combo);

    if (selectedComboSets.has(normKey)) return false;
    if (todayHitComboSets.size > 0 && todayHitComboSets.has(normKey)) return false;

    if (!relaxMultCaps) {
      if (mult === 'singles' && singles >= rails.singlesMax) return false;
      if (mult === 'doubles' && doubles >= rails.doublesMax) return false;
      if (mult === 'triples' && !rails.triplesOn) return false;
    }

    const tp = topPairOf(combo);
    if (!relaxPairRepCap && (pairCounts[tp] ?? 0) >= rails.pairRepCap) return false;

    const energy = percentileRankOf(finalScores[idx], scorePoolForEnergy);
    // ENH-DBL-H2 (2026-05-18): per-multiplicity floor wins over global.
    // Per-scope mirror of the same pattern.
    const floorByMult =
      config.minEnergyThresholdByMultiplicityByScope?.[scope] ??
      config.minEnergyThresholdByMultiplicity;
    const effectiveFloor = floorByMult
      ? (mult === 'singles' ? floorByMult.singles : mult === 'doubles' ? floorByMult.doubles : floorByMult.triples)
      : minEnergyThreshold;
    if (effectiveFloor > 0 && (timesDrawnMap.get(normKey) ?? 0) > 0 && energy < effectiveFloor) {
      return false;
    }

    const recentDs = drawsSinceMap.get(normKey) ?? 999;
    // ENH-F: per-multiplicity cooldown overrides the flat value when present
    const cdMap = config.cooldownByMultiplicity;
    const effectiveCooldown = cdMap
      ? (mult === 'singles' ? cdMap.singles : mult === 'doubles' ? cdMap.doubles : cdMap.triples)
      : recentHitCooldown;
    if (!relaxCooldown && effectiveCooldown > 0 && (timesDrawnMap.get(normKey) ?? 0) > 0 && recentDs < effectiveCooldown) {
      return false;
    }

    k6.push({
      combo,
      comboSet: normKey,
      indicator: finalScores[idx],
      energy,
      multiplicity: mult,
      // BUG-155 parity: production hit-detection matches result_digits against
      // bestOrder (not the universe-enumeration combo). The weights param
      // makes this respect config.horizonWeights — when production sets
      // app_config.horizon_weights pure-H01Y, bestOrder collapses to the H01Y
      // pair-blend; otherwise the full 10-horizon decay applies.
      bestOrder: bestOrderFor(combo, pairData, horizonWeights),
    });
    if (mult === 'singles') singles++;
    else if (mult === 'doubles') doubles++;
    pairCounts[tp] = (pairCounts[tp] ?? 0) + 1;
    selectedComboSets.add(normKey);
    return true;
  };

  const allIdx = [...realIdx, ...placeholderIdx];

  for (const idx of realIdx)    { if (k6.length >= 6) break; tryAdd(idx); }
  if (k6.length < 6) for (const idx of placeholderIdx) { if (k6.length >= 6) break; tryAdd(idx); }
  if (k6.length < 6) for (const idx of allIdx) { if (k6.length >= 6) break; tryAdd(idx, true); }
  if (k6.length < 6) for (const idx of allIdx) { if (k6.length >= 6) break; tryAdd(idx, true, true); }
  if (k6.length < 6) for (const idx of allIdx) { if (k6.length >= 6) break; tryAdd(idx, true, true, true); }
  if (k6.length < 6) for (const idx of allIdx) { if (k6.length >= 6) break; tryAdd(idx, true, true, true, true); }

  return k6;
}

// ── Public entry point ────────────────────────────────────────────────────────

/**
 * ENH-AFL-2: For a given backtest date D, fetch the rolling 30-day per-signal
 * AUC from signal_auc_per_day looking at rows BEFORE D (no leakage). Returns
 * null when < 14 days of pre-D data exist — replay then falls back to base.
 */
async function fetchRollingAucAsOf(date: string, scope: Scope): Promise<SignalAuc | null> {
  const target = new Date(date + 'T00:00:00Z').getTime();
  const since = new Date(target - 30 * 86400000).toISOString().split('T')[0];
  const endExclusive = new Date(target - 86400000).toISOString().split('T')[0]; // up to D-1
  try {
    const rows = await dbGet<{ signal: string; auc: number }[]>(
      `/signal_auc_per_day?scope=eq.${encodeURIComponent(scope)}&day=gte.${since}&day=lte.${endExclusive}&select=signal,auc&limit=200`,
    );
    if (!Array.isArray(rows)) return null;
    const buckets: Record<string, number[]> = { BOX: [], PBURST: [], CO: [], DGC: [] };
    for (const r of rows) {
      if (r.signal in buckets && typeof r.auc === 'number') buckets[r.signal].push(r.auc);
    }
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

export async function computeSlateAsOf(
  date: string,
  scope: Scope,
  config: EngineConfig,
  mode: 'balanced' | 'conservative' | 'aggressive' = 'balanced',
): Promise<ReplayPick[]> {
  const scopeEnc = encodeURIComponent(scope);
  // Per-scope preset wins over global preset when present (ENH 2026-05-15).
  const baseWeights = config.presetByScope?.[scope]?.[mode] ?? config.presets[mode];

  // ENH-AFL-2: when adaptive flag is on, layer rolling-30d AUC adjustment on
  // top of base weights. Reads signal_auc_per_day rows < D (no leakage).
  let weights = baseWeights;
  if (config.adaptiveSignalWeights?.enabled) {
    const rollingAuc = await fetchRollingAucAsOf(date, scope);
    if (rollingAuc) {
      const adj = computeAdaptiveWeights(baseWeights, rollingAuc, config.adaptiveSignalWeights.alpha);
      weights = adj.weights;
    }
  }

  const excludeYesterday = config.excludeYesterdayHits !== false; // default true
  // ENH-WARMING-2026-06-06: only fetch the warming window if some scope has a
  // non-zero weight configured. Saves ~1k rows of fetch per slate when warming
  // is off (preserves baseline backtest perf).
  const warmingWeightForThisScope = config.warmingWeightByScope?.[scope] ?? config.warmingWeight ?? 0;
  const warmingActive = warmingWeightForThisScope > 0;
  const warmingWindowDays = config.warmingWindowDays ?? 7;
  const [boxRows, pairRows, historyRows, todayHitComboSets, warmingHistory] = await Promise.all([
    fetchBoxRows(scopeEnc),
    fetchPairRows(scopeEnc),
    fetchHistoryRows(date, scope),
    excludeYesterday ? fetchYesterdayResults(date) : Promise.resolve(new Set<string>()),
    warmingActive ? fetchWarmingHistory(date, warmingWindowDays, scope, config.warmingScopeMatched === true) : Promise.resolve([] as { comboset_sorted: string; date_et: string }[]),
  ]);

  const { timesDrawnMap, dsRawMap, drawsSinceMap, pairMetaMap, boxByHorizon, pairData, boxTimesDrawnByHorizon, pairTimesDrawnByHorizon } = buildDatasets(boxRows, pairRows);
  // ENH-HW: horizon weights for BOX dsRaw blend. Config overrides default
  // HORIZON_WEIGHTS const when present. Decimals summing to ~1.0.
  const horizonWeights: Record<string, number> = config.horizonWeights ?? HORIZON_WEIGHTS;

  // ENH-BP: per-scope BOX freq/pressure weight override wins over global wins
  // over function default (0.60 / 0.40). Mirrors recentHitCooldownByScope.
  const effFreqWeight     = config.boxFreqWeightByScope?.[scope]     ?? config.boxFreqWeight;
  const effPressureWeight = config.boxPressureWeightByScope?.[scope] ?? config.boxPressureWeight;

  const { dsOverride, hitDatesMap } = buildOverrides(historyRows, date);

  // Merge: history wins when it shows a more recent hit
  for (const [cs, actualDs] of dsOverride) {
    const stale = drawsSinceMap.get(cs);
    if (stale == null || actualDs < stale) drawsSinceMap.set(cs, actualDs);
    // dsRawMap intentionally NOT updated — matches production engine behavior
  }

  // DGC map from hit dates
  const dgcMap = new Map<string, number>();
  for (const [cs, dates] of hitDatesMap) {
    dgcMap.set(cs, computeDGC(dates));
  }

  const universe = buildUniverse();

  // ENH-TDB (2026-05-27): blend path uses horizon-weighted times_drawn for BOX
  // and pair scoring. Legacy path: BOX = MAX across horizons (effectively H02Y),
  // pair = H01Y row. When the flag is set, both honor horizonWeights uniformly.
  const tdBlend = config.timesDrawnHorizonBlend === true;

  // For the blend path we pre-build a synthetic pairMetaMap keyed by the blended
  // times_drawn (drawsSince stays H01Y per legacy — ds_raw is invariant across
  // horizons by construction, so blending it would be a no-op anyway). The
  // legacy pairMetaMap is left untouched for the K6 cooldown reads downstream.
  let pairMetaForSignals = pairMetaMap;
  if (tdBlend) {
    pairMetaForSignals = new Map();
    for (const [pairKey, classMap] of pairTimesDrawnByHorizon.entries()) {
      const newClassMap = new Map<number, PairMeta>();
      for (const classId of classMap.keys()) {
        const blendedTd = blendPairTimesDrawn(pairKey, classId, pairTimesDrawnByHorizon, horizonWeights);
        const legacyMeta = pairMetaMap.get(pairKey)?.get(classId);
        newClassMap.set(classId, {
          dsRaw: legacyMeta?.dsRaw ?? 0,
          drawsSince: legacyMeta?.drawsSince ?? 500,
          timesDrawn: blendedTd,
        });
      }
      pairMetaForSignals.set(pairKey, newClassMap);
    }
  }

  // Pre-pass: maxTimesDrawn, maxPairTimesDrawn (consistent with the BOX / pair
  // values used in per-combo scoring — both legacy and blend paths take their
  // max over the same set of values they read at scoring time).
  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const nk = toComboSet(universe[i]);
    const td = tdBlend
      ? blendBoxTimesDrawn(nk, boxTimesDrawnByHorizon, horizonWeights)
      : (timesDrawnMap.get(nk) ?? 0);
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  let maxPairTimesDrawn = 0;
  for (const classMap of pairMetaForSignals.values()) {
    for (const meta of classMap.values()) {
      if (meta.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = meta.timesDrawn;
    }
  }

  // Raw signals for all 1000 combos
  const rawBox    = new Float64Array(1000);
  const rawPburst = new Float64Array(1000);
  const rawCo     = new Float64Array(1000);
  const rawDgc    = new Float64Array(1000);

  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const normKey = toComboSet(combo);
    const [a, b, c] = combo;

    const timesDrawnVal = tdBlend
      ? blendBoxTimesDrawn(normKey, boxTimesDrawnByHorizon, horizonWeights)
      : (timesDrawnMap.get(normKey) ?? 0);
    if (timesDrawnVal > 0) {
      const dsVal = blendBoxDsRaw(normKey, boxByHorizon, horizonWeights);
      rawBox[i] = computeBoxSignal(
        timesDrawnVal, dsVal, maxTimesDrawn, config.pressureThreshold,
        effFreqWeight, effPressureWeight,
      );
    }

    const ab = sortedPair(a, b);
    const bc = sortedPair(b, c);
    const ac = sortedPair(a, c);

    rawPburst[i] = (
      getPairSignalFromMap(pairMetaForSignals, ab, 2, maxPairTimesDrawn) +
      getPairSignalFromMap(pairMetaForSignals, bc, 3, maxPairTimesDrawn) +
      getPairSignalFromMap(pairMetaForSignals, ac, 4, maxPairTimesDrawn)
    ) / 3;

    let coSum = 0;
    for (const classId of [5, 6, 7, 8, 9, 10, 11]) {
      for (const pk of [ab, bc, ac]) {
        coSum += getPairSignalFromMap(pairMetaForSignals, pk, classId, maxPairTimesDrawn);
      }
    }
    rawCo[i] = coSum / 21;

    rawDgc[i] = dgcMap.get(normKey) ?? 0;
  }

  // Normalize — BOX uses nonZeroOnly=true (placeholders stay 0)
  const realBoxMasked = Array.from(rawBox).map((v, i) =>
    (timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? v : 0,
  );
  const normBoxRaw = maxNorm(realBoxMasked, true);
  const normBox    = normBoxRaw.map((v, i) =>
    (timesDrawnMap.get(toComboSet(universe[i])) ?? 0) === 0 ? 0 : v,
  );
  const normPburst = maxNorm(Array.from(rawPburst), true);
  const normCo     = maxNorm(Array.from(rawCo), true);
  const normDgc    = maxNorm(Array.from(rawDgc), true);

  // ENH-DBL-H1 (2026-05-18): resolve per-multiplicity priors with per-scope
  // override → global override → engineCore default. Mirrors recentHitCooldown
  // / boxFreqWeight resolution pattern.
  const effectivePriors =
    config.multiplicityPriorsByScope?.[scope] ??
    config.multiplicityPriors ??
    MULTIPLICITY_PRIORS;

  // ENG-AUDIT-01 (2026-06-06): replaces the inline body with the shared
  // computeWeightedScore helper. synergyThreshold / synergyMinCount carry
  // through to the helper; defaults (0.65 / 2) match production.
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const multAdj = effectivePriors[multiplicityOf(combo)];
    finalScores[i] = computeWeightedScore(
      normBox[i], normPburst[i], normCo[i], normDgc[i],
      weights, multAdj,
      config.synergyOn, config.synergyWeight,
      config.synergyThreshold ?? 0.65, config.synergyMinCount ?? 2,
    );
  }

  // ENH-WARMING-2026-06-06: post-score additive boost. Build warming map once,
  // score each combo by its prior-N-day national count, max-norm, add
  // warmingWeight × normWarming to finalScores. When weight is 0 the block
  // is skipped entirely (preserves baseline parity).
  let rawWarming: Float64Array | null = null;
  let normWarming: number[] | null = null;
  if (warmingActive) {
    const warmingMap = buildWarmingMap(warmingHistory);
    rawWarming = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) {
      const normKey = toComboSet(universe[i]);
      rawWarming[i] = warmingMap.get(normKey) ?? 0;
    }
    normWarming = maxNorm(Array.from(rawWarming), true);
    for (let i = 0; i < 1000; i++) {
      finalScores[i] += warmingWeightForThisScope * normWarming[i];
    }
  }

  // ENH-POP-PENALTY-2026-06-06: subtract a multiplicative popularity penalty
  // for the doubly-popular (high TD × high CO) interaction. Derived from
  // existing data — `popPenalty[i] = (timesDrawn[i] / maxTimesDrawn) * normCo[i]`,
  // max-normed across the universe. Subtracted as `weight × normPopPenalty`.
  // Designed for midday where the trap is concentrated; allday CO=0 already
  // addressed differently; evening has slack absorbed by WARMING.
  const popPenaltyWeight = config.popularityPenaltyWeightByScope?.[scope] ?? config.popularityPenaltyWeight ?? 0;
  if (popPenaltyWeight > 0) {
    const rawPopPenalty = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) {
      const normKey = toComboSet(universe[i]);
      const td = tdBlend
        ? blendBoxTimesDrawn(normKey, boxTimesDrawnByHorizon, horizonWeights)
        : (timesDrawnMap.get(normKey) ?? 0);
      const normTd = maxTimesDrawn > 0 ? td / maxTimesDrawn : 0;
      rawPopPenalty[i] = normTd * normCo[i];
    }
    const normPopPenalty = maxNorm(Array.from(rawPopPenalty), true);
    for (let i = 0; i < 1000; i++) {
      finalScores[i] -= popPenaltyWeight * normPopPenalty[i];
    }
  }

  // ENH-DBL-H3 (2026-05-18): top-N doubles selective bonus. Applied AFTER
  // the weighted-signal score is computed but BEFORE energy percentile is
  // taken — so bonused doubles also rise in energy (helping them clear the
  // floor) AND in the rank-sort order (helping them enter K6 at top ranks).
  // Per-scope override > global > unset (no-op).
  const h3 =
    config.doublesTopNBoostByScope?.[scope] ??
    config.doublesTopNBoost;
  if (h3 && h3.topN > 0 && h3.bonus !== 0) {
    // Collect (index, score) for all doubles, sort desc by score, bonus the top N.
    const doublesByScore: { idx: number; score: number }[] = [];
    for (let i = 0; i < 1000; i++) {
      if (multiplicityOf(universe[i]) === 'doubles') {
        doublesByScore.push({ idx: i, score: finalScores[i] });
      }
    }
    doublesByScore.sort((a, b) => b.score - a.score);
    const cutoff = Math.min(h3.topN, doublesByScore.length);
    for (let j = 0; j < cutoff; j++) {
      finalScores[doublesByScore[j].idx] += h3.bonus;
    }
  }

  const scorePoolForEnergy = Array.from(finalScores).sort((a, b) => a - b);

  // ENH-BOA: BASELINE simulation flag — bestOrderFor falls back to HORIZON_WEIGHTS
  // even when config.horizonWeights is set. CANDIDATE (default) threads
  // config.horizonWeights through, matching the post-realignment production engine.
  const bestOrderWeights = config.bestOrderUseDefaultHorizonWeights
    ? HORIZON_WEIGHTS
    : horizonWeights;

  return runK6Selection(
    universe, finalScores, timesDrawnMap, drawsSinceMap,
    todayHitComboSets, config, weights, scorePoolForEnergy,
    scope, pairData, bestOrderWeights,
  );
}
