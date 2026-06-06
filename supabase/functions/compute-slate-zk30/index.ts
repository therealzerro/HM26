/**
 * compute-slate-zk30 — Supabase Edge Function
 *
 * Server-side ZK30 slate computation for Texas Pick 3 (ARCH-06 step 5).
 * Service-role auth for all writes; bypasses RLS on daily_intelligence_zk30
 * and engine_runs that anon callers can't INSERT to.
 *
 * v1.0 lock-ins (hardcoded — NO body params):
 *   jurisdiction = 'TX', scope = 'allday', mode = 'balanced'
 *
 * ─── DRIFT CONTROL ─────────────────────────────────────────────────────────
 * The constants block below is a HAND-INLINED COPY of values that also live in
 * `constants/zk30.ts` and `engines/zk30.ts`. ZK6's edge function does the same
 * (PROCESS-01 in MASTER_AUDIT). If you change ANY of these:
 *   ZK30_ENGINE_VERSION, ZK30_JURISDICTION, ZK30_SCOPE, ZK30_HORIZONS,
 *   HORIZON_WEIGHTS_ZK30, ZK30_WEIGHTS, K30_QUOTAS, PAIR_REPETITION_CAP_ZK30
 * you MUST update all three files in lockstep AND re-deploy the edge function:
 *   1. constants/zk30.ts          (source of truth for RN-side imports)
 *   2. engines/zk30.ts            (RN engine — also reads constants/zk30.ts)
 *   3. THIS FILE                  (Deno edge — inlines the values)
 * A structural-parity audit step is logged in MASTER_AUDIT (PROCESS-01) to
 * catch divergence on the next migration.
 * ───────────────────────────────────────────────────────────────────────────
 */

import {
  MULTIPLICITY_PRIORS,
  toComboSet, sortedPair, multiplicityOf, topPairOf, buildUniverse,
  normalizeBoxKey, normalizePairKey,
  percentileRankOf, maxNorm,
  computeSlateHash, computeConfidenceScore,
  computeBoxSignalDetailed, blendBoxDsRaw, getPairSignalFromMap,
  bestOrderFor, type PairDataTree,
  type WeightSet,
} from '../../_shared/engineCore.ts';
import { getTodayET, getYesterdayET } from '../../_shared/dateUtils.ts';

// ─── Inlined ZK30 constants (see DRIFT CONTROL above) ────────────────────────

const ZK30_ENGINE_VERSION = 'v1.0';
const ZK30_JURISDICTION   = 'TX';
const ZK30_SCOPE          = 'allday';

const ZK30_HORIZONS: readonly string[] = ['H01Y', 'H02Y'] as const;
const HORIZON_WEIGHTS_ZK30: Record<string, number> = { H01Y: 0.70, H02Y: 0.30 };

// 4-channel balanced preset matching engines/zk6.ts production split.
const ZK30_WEIGHTS = {
  balanced: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 } as WeightSet,
};

const K30_QUOTAS = { singlesMax: 18, doublesMax: 9, triplesMax: 3 };
const PAIR_REPETITION_CAP_ZK30 = 10;

// ─── Supabase fetch helpers (service-role) ───────────────────────────────────

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SVC_KEY      = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const svcHeaders = () => ({
  'apikey':        SVC_KEY,
  'Authorization': 'Bearer ' + SVC_KEY,
  'Content-Type':  'application/json',
});

async function sbGet<T>(path: string): Promise<T> {
  const r = await fetch(SUPABASE_URL + path, { headers: svcHeaders() });
  if (!r.ok) throw new Error(r.status + ': ' + await r.text());
  return r.json();
}

async function sbPost(
  path: string, body: unknown,
  prefer = 'return=representation',
): Promise<unknown> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'POST',
    headers: { ...svcHeaders(), 'Prefer': prefer },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status + ': ' + await r.text());
  if (r.status === 204) return undefined;
  return r.json();
}

async function sbPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'PATCH',
    headers: { ...svcHeaders(), 'Prefer': 'return=minimal' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(r.status + ': ' + await r.text());
}

