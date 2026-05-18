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
  computeDGC,
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
  const rows = await dbGet<any[]>(
    `/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=is.null` +
    `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=50000`,
  );
  return Array.isArray(rows) ? rows : [];
}

async function fetchHistoryRows(date: string, scope: Scope): Promise<any[]> {
  const sessionClause = scope === 'allday' ? '' : `&session=eq.${scope}`;
  const rows = await dbGet<any[]>(
    `/histories?select=result_digits,date_et,session` +
    `&date_et=lt.${date}${sessionClause}&order=date_et.desc&limit=10000`,
  );
  return Array.isArray(rows) ? rows : [];
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

  for (const row of boxRows) {
    if (!row || typeof row.key !== 'string') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const rawDs = typeof row.ds_raw === 'number' ? row.ds_raw : 0;

    if (row.times_drawn != null && row.times_drawn > (timesDrawnMap.get(normKey) ?? 0)) {
      timesDrawnMap.set(normKey, row.times_drawn);
    }

    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, rawDs);

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

  for (const row of pairRows) {
    if (!row || typeof row.class_id !== 'number') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const rawPairKey = row.key_pair ?? row.key;
    const pairKey = normalizePairKey(rawPairKey);
    if (h === 'H01Y' || !pairMetaMap.get(pairKey)?.has(row.class_id)) {
      if (!pairMetaMap.has(pairKey)) pairMetaMap.set(pairKey, new Map());
      pairMetaMap.get(pairKey)!.set(row.class_id, {
        dsRaw:      typeof row.ds_raw === 'number' ? row.ds_raw : 0,
        drawsSince: typeof row.ds_raw === 'number' ? row.ds_raw : 500,
        timesDrawn: typeof row.times_drawn === 'number' ? row.times_drawn : 0,
      });
    }
  }

  return { timesDrawnMap, dsRawMap, drawsSinceMap, pairMetaMap, boxByHorizon };
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

function getPairSignal(
  pairMetaMap: Map<string, Map<number, PairMeta>>,
  pairKey: string,
  classId: number,
  maxPairTimesDrawn: number,
): number {
  const meta = pairMetaMap.get(pairKey)?.get(classId);
  if (!meta) return 0;
  const drawsSince = meta.drawsSince || 500;
  const timesDrawn = meta.timesDrawn || 0;
  const freqScore = maxPairTimesDrawn > 0 ? timesDrawn / maxPairTimesDrawn : 0;
  const pressureScore = timesDrawn > 0 && drawsSince < 500
    ? Math.min(drawsSince / 182, 1.0)
    : 0;
  return (freqScore * 0.70) + (pressureScore * 0.30);
}

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

export async function computeSlateAsOf(
  date: string,
  scope: Scope,
  config: EngineConfig,
  mode: 'balanced' | 'conservative' | 'aggressive' = 'balanced',
): Promise<ReplayPick[]> {
  const scopeEnc = encodeURIComponent(scope);
  // Per-scope preset wins over global preset when present (ENH 2026-05-15).
  const weights = config.presetByScope?.[scope]?.[mode] ?? config.presets[mode];

  const excludeYesterday = config.excludeYesterdayHits !== false; // default true
  const [boxRows, pairRows, historyRows, todayHitComboSets] = await Promise.all([
    fetchBoxRows(scopeEnc),
    fetchPairRows(scopeEnc),
    fetchHistoryRows(date, scope),
    excludeYesterday ? fetchYesterdayResults(date) : Promise.resolve(new Set<string>()),
  ]);

  const { timesDrawnMap, dsRawMap, drawsSinceMap, pairMetaMap, boxByHorizon } = buildDatasets(boxRows, pairRows);
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

  // Pre-pass: maxTimesDrawn, maxPairTimesDrawn
  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const td = timesDrawnMap.get(toComboSet(universe[i])) ?? 0;
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  let maxPairTimesDrawn = 0;
  for (const classMap of pairMetaMap.values()) {
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

    const timesDrawnVal = timesDrawnMap.get(normKey) ?? 0;
    if (timesDrawnVal > 0) {
      // ENH-HW: horizon-weighted dsRaw blend. With weights={H01Y:1.0,rest:0},
      // matches the prior H01Y-only dsRawMap lookup.
      let dsVal = 0;
      for (const h of H_ALL) {
        dsVal += (boxByHorizon.get(h)?.get(normKey) ?? 0) * (horizonWeights[h] ?? 0);
      }
      rawBox[i] = computeBoxSignal(
        timesDrawnVal, dsVal, maxTimesDrawn, config.pressureThreshold,
        effFreqWeight, effPressureWeight,
      );
    }

    const ab = sortedPair(a, b);
    const bc = sortedPair(b, c);
    const ac = sortedPair(a, c);

    rawPburst[i] = (
      getPairSignal(pairMetaMap, ab, 2, maxPairTimesDrawn) +
      getPairSignal(pairMetaMap, bc, 3, maxPairTimesDrawn) +
      getPairSignal(pairMetaMap, ac, 4, maxPairTimesDrawn)
    ) / 3;

    let coSum = 0;
    for (const classId of [5, 6, 7, 8, 9, 10, 11]) {
      for (const pk of [ab, bc, ac]) {
        coSum += getPairSignal(pairMetaMap, pk, classId, maxPairTimesDrawn);
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

  // Final scores with synergy check matching production engine (2+ signals ≥ 0.65)
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const combo = universe[i];
    const multAdj = effectivePriors[multiplicityOf(combo)];
    let score =
      weights.BOX    * normBox[i] +
      weights.PBURST * normPburst[i] +
      weights.CO     * normCo[i] +
      weights.DGC    * normDgc[i] +
      multAdj;
    if (config.synergyOn) {
      const aboveThresh = [normBox[i], normPburst[i], normCo[i], normDgc[i]].filter(v => v >= 0.65).length;
      if (aboveThresh >= 2) score *= (1 + config.synergyWeight);
    }
    finalScores[i] = score;
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

  return runK6Selection(
    universe, finalScores, timesDrawnMap, drawsSinceMap,
    todayHitComboSets, config, weights, scorePoolForEnergy,
    scope,
  );
}