async function sbDelete(path: string): Promise<void> {
  const r = await fetch(SUPABASE_URL + path, {
    method: 'DELETE',
    headers: svcHeaders(),
  });
  if (!r.ok) throw new Error(r.status + ': ' + await r.text());
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BoxByHorizon = Map<string, Map<string, number>>;
type PairMeta = { dsRaw: number; drawsSince: number; timesDrawn: number };

interface RailConfig {
  singlesMax: number; doublesMax: number; triplesMax: number; pairRepCap: number;
}
interface EngineConfig {
  weights: WeightSet;
  rails: RailConfig;
  pressureThreshold: number;
  minEnergyThreshold: number;
  recentHitCooldown: number;
  synergyOn: boolean;
  synergyWeight: number;
  boxFreqWeight: number;
  boxPressureWeight: number;
  /** DGC reference stdev (days). ZK6's engineCore uses 10 — too tight for
   *  TX single-state pace where median combo stdev ≈ 46d. Tunable via
   *  app_config row `zk30_dgc_ref_std_dev`. */
  dgcRefStdDev: number;
  /** Minimum gap count before computing variance. Below this, computeDGCZK30
   *  returns a 0.15 baseline. Guards against 2-hit triples dominating maxNorm. */
  dgcMinGaps: number;
}
interface Datasets {
  boxByHorizon: BoxByHorizon;
  pairMetaMap:  Map<string, Map<number, PairMeta>>;
  pairData:     PairDataTree;
  drawsSinceMap: Map<string, number>;
  dsRawMap:      Map<string, number>;
  timesDrawnMap: Map<string, number>;
  lastSeenMap:   Map<string, string>;
  horizonsPresent: Record<string, boolean>;
  horizonsLoaded:  string[];
  boxRowCount:  number;
  pairRowCount: number;
}

const DEFAULT_CFG: EngineConfig = {
  weights: ZK30_WEIGHTS.balanced,
  rails: { ...K30_QUOTAS, pairRepCap: PAIR_REPETITION_CAP_ZK30 },
  pressureThreshold:  250,
  minEnergyThreshold: 70,
  recentHitCooldown:  20,
  synergyOn:     false,
  synergyWeight: 0.15,
  boxFreqWeight: 0.60,
  boxPressureWeight: 0.40,
  dgcRefStdDev: 50,
  dgcMinGaps:   3,
};

// ─── ZK30-local DGC (replaces engineCore.computeDGC) ─────────────────────────
//
// engineCore.computeDGC hard-codes DGC_REF_STD_DEV=10 which was calibrated for
// ZK6's national-pace data. TX single-state pace has median combo stdev ≈ 46d,
// so 98% of TX combos returned DGC=0 under the original formula. This local
// implementation:
//   1. Accepts ref + min-gaps from app_config (tunable without redeploy)
//   2. Returns 0.15 baseline when below min-gaps (avoids the 2-hit triple
//      freak case where variance=0 → DGC=1.0 → maxNorm domination)
function computeDGCZK30(
  dayOffsets: number[],
  refStdDev: number,
  minGaps: number,
): number {
  if (dayOffsets.length === 0) return 0;
  if (dayOffsets.length < minGaps + 1) return 0.15;
  const sorted = dayOffsets.slice().sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < sorted.length; i++) gaps.push(sorted[i] - sorted[i - 1]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  return Math.max(0, 1 - Math.sqrt(variance) / refStdDev);
}

// ─── Config loader (zk30_* keys only — no per-scope overrides for v1.0) ─────

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
    const rows = await sbGet<{ key: string; value: string }[]>(
      '/rest/v1/app_config?key=in.(' + keys.join(',') + ')&select=key,value',
    );
    const cfg: EngineConfig = JSON.parse(JSON.stringify(DEFAULT_CFG));
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
      } catch { /* keep default */ }
    }
    return cfg;
  } catch {
    return DEFAULT_CFG;
  }
}

// ─── Hash (jurisdiction-augmented) ───────────────────────────────────────────

function computeSlateHashZK30(
  jurisdiction: string, scope: string, weightsKey: string,
  topCombos: string[], horizonsPresent: Record<string, unknown>,
): string {
  return computeSlateHash(`${jurisdiction}:${scope}`, weightsKey, topCombos, horizonsPresent);
}

// ─── Data fetch ──────────────────────────────────────────────────────────────

async function fetchRaw(): Promise<{ boxRows: unknown[]; pairRows: unknown[] }> {
  const boxFetches = ZK30_HORIZONS.map(h =>
    sbGet<unknown[]>(
      `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${ZK30_SCOPE}` +
      `&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=eq.${ZK30_JURISDICTION}` +
      `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
    ).then(r => Array.isArray(r) ? r : []),
  );
  // BUG-153 pattern: paginate the pair fetch (685 × 2 horizons = 1,370 rows).
  const fetchPairRowsPaginated = async (): Promise<unknown[]> => {
    const all: unknown[] = [];
    const pageSize = 1000;
    const horizonClause = `horizon_label=in.(${ZK30_HORIZONS.join(',')})`;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await sbGet<unknown[]>(
        `/rest/v1/datasets_pair?scope=eq.${ZK30_SCOPE}&deleted_at=is.null` +
        `&jurisdiction=eq.${ZK30_JURISDICTION}&${horizonClause}` +
        `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label` +
        `&limit=${pageSize}&offset=${offset}`,
      );
      const arr = Array.isArray(page) ? page : [];
      all.push(...arr);
      if (arr.length < pageSize) break;
    }
    return all;
  };
  const [boxArrays, pairRows] = await Promise.all([
    Promise.all(boxFetches),
    fetchPairRowsPaginated(),
  ]);
  return { boxRows: boxArrays.flat(), pairRows };
}

async function fetchDatasets(): Promise<Datasets> {
  const { boxRows, pairRows } = await fetchRaw();

  const boxByHorizon: BoxByHorizon = new Map();
  const dsRawMap      = new Map<string, number>();
  const timesDrawnMap = new Map<string, number>();
  const drawsSinceMap = new Map<string, number>();
  const lastSeenMap   = new Map<string, string>();

  // H01Y-preferred dsRaw / drawsSince; max-wins timesDrawn (parity with ZK6).
  for (const row of boxRows as any[]) {
    if (!row || typeof row.key !== 'string') continue;
    const h       = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const ds      = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const td      = typeof row.times_drawn === 'number' ? row.times_drawn : 0;
    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, ds);
    if (td > (timesDrawnMap.get(normKey) ?? 0)) timesDrawnMap.set(normKey, td);
    if (h === 'H01Y' || !drawsSinceMap.has(normKey)) {
      const existing = dsRawMap.get(normKey) ?? 0;
      if (existing === 0 || ds > 0) {
        dsRawMap.set(normKey, ds);
        drawsSinceMap.set(normKey, ds);
      }
    }
    const ls = typeof row.last_seen === 'string' ? row.last_seen : null;
    if (ls && (!lastSeenMap.has(normKey) || ls > lastSeenMap.get(normKey)!)) {
      lastSeenMap.set(normKey, ls);
    }
  }

  // pairMetaMap H01Y-preferred (PBURST/CO are single-horizon by ZK6 convention).
  // pairData (per-horizon) preserved for bestOrderFor's position-pair maximisation.
  const pairMetaMap = new Map<string, Map<number, PairMeta>>();
  const pairData: PairDataTree = new Map();
  for (const row of pairRows as any[]) {
    if (!row || typeof row.key_pair !== 'string') continue;
    const h = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizePairKey(row.key_pair);
    const classId = typeof row.class_id === 'number' ? row.class_id : parseInt(String(row.class_id ?? '0'), 10);
    const td = typeof row.times_drawn === 'number' ? row.times_drawn : 0;
    const ds = typeof row.ds_raw      === 'number' ? row.ds_raw      : 0;
    if (!pairMetaMap.has(normKey)) pairMetaMap.set(normKey, new Map());
    const cm = pairMetaMap.get(normKey)!;
    if (h === 'H01Y' || !cm.has(classId)) {
      cm.set(classId, { dsRaw: ds, drawsSince: ds || 500, timesDrawn: td });
    }
    if (!pairData.has(normKey)) pairData.set(normKey, new Map());
    const cd = pairData.get(normKey)!;
    if (!cd.has(classId)) cd.set(classId, new Map());
    cd.get(classId)!.set(h, ds);
  }

  const horizonsPresent: Record<string, boolean> = {};
  const horizonsLoaded: string[] = [];
  for (const h of ZK30_HORIZONS) {
    const has = (boxByHorizon.get(h)?.size ?? 0) > 0;
    horizonsPresent[h] = has;
    if (has) horizonsLoaded.push(h);
  }

  return {
    boxByHorizon, pairMetaMap, pairData,
    drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap,
    horizonsPresent, horizonsLoaded,
    boxRowCount: boxRows.length, pairRowCount: pairRows.length,
  };
}

async function fetchHistoryOverrides() {
  try {
    const rows: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await sbGet<any[]>(
        `/rest/v1/histories_tx?select=result_digits,date_et&order=date_et.desc&limit=${pageSize}&offset=${offset}`,
      );
      const arr = Array.isArray(page) ? page : [];
      rows.push(...arr);
      if (arr.length < pageSize) break;
    }
    if (rows.length === 0) {
      return {
        dsOverride: new Map<string, number>(),
        lsOverride: new Map<string, string>(),
        hitDatesMap: new Map<string, number[]>(),
      };
    }
    const dsOverride  = new Map<string, number>();
    const lsOverride  = new Map<string, string>();
    const hitDatesMap = new Map<string, number[]>();
    const todayMs = new Date(getTodayET() + 'T00:00:00').getTime();
    for (const row of rows) {
      if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) continue;
      const cs = toComboSet(row.result_digits);
      if (!dsOverride.has(cs)) {
        const rowMs = row.date_et ? new Date(String(row.date_et)).getTime() : 0;
        const actualDs = rowMs > 0 ? Math.max(0, Math.round((todayMs - rowMs) / 86400000)) : 999;
        dsOverride.set(cs, actualDs);
        lsOverride.set(cs, String(row.date_et));
      }
      if (row.date_et) {
        const d = Math.floor(new Date(String(row.date_et)).getTime() / 86400000);
        const arr = hitDatesMap.get(cs) ?? [];
        arr.push(d);
        hitDatesMap.set(cs, arr);
      }
    }
    return { dsOverride, lsOverride, hitDatesMap };
  } catch {
    return {
      dsOverride: new Map<string, number>(),
      lsOverride: new Map<string, string>(),
      hitDatesMap: new Map<string, number[]>(),
    };
  }
}

// ─── Core compute ─────────────────────────────────────────────────────────────

interface K30Item {
  combo: string; normKey: string; indicator: number;
  freqS: number; pressureS: number;
  boxS: number; pburstS: number; coS: number; dgcS: number;
  energy: number; multiplicity: 'singles' | 'doubles' | 'triples'; topPair: string;
}

async function computeSlate(params: {
  weightsKey?: string; targetDate?: string;
  excludeComboSets?: string[]; is_supplement?: boolean;
}): Promise<Record<string, unknown>> {
  const {
    weightsKey = 'balanced',
    targetDate,
    excludeComboSets = [],
    is_supplement = false,
  } = params;
  const scope = ZK30_SCOPE;
  const now = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;
  const universe = buildUniverse();

  const cfg = await loadEngineConfig();
  const weights = ZK30_WEIGHTS.balanced;  // v1.0: only balanced
  const rails = cfg.rails;

  console.log('[edge-zk30] computeSlate', { date: effectiveDate, mode: weightsKey });
  console.log('[edge-zk30] BOX split: freq=' + cfg.boxFreqWeight + ' pressure=' + cfg.boxPressureWeight);

  // 1. Fetch datasets + history overrides
  const [ds, { dsOverride, lsOverride, hitDatesMap }] = await Promise.all([
    fetchDatasets(),
    fetchHistoryOverrides(),
  ]);
  for (const [cs, d] of dsOverride) { const s = ds.drawsSinceMap.get(cs); if (s == null || d < s) ds.drawsSinceMap.set(cs, d); }
  for (const [cs, l] of lsOverride) { const s = ds.lastSeenMap.get(cs); if (!s || l > s) ds.lastSeenMap.set(cs, l); }

  if (ds.horizonsLoaded.length === 0) {
    throw new Error('No BOX data available for ZK30/TX (datasets_box empty)');
  }

  const dgcMap = new Map<string, number>();
  // Use the ZK30-local DGC (engineCore.computeDGC mis-calibrated for TX —
  // see computeDGCZK30 docblock for the two bugs this addresses).
  for (const [cs, dates] of hitDatesMap) {
    dgcMap.set(cs, computeDGCZK30(dates, cfg.dgcRefStdDev, cfg.dgcMinGaps));
  }

  // 2. Today + yesterday hit comboSets — HARD block.
  const todayHitComboSets = new Set<string>();
  const effectiveExcluded = new Set<string>();
  const yesterdayEt = getYesterdayET();

  try {
    const tw = await sbGet<any[]>(
      `/rest/v1/histories_tx?date_et=gte.${yesterdayEt}&date_et=lte.${todayEt}&select=result_digits&limit=1000`,
    );
    if (Array.isArray(tw)) for (const w of tw) {
      if (typeof w?.result_digits === 'string' && /^\d{3}$/.test(w.result_digits)) {
        todayHitComboSets.add(toComboSet(w.result_digits));
        effectiveExcluded.add(w.result_digits);
      }
    }
  } catch { /* non-fatal */ }

  try {
    const di = await sbGet<any[]>(
      `/rest/v1/daily_intelligence_zk30?slate_date=gte.${yesterdayEt}` +
      `&or=(hit_box.eq.true,hit_straight.eq.true,hit_fireball_box.eq.true,hit_fireball_straight.eq.true)` +
      `&select=combo_set,matched_result&limit=500`,
    );
    if (Array.isArray(di)) for (const r of di) {
      if (typeof r?.combo_set === 'string' && r.combo_set) todayHitComboSets.add(r.combo_set);
      if (typeof r?.matched_result === 'string' && /^\d{3}$/.test(r.matched_result)) {
        todayHitComboSets.add(toComboSet(r.matched_result));
        effectiveExcluded.add(r.matched_result);
      }
    }
  } catch { /* non-fatal */ }

  // 3. Signal scoring
  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const td = ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0;
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  let maxPairTimesDrawn = 0;
  for (const cm of ds.pairMetaMap.values()) {
    for (const m of cm.values()) if (m.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = m.timesDrawn;
  }

  const getPairSignal = (pk: string, classId: number): number =>
    getPairSignalFromMap(ds.pairMetaMap, pk, classId, maxPairTimesDrawn);

  const rawBox      = new Float64Array(1000);
  const rawFreq     = new Float64Array(1000);
  const rawPressure = new Float64Array(1000);
  const rawPburst   = new Float64Array(1000);
  const rawCo       = new Float64Array(1000);
  const rawDgc      = new Float64Array(1000);

  for (let i = 0; i < 1000; i++) {
    const combo   = universe[i];
    const normKey = toComboSet(combo);
    const [a, b, c] = combo;
    const td = ds.timesDrawnMap.get(normKey) ?? 0;
    const dsVal = blendBoxDsRaw(normKey, ds.boxByHorizon, HORIZON_WEIGHTS_ZK30);
    const parts = computeBoxSignalDetailed(
      td, dsVal, maxTimesDrawn, cfg.pressureThreshold,
      cfg.boxFreqWeight, cfg.boxPressureWeight,
    );
    rawFreq[i]     = parts.freq;
    rawPressure[i] = parts.pressure;
    rawBox[i]      = parts.box;
    const ab = sortedPair(a, b), bc = sortedPair(b, c), ac = sortedPair(a, c);
    rawPburst[i] = (getPairSignal(ab, 2) + getPairSignal(bc, 3) + getPairSignal(ac, 4)) / 3;
    let coSum = 0;
    for (const cid of [5, 6, 7, 8, 9, 10, 11]) {
      coSum += getPairSignal(ab, cid) + getPairSignal(bc, cid) + getPairSignal(ac, cid);
    }
    rawCo[i]  = coSum / 21;
    rawDgc[i] = dgcMap.get(normKey) ?? 0;
  }

  // 4. Normalize
  const rawBoxArr     = Array.from(rawBox);
  const realBoxMasked = rawBoxArr.map((v, i) => (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? v : 0);
  const normBoxRaw    = maxNorm(realBoxMasked, true);
  const normBox       = normBoxRaw.map((v, i) => (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) === 0 ? 0 : v);
  const normPburst    = maxNorm(Array.from(rawPburst), true);
  const normCo        = maxNorm(Array.from(rawCo),     true);
  const normDgc       = maxNorm(Array.from(rawDgc),    true);

  // 5. Final scores
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const multAdj = MULTIPLICITY_PRIORS[multiplicityOf(universe[i])];
    finalScores[i] =
      weights.BOX    * normBox[i] +
      weights.PBURST * normPburst[i] +
      weights.CO     * normCo[i] +
      weights.DGC    * normDgc[i] +
      multAdj;
    if (cfg.synergyOn && [normBox[i], normPburst[i], normCo[i], normDgc[i]].filter(v => v >= 0.65).length >= 2) {
      finalScores[i] *= (1 + cfg.synergyWeight);
    }
  }

  // 6. K30 selection (6 passes — same relaxation order as ZK6)
  const realIdx: number[] = [], placeholderIdx: number[] = [];
  for (let i = 0; i < 1000; i++) {
    ((ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? realIdx : placeholderIdx).push(i);
  }
  const sortFn = (a: number, b: number) =>
    finalScores[b] !== finalScores[a]
      ? finalScores[b] - finalScores[a]
      : universe[a].localeCompare(universe[b]);
  realIdx.sort(sortFn);
  placeholderIdx.sort(sortFn);
  const scorePool = Array.from(finalScores).sort((a, b) => a - b);

  const k30: K30Item[] = [];
  let singles = 0, doubles = 0, triples = 0;
  const pairCounts: Record<string, number> = {};
  const selectedCS = new Set<string>();
  const excCSSet = new Set(excludeComboSets);

  const tryAdd = (idx: number, rx = false, rp = false, rc = false, rm = false): boolean => {
    if (k30.length >= 30) return false;
    const combo = universe[idx], nk = toComboSet(combo);
    if (selectedCS.has(nk)) return false;
    if (todayHitComboSets.size > 0 && todayHitComboSets.has(nk)) return false;
    if (!rx && effectiveExcluded.has(combo)) return false;
    if (!rx && excCSSet.size > 0 && excCSSet.has(nk)) return false;
    const mult = multiplicityOf(combo);
    if (!rm) {
      if (mult === 'singles' && singles >= rails.singlesMax) return false;
      if (mult === 'doubles' && doubles >= rails.doublesMax) return false;
      if (mult === 'triples' && triples >= rails.triplesMax) return false;
    }
    const tp = topPairOf(combo);
    if (!rp && (pairCounts[tp] ?? 0) >= rails.pairRepCap) return false;
    const energy = percentileRankOf(finalScores[idx], scorePool);
    if (cfg.minEnergyThreshold > 0 && (ds.timesDrawnMap.get(nk) ?? 0) > 0 && energy < cfg.minEnergyThreshold) return false;
    const recentDs = ds.drawsSinceMap.get(nk) ?? 999;
    if (!rc && cfg.recentHitCooldown > 0 && dsOverride.has(nk) && (ds.timesDrawnMap.get(nk) ?? 0) > 0 && recentDs < cfg.recentHitCooldown) return false;
    k30.push({
      combo, normKey: nk, indicator: finalScores[idx],
      freqS: rawFreq[idx], pressureS: rawPressure[idx],
      boxS: normBox[idx], pburstS: normPburst[idx], coS: normCo[idx], dgcS: normDgc[idx],
      energy, multiplicity: mult, topPair: tp,
    });
    if (mult === 'singles') singles++;
    else if (mult === 'doubles') doubles++;
    else triples++;
    pairCounts[tp] = (pairCounts[tp] ?? 0) + 1;
    selectedCS.add(nk);
    return true;
  };

  const all = [...realIdx, ...placeholderIdx];
  for (const i of realIdx)      { if (k30.length >= 30) break; tryAdd(i); }
  if (k30.length < 30) for (const i of placeholderIdx) { if (k30.length >= 30) break; tryAdd(i); }
  if (k30.length < 30) for (const i of all) { if (k30.length >= 30) break; tryAdd(i, true); }
  if (k30.length < 30) for (const i of all) { if (k30.length >= 30) break; tryAdd(i, true, true); }
  if (k30.length < 30) for (const i of all) { if (k30.length >= 30) break; tryAdd(i, true, true, true); }
  if (k30.length < 30) for (const i of all) { if (k30.length >= 30) break; tryAdd(i, true, true, true, true); }

  k30.sort((a, b) => b.indicator - a.indicator);

  // 7. Build output
  const scopeConfidence = computeConfidenceScore(ds.horizonsLoaded.length, ds.boxRowCount);
  const hash = computeSlateHashZK30(ZK30_JURISDICTION, scope, weightsKey, k30.map(x => x.combo), ds.horizonsPresent);

  const topKStraights = k30.map((x, idx) => ({
    combo: x.combo, comboSet: x.normKey, indicator: x.indicator,
    box: x.boxS, pburst: x.pburstS, co: x.coS,
    signals: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
    multiplicity: x.multiplicity, topPair: x.topPair, energy: x.energy, temperature: x.energy,
    rank: idx + 1,
    bestOrder: bestOrderFor(x.combo, ds.pairData),
    confidence: Math.round(scopeConfidence * 100),
    drawsSince: ds.dsRawMap.get(x.normKey) ?? null,
    timesDrawn: ds.timesDrawnMap.get(x.normKey) ?? 0,
    dsRaw:      ds.dsRawMap.get(x.normKey) ?? 0,
    lastSeen:   ds.lastSeenMap.get(x.normKey) ?? null,
  }));

  const horizonsMeta = {
    ...ds.horizonsPresent,
    _engineVersion: ZK30_ENGINE_VERSION,
    _mode: weightsKey,
    _confidence: Math.round(scopeConfidence * 100),
    _dataStats: {
      boxRowsUsed: ds.boxRowCount, pairRowsUsed: ds.pairRowCount,
      horizonsLoaded: ds.horizonsLoaded, usingFallback: false,
    },
    _source: 'edge',
    ...(is_supplement ? { _is_supplement: true } : {}),
  };

  const componentsJson = k30.map(x => ({
    combo: x.combo,
    components: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
    temperature: x.energy, multiplicity: x.multiplicity, topPair: x.topPair,
    indicator: x.indicator, energy: x.energy,
  }));

  // ── slate_snapshots_zk30 — soft-delete prior + INSERT ─────────────────────
  const snapPayload: Record<string, unknown> = {
    jurisdiction: ZK30_JURISDICTION,
    scope,
    mode: weightsKey,
    engine_version: ZK30_ENGINE_VERSION,
    slate_date: effectiveDate,
    horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: weightsKey },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k30.map(x => x.normKey),
    components_json: componentsJson,
    updated_at_et: now,
    snapshot_hash: hash,
    hash,
    admin_published: true,
    ...(is_supplement ? { file_meta: JSON.stringify({ is_supplement: true, supplement_reason: 'post_hit_refresh', excluded_combo_sets: excludeComboSets }) } : {}),
  };

  if (!is_supplement) {
    try {
      await sbPatch(
        `/rest/v1/slate_snapshots_zk30?slate_date=eq.${effectiveDate}&deleted_at=is.null`,
        { deleted_at: now },
      );
    } catch { /* non-fatal */ }
  }
  const res = await sbPost('/rest/v1/slate_snapshots_zk30', snapPayload) as any[];
  const savedId = Array.isArray(res) && res.length > 0 ? String(res[0]?.id ?? '') : `zk30-${ZK30_JURISDICTION}-${Date.now()}`;

  // ── engine_runs telemetry (non-fatal) ─────────────────────────────────────
  if (!is_supplement) {
    try {
      await sbPost('/rest/v1/engine_runs', {
        slate_hash:           hash,
        scope,
        mode:                 weightsKey,
        slate_date:           effectiveDate,
        effective_weights:    { ...weights, _mode: weightsKey, _engine: 'zk30', _jurisdiction: ZK30_JURISDICTION },
        horizons_present:     ds.horizonsPresent,
        horizons_loaded:      ds.horizonsLoaded,
        confidence_score:     Math.round(scopeConfidence * 100),
        using_fallback:       false,
        box_freq_weight:      cfg.boxFreqWeight,
        box_pressure_weight:  cfg.boxPressureWeight,
        recent_hit_cooldown:  cfg.recentHitCooldown,
        min_energy_threshold: cfg.minEnergyThreshold,
        source:               'edge',
        generated_at_et:      now,
      }, 'resolution=merge-duplicates,return=minimal');
      // engine_runs has UNIQUE (slate_hash, mode); merge-duplicates upserts
      // the existing row with fresh timestamps. Parity with ZK6 telemetry.
    } catch (e) {
      console.warn('[edge-zk30] engine_runs telemetry write failed (non-fatal):', String(e));
    }
  }

  // ── daily_intelligence_zk30 — DELETE-then-INSERT (BUG-139 pattern) ───────
  if (!is_supplement) {
    try {
      const placedCombos = new Set(k30.map(x => x.combo));

      // Recover hits from adaptive_tracking_zk30 BEFORE the delete.
      const hitsByCombo = new Map<string, {
        hit_box: boolean; hit_straight: boolean;
        hit_fireball_box: boolean; hit_fireball_straight: boolean;
        matched_session: string | null; matched_result: string | null; matched_fireball: string | null;
      }>();
      try {
        const at = await sbGet<any[]>(
          `/rest/v1/adaptive_tracking_zk30?slate_date=eq.${effectiveDate}` +
          `&or=(hit_box.eq.true,hit_straight.eq.true,hit_fireball_box.eq.true,hit_fireball_straight.eq.true)` +
          `&select=combo,hit_box,hit_straight,hit_fireball_box,hit_fireball_straight,matched_session,matched_result,matched_fireball&limit=200`,
        );
        if (Array.isArray(at)) {
          for (const r of at) {
            if (!r.combo) continue;
            const existing = hitsByCombo.get(r.combo);
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
      } catch (e) { console.warn('[edge-zk30] adaptive_tracking_zk30 hits fetch warn:', String(e)); }

      const stamp = (combo: string) =>
        hitsByCombo.get(combo) ?? {
          hit_box: false, hit_straight: false,
          hit_fireball_box: false, hit_fireball_straight: false,
          matched_session: null, matched_result: null, matched_fireball: null,
        };

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

      const hitOrphanRows = [...hitsByCombo.entries()]
        .filter(([combo]) => !placedCombos.has(combo))
        .map(([combo, h], i) => ({
          slate_date: effectiveDate,
          rank: 30 + i + 1,
          combo,
          combo_set: toComboSet(combo),
          multiplicity: null,
          top_pair: null,
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
      await sbDelete(`/rest/v1/daily_intelligence_zk30?slate_date=eq.${effectiveDate}`);
      await sbPost('/rest/v1/daily_intelligence_zk30', diRows, 'return=minimal');
      console.log('[edge-zk30] daily_intelligence_zk30: wrote', diRows.length, 'rows (' + hitOrphanRows.length + ' hit-orphans appended)');
    } catch (e) {
      console.error('[edge-zk30] daily_intelligence_zk30 write FAILED:', String(e));
    }

    // ── adaptive_tracking_zk30 — 30 primary rows; idempotent by (slate_hash, slate_date) ──
    // Bug found in step 5.4: hash-only dedup conflated different dates because
    // identical TX data + algorithm → same hash across days. Must scope dedup to date.
    try {
      const existing = await sbGet<any[]>(
        `/rest/v1/adaptive_tracking_zk30?slate_hash=eq.${encodeURIComponent(hash)}&slate_date=eq.${effectiveDate}&matched_session=is.null&select=id&limit=1`,
      );
      if (Array.isArray(existing) && existing.length > 0) {
        console.log('[edge-zk30] adaptive_tracking_zk30: primary rows already exist for hash, skipping');
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
            signal_dgc: x.dgcS,        // ZK30 uses signal_dgc (not legacy signal_burst)
            energy_score: x.energy,
            box_top_quartile:    x.boxS    >= boxQ75,
            pburst_top_quartile: x.pburstS >= pburstQ75,
            co_top_quartile:     x.coS     >= coQ75,
            dgc_top_quartile:    x.dgcS    >= dgcQ75,
            dominant_signal:     dominant,
            // hit_* + matched_* left NULL until hit detection runs.
          };
        });
        await sbPost('/rest/v1/adaptive_tracking_zk30', atRows, 'return=minimal');
        console.log('[edge-zk30] adaptive_tracking_zk30: wrote', atRows.length, 'primary rows');
      }
    } catch (e) {
      console.warn('[edge-zk30] adaptive_tracking_zk30 pre-write failed:', String(e));
    }
  }

  // Return shape mirrors engines/zk30.ts SlateSnapshot output.
  return {
    id: savedId,
    scope,
    horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: weightsKey },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k30.map(x => x.normKey),
    components_json: componentsJson,
    updated_at_et: now,
    slate_date: effectiveDate,
    hash,
    mode: weightsKey,
    engineVersion: ZK30_ENGINE_VERSION,
    source: 'edge',
    confidence: Math.round(scopeConfidence * 100),
    dataStats: {
      boxRowsUsed: ds.boxRowCount,
      pairRowsUsed: ds.pairRowCount,
      horizonsLoaded: ds.horizonsLoaded,
      usingFallback: false,
    },
  };
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

const cors = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  try {
    const body = await req.json();
    const result = await computeSlate(body);
    return new Response(JSON.stringify(result), {
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[edge-zk30] error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
});
