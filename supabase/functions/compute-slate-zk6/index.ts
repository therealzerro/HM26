/**
 * compute-slate-zk6 — Supabase Edge Function
 * Server-side ZK6 slate computation using service-role key for all writes.
 * Signal math imported from lib/engineCore.ts (pure TS, Deno-safe).
 */

import {
  H_ALL, HORIZON_WEIGHTS as _HW, MULTIPLICITY_PRIORS,
  toComboSet, sortedPair, multiplicityOf, topPairOf, buildUniverse,
  normalizeBoxKey, normalizePairKey,
  computeDGC, percentileRankOf, maxNorm,
  computeSlateHash, computeConfidenceScore,
  type Scope, type WeightSet,
} from '../../../lib/engineCore.ts';
import { getTodayET, getYesterdayET } from '../../../lib/dateUtils.ts';

// ─── Supabase fetch helpers ───────────────────────────────────────────────────

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

async function sbPost(path: string, body: unknown, prefer = 'resolution=merge-duplicates,return=representation'): Promise<unknown> {
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
  const r = await fetch(SUPABASE_URL + path, { method: 'DELETE', headers: svcHeaders() });
  if (!r.ok) throw new Error(r.status + ': ' + await r.text());
}

// ─── Types ────────────────────────────────────────────────────────────────────

type BoxByHorizon = Map<string, Map<string, number>>;
type PairMeta = { dsRaw: number; drawsSince: number; timesDrawn: number };
type WeightPresets = { balanced: WeightSet; conservative: WeightSet; aggressive: WeightSet };

interface RailConfig { singlesMax: number; doublesMax: number; triplesOn: boolean; pairRepCap: number; }
interface EngineConfig {
  presets: WeightPresets; rails: RailConfig;
  pressureThreshold: number; minEnergyThreshold: number;
  recentHitCooldown: number; synergyOn: boolean; synergyWeight: number;
}
interface Datasets {
  boxByHorizon: BoxByHorizon;
  pairMetaMap:  Map<string, Map<number, PairMeta>>;
  drawsSinceMap: Map<string, number>;
  dsRawMap:      Map<string, number>;
  timesDrawnMap: Map<string, number>;
  lastSeenMap:   Map<string, string>;
  horizonsPresent: Record<string, boolean>;
  horizonsLoaded:  string[];
  usingFallback:   boolean;
  boxRowCount:  number;
  pairRowCount: number;
  rawBoxRows:   unknown[];
}

// ─── Engine defaults ──────────────────────────────────────────────────────────

const ENGINE_VERSION = 'v2.1';
const DEFAULT_CFG: EngineConfig = {
  presets: {
    balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
    conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
    aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
  },
  rails:             { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
  pressureThreshold: 250,
  minEnergyThreshold: 0,
  recentHitCooldown: 20,
  synergyOn:     false,
  synergyWeight: 0.15,
};

// ─── Config loader ────────────────────────────────────────────────────────────

async function loadEngineConfig(): Promise<EngineConfig> {
  try {
    const rows = await sbGet<{ key: string; value: string }[]>(
      '/rest/v1/app_config' +
      '?key=in.(engine_weights_balanced,engine_weights_conservative,engine_weights_aggressive,' +
      'k6_singles_max,k6_doubles_max,k6_triples_on,pair_rep_cap,pressure_threshold,' +
      'min_energy_threshold,recent_hit_cooldown,synergy_boost_on,synergy_boost_weight)' +
      '&select=key,value',
    );
    if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_CFG;
    const cfg: EngineConfig = JSON.parse(JSON.stringify(DEFAULT_CFG));
    for (const row of rows) {
      try {
        if (row.key === 'k6_singles_max')       { const v = parseInt(row.value,10); if (!isNaN(v)) cfg.rails.singlesMax = v; continue; }
        if (row.key === 'k6_doubles_max')       { const v = parseInt(row.value,10); if (!isNaN(v)) cfg.rails.doublesMax = v; continue; }
        if (row.key === 'k6_triples_on')        { cfg.rails.triplesOn = row.value === 'true'; continue; }
        if (row.key === 'pair_rep_cap')         { const v = parseInt(row.value,10); if (!isNaN(v)) cfg.rails.pairRepCap = v; continue; }
        if (row.key === 'pressure_threshold')   { const v = parseInt(row.value,10); if (!isNaN(v) && v >= 50) cfg.pressureThreshold = v; continue; }
        if (row.key === 'min_energy_threshold') { const v = parseInt(row.value,10); if (!isNaN(v) && v >= 0) cfg.minEnergyThreshold = v; continue; }
        if (row.key === 'recent_hit_cooldown')  { const v = parseInt(row.value,10); if (!isNaN(v) && v >= 0) cfg.recentHitCooldown = v; continue; }
        if (row.key === 'synergy_boost_on')     { cfg.synergyOn = row.value === 'true'; continue; }
        if (row.key === 'synergy_boost_weight') { const v = parseFloat(row.value); if (!isNaN(v) && v >= 0) cfg.synergyWeight = v; continue; }
        const parsed = JSON.parse(row.value);
        const p = (v: number) => v > 1 ? v / 100 : v;
        const ws: WeightSet = {
          BOX:    p(parsed.BOX    ?? parsed.box    ?? 0),
          PBURST: p(parsed.PBURST ?? parsed.pburst ?? 0),
          CO:     p(parsed.CO     ?? parsed.co     ?? 0),
          DGC:    p(parsed.DGC    ?? parsed.dgc    ?? DEFAULT_CFG.presets.balanced.DGC),
        };
        if (ws.BOX + ws.PBURST + ws.CO > 0.05) {
          if (row.key === 'engine_weights_balanced')     cfg.presets.balanced     = ws;
          if (row.key === 'engine_weights_conservative') cfg.presets.conservative = ws;
          if (row.key === 'engine_weights_aggressive')   cfg.presets.aggressive   = ws;
        }
      } catch { /* keep default */ }
    }
    return cfg;
  } catch {
    return DEFAULT_CFG;
  }
}

// ─── Data fetch ───────────────────────────────────────────────────────────────

function normalizeScope(s: string): Scope {
  const v = String(s ?? '').toLowerCase().replace(/[-\s_]/g, '');
  if (v === 'midday') return 'midday';
  if (v === 'evening') return 'evening';
  return 'allday';
}

async function fetchRaw(scopeEnc: string): Promise<{ boxRows: unknown[]; pairRows: unknown[] }> {
  const boxFetches = H_ALL.map(h =>
    sbGet<unknown[]>(
      `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${scopeEnc}` +
      `&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=is.null` +
      `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
    ).then(r => Array.isArray(r) ? r : []),
  );
  const [boxArrays, pairRows] = await Promise.all([
    Promise.all(boxFetches),
    sbGet<unknown[]>(
      `/rest/v1/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=is.null` +
      `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=50000`,
    ),
  ]);
  return { boxRows: boxArrays.flat(), pairRows: Array.isArray(pairRows) ? pairRows : [] };
}

async function fetchDatasets(scope: Scope): Promise<Datasets> {
  const enc = encodeURIComponent(scope);
  let { boxRows, pairRows } = await fetchRaw(enc);
  let usingFallback = false;
  if (boxRows.length < 50 && scope !== 'allday') {
    const fb = await fetchRaw(encodeURIComponent('allday'));
    boxRows = fb.boxRows; pairRows = fb.pairRows; usingFallback = true;
  }

  const boxByHorizon: BoxByHorizon = new Map();
  const dsRawMap      = new Map<string, number>();
  const timesDrawnMap = new Map<string, number>();
  const drawsSinceMap = new Map<string, number>();
  const lastSeenMap   = new Map<string, string>();
  const rawBoxRows    = [...boxRows];

  for (const row of boxRows as any[]) {
    if (!row || typeof row.key !== 'string') continue;
    const h       = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const ds      = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const td      = typeof row.times_drawn === 'number' ? row.times_drawn : 0;
    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, ds);
    // MAX timesDrawn wins — multiple raw permutations map to same normKey
    if (td > (timesDrawnMap.get(normKey) ?? 0)) {
      timesDrawnMap.set(normKey, td);
      dsRawMap.set(normKey, ds);
      drawsSinceMap.set(normKey, ds);
    }
    const ls = typeof row.last_seen === 'string' ? row.last_seen : null;
    if (ls && (!lastSeenMap.has(normKey) || ls > lastSeenMap.get(normKey)!))
      lastSeenMap.set(normKey, ls);
  }

  const pairMetaMap = new Map<string, Map<number, PairMeta>>();
  for (const row of pairRows as any[]) {
    if (!row || typeof row.key_pair !== 'string') continue;
    const normKey = normalizePairKey(row.key_pair);
    const classId = typeof row.class_id === 'number' ? row.class_id : parseInt(String(row.class_id ?? '0'), 10);
    const td = typeof row.times_drawn === 'number' ? row.times_drawn : 0;
    const ds = typeof row.ds_raw      === 'number' ? row.ds_raw      : 0;
    if (!pairMetaMap.has(normKey)) pairMetaMap.set(normKey, new Map());
    const cm = pairMetaMap.get(normKey)!;
    if (!cm.has(classId) || td > cm.get(classId)!.timesDrawn)
      cm.set(classId, { dsRaw: ds, drawsSince: ds, timesDrawn: td });
  }

  const horizonsPresent: Record<string, boolean> = {};
  const horizonsLoaded: string[] = [];
  for (const h of H_ALL) {
    const has = (boxByHorizon.get(h)?.size ?? 0) > 0;
    horizonsPresent[h] = has;
    if (has) horizonsLoaded.push(h);
  }

  return {
    boxByHorizon, pairMetaMap, drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap,
    horizonsPresent, horizonsLoaded, usingFallback,
    boxRowCount: boxRows.length, pairRowCount: pairRows.length, rawBoxRows,
  };
}

async function fetchHistoryOverrides(scope: Scope) {
  try {
    const clause = scope === 'allday' ? '' : `&session=eq.${encodeURIComponent(scope)}`;
    const rows = await sbGet<any[]>(
      `/rest/v1/histories?select=result_digits,date_et${clause}&order=date_et.desc&limit=3650`,
    );
    if (!Array.isArray(rows) || rows.length === 0)
      return { dsOverride: new Map<string,number>(), lsOverride: new Map<string,string>(), hitDatesMap: new Map<string,number[]>() };
    const dsOverride  = new Map<string, number>();
    const lsOverride  = new Map<string, string>();
    const hitDatesMap = new Map<string, number[]>();
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
        const d = Math.floor(new Date(String(row.date_et)).getTime() / 86400000);
        const arr = hitDatesMap.get(cs) ?? []; arr.push(d); hitDatesMap.set(cs, arr);
      }
    });
    return { dsOverride, lsOverride, hitDatesMap };
  } catch {
    return { dsOverride: new Map<string,number>(), lsOverride: new Map<string,string>(), hitDatesMap: new Map<string,number[]>() };
  }
}

// ─── Core compute ─────────────────────────────────────────────────────────────

interface K6Item {
  combo: string; normKey: string; indicator: number;
  freqS: number; pressureS: number;
  boxS: number; pburstS: number; coS: number; dgcS: number;
  energy: number; multiplicity: 'singles'|'doubles'|'triples'; topPair: string;
}

async function computeSlate(params: {
  scope: string; weightsKey?: string; targetDate?: string;
  excludeComboSets?: string[]; is_supplement?: boolean;
}): Promise<Record<string, unknown>> {
  const { weightsKey = 'balanced', targetDate, excludeComboSets = [], is_supplement = false } = params;
  const scope = normalizeScope(params.scope);
  const now   = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;
  const universe = buildUniverse();

  const { presets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown, synergyOn, synergyWeight } = await loadEngineConfig();
  const weights: WeightSet = (presets as any)[weightsKey] ?? presets.balanced;

  // 1. Fetch datasets + history overrides
  const [ds, { dsOverride, lsOverride, hitDatesMap }] = await Promise.all([
    fetchDatasets(scope),
    fetchHistoryOverrides(scope),
  ]);
  for (const [cs, d] of dsOverride) { const s = ds.drawsSinceMap.get(cs); if (s == null || d < s) ds.drawsSinceMap.set(cs, d); }
  for (const [cs, l] of lsOverride) { const s = ds.lastSeenMap.get(cs);   if (!s || l > s)       ds.lastSeenMap.set(cs, l);   }

  if (ds.horizonsLoaded.length === 0) throw new Error(`No BOX data for scope: ${scope}`);

  const dgcMap = new Map<string, number>();
  for (const [cs, dates] of hitDatesMap) dgcMap.set(cs, computeDGC(dates));

  // 2. Today + yesterday draws — hard exclusion from TWO sources.
  // Backtest 2026-05-12 (n=87 slates × 3 scopes, 30-day window) — adding the
  // yesterday block lifts slate hit rate +3.5pp overall (70.1% → 73.6%) and
  // wins in every scope cut. Sources A (histories) + B (daily_intelligence)
  // are queried independently so the block still works when only one is fresh.
  const todayHitComboSets = new Set<string>();
  const effectiveExcluded = new Set<string>();
  const yesterdayEt = getYesterdayET();

  // Source A: histories table
  try {
    const tw = await sbGet<any[]>(
      `/rest/v1/histories?date_et=gte.${yesterdayEt}&date_et=lte.${todayEt}&select=result_digits&limit=1000`,
    );
    if (Array.isArray(tw)) tw.forEach(w => {
      if (typeof w?.result_digits === 'string' && /^\d{3}$/.test(w.result_digits)) {
        todayHitComboSets.add(toComboSet(w.result_digits));
        effectiveExcluded.add(w.result_digits);
      }
    });
  } catch { /* non-fatal */ }

  // Source B: daily_intelligence hit flags (works when histories isn't yet imported)
  try {
    const di = await sbGet<any[]>(
      `/rest/v1/daily_intelligence?slate_date=gte.${yesterdayEt}&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo_set,hit_result&limit=500`,
    );
    if (Array.isArray(di)) di.forEach(row => {
      if (typeof row?.combo_set === 'string' && row.combo_set) {
        todayHitComboSets.add(row.combo_set);
      }
      if (typeof row?.hit_result === 'string' && /^\d{3}$/.test(row.hit_result)) {
        todayHitComboSets.add(toComboSet(row.hit_result));
        effectiveExcluded.add(row.hit_result);
      }
    });
  } catch { /* non-fatal */ }

  // 3. Signal scoring
  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const td = ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0;
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  let maxPairTimesDrawn = 0;
  for (const cm of ds.pairMetaMap.values()) for (const m of cm.values()) if (m.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = m.timesDrawn;

  const getPairSignal = (pk: string, classId: number): number => {
    const m = ds.pairMetaMap.get(pk)?.get(classId);
    if (!m) return 0;
    const freq     = maxPairTimesDrawn > 0 ? m.timesDrawn / maxPairTimesDrawn : 0;
    const pressure = (m.timesDrawn > 0 && m.drawsSince < 500) ? Math.min(m.drawsSince / 182, 1.0) : 0;
    return (freq * 0.70) + (pressure * 0.30);
  };

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
    if (td > 0) {
      const freqScore = maxTimesDrawn > 0 ? td / maxTimesDrawn : 0;
      const dsVal     = ds.dsRawMap.get(normKey) ?? 0;
      const ptSpan    = Math.max(pressureThreshold - 100, 1);
      const pScore    =
        dsVal >= 100 && dsVal <= pressureThreshold ? Math.min((dsVal - 100) / ptSpan, 1.0) :
        dsVal > pressureThreshold                  ? Math.max(1.0 - (dsVal - pressureThreshold) / 200, 0.3) :
                                                     (dsVal / 100) * 0.5;
      rawFreq[i] = freqScore; rawPressure[i] = pScore;
      rawBox[i]  = (freqScore * 0.60) + (pScore * 0.40);
    }
    const ab = sortedPair(a, b), bc = sortedPair(b, c), ac2 = sortedPair(a, c);
    rawPburst[i] = (getPairSignal(ab, 2) + getPairSignal(bc, 3) + getPairSignal(ac2, 4)) / 3;
    let coSum = 0;
    for (const cid of [5, 6, 7, 8, 9, 10, 11]) coSum += getPairSignal(ab, cid) + getPairSignal(bc, cid) + getPairSignal(ac2, cid);
    rawCo[i]  = coSum / 21;
    rawDgc[i] = dgcMap.get(normKey) ?? 0;
  }

  // 4. Normalize
  const rawBoxArr      = Array.from(rawBox);
  const realBoxMasked  = rawBoxArr.map((v, i) => (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? v : 0);
  const normBoxRaw     = maxNorm(realBoxMasked, true);
  const normBox        = normBoxRaw.map((v, i) => (ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) === 0 ? 0 : v);
  const normPburst     = maxNorm(Array.from(rawPburst), true);
  const normCo         = maxNorm(Array.from(rawCo),     true);
  const normDgc        = maxNorm(Array.from(rawDgc),    true);

  // 5. Final scores
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const multAdj = MULTIPLICITY_PRIORS[multiplicityOf(universe[i])];
    finalScores[i] = weights.BOX * normBox[i] + weights.PBURST * normPburst[i] + weights.CO * normCo[i] + weights.DGC * normDgc[i] + multAdj;
    if (synergyOn && [normBox[i], normPburst[i], normCo[i], normDgc[i]].filter(v => v >= 0.65).length >= 2)
      finalScores[i] *= (1 + synergyWeight);
  }

  // 6. K6 selection (6 passes)
  const realIdx: number[] = [], placeholderIdx: number[] = [];
  for (let i = 0; i < 1000; i++) {
    ((ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0) > 0 ? realIdx : placeholderIdx).push(i);
  }
  const sortFn = (a: number, b: number) =>
    finalScores[b] !== finalScores[a] ? finalScores[b] - finalScores[a] : universe[a].localeCompare(universe[b]);
  realIdx.sort(sortFn); placeholderIdx.sort(sortFn);
  const scorePool = Array.from(finalScores).sort((a, b) => a - b);

  // top30 must respect the same yesterday-hit hard block as K6 selection — otherwise
  // daily_intelligence shows recently-drawn box-sets as "top picks" while the slate
  // (correctly) excludes them, and the on_slate marker fails to land on K6 combos.
  const top30PreRail = Array.from({ length: 1000 }, (_, i) => {
    const combo = universe[i], nk = toComboSet(combo);
    return { combo, comboSet: nk, finalScore: finalScores[i],
      mult: multiplicityOf(combo), topPair: topPairOf(combo),
      signals: { BOX: normBox[i], PBURST: normPburst[i], CO: normCo[i], DGC: normDgc[i] },
      energy: percentileRankOf(finalScores[i], scorePool),
      timesDrawn: ds.timesDrawnMap.get(nk) ?? 0 };
  }).filter(p => !(todayHitComboSets.size > 0 && todayHitComboSets.has(p.comboSet)))
    .sort((a, b) => b.finalScore - a.finalScore).slice(0, 30);

  const k6: K6Item[] = [];
  let singles = 0, doubles = 0, triples = 0;
  const pairCounts: Record<string, number> = {};
  const selectedCS = new Set<string>();
  const excCSSet   = new Set(excludeComboSets);

  const tryAdd = (idx: number, rx = false, rp = false, rc = false, rm = false): boolean => {
    if (k6.length >= 6) return false;
    const combo = universe[idx], nk = toComboSet(combo);
    if (selectedCS.has(nk)) return false;
    if (todayHitComboSets.size > 0 && todayHitComboSets.has(nk)) return false;
    if (!rx && effectiveExcluded.has(combo)) return false;
    if (!rx && excCSSet.size > 0 && excCSSet.has(nk)) return false;
    const mult = multiplicityOf(combo);
    if (!rm) {
      if (mult === 'singles' && singles >= rails.singlesMax) return false;
      if (mult === 'doubles' && doubles >= rails.doublesMax) return false;
      if (mult === 'triples' && !rails.triplesOn) return false;
    }
    const tp = topPairOf(combo);
    if (!rp && (pairCounts[tp] ?? 0) >= rails.pairRepCap) return false;
    const energy = percentileRankOf(finalScores[idx], scorePool);
    if (minEnergyThreshold > 0 && (ds.timesDrawnMap.get(nk) ?? 0) > 0 && energy < minEnergyThreshold) return false;
    const recentDs = ds.drawsSinceMap.get(nk) ?? 999;
    if (!rc && recentHitCooldown > 0 && dsOverride.has(nk) && (ds.timesDrawnMap.get(nk) ?? 0) > 0 && recentDs < recentHitCooldown) return false;
    k6.push({ combo, normKey: nk, indicator: finalScores[idx],
      freqS: rawFreq[idx], pressureS: rawPressure[idx],
      boxS: normBox[idx], pburstS: normPburst[idx], coS: normCo[idx], dgcS: normDgc[idx],
      energy, multiplicity: mult, topPair: tp });
    if (mult === 'singles') singles++; else if (mult === 'doubles') doubles++; else triples++;
    pairCounts[tp] = (pairCounts[tp] ?? 0) + 1;
    selectedCS.add(nk);
    return true;
  };

  const all = [...realIdx, ...placeholderIdx];
  for (const i of realIdx)      { if (k6.length >= 6) break; tryAdd(i); }
  if (k6.length < 6) for (const i of placeholderIdx) { if (k6.length >= 6) break; tryAdd(i); }
  if (k6.length < 6) for (const i of all) { if (k6.length >= 6) break; tryAdd(i, true); }
  if (k6.length < 6) for (const i of all) { if (k6.length >= 6) break; tryAdd(i, true, true); }
  if (k6.length < 6) for (const i of all) { if (k6.length >= 6) break; tryAdd(i, true, true, true); }
  if (k6.length < 6) for (const i of all) { if (k6.length >= 6) break; tryAdd(i, true, true, true, true); }

  // Sort final K6 by indicator desc — selection happens pass-by-pass, so the array
  // can interleave low-indicator pass-1 picks ahead of higher-indicator pass-5 picks
  // (e.g. when cooldown relaxes). Indicator-desc gives the user the highest-conviction
  // pick at position 1 without changing which 6 combos are selected.
  k6.sort((a, b) => b.indicator - a.indicator);

  // 7. Build output
  const scopeConfidence = computeConfidenceScore(ds.horizonsLoaded.length, ds.boxRowCount);
  const hash = computeSlateHash(scope, weightsKey, k6.map(x => x.combo), ds.horizonsPresent);

  const sck = (c: string) => c.split('').sort().join('');
  const topKStraights = k6.map((x, idx) => {
    const sk = sck(x.combo);
    const br = (ds.rawBoxRows as any[]).find(r => r && typeof r.key === 'string' && sck(r.key.replace(/\D/g,'').slice(0,3)) === sk);
    return {
      combo: x.combo, comboSet: x.normKey, indicator: x.indicator,
      box: x.boxS, pburst: x.pburstS, co: x.coS,
      signals: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
      multiplicity: x.multiplicity, topPair: x.topPair, energy: x.energy, temperature: x.energy,
      rank: idx + 1, confidence: Math.round(scopeConfidence * 100),
      drawsSince: ds.dsRawMap.get(x.normKey) ?? (br as any)?.ds_raw ?? null,
      timesDrawn: (br as any)?.times_drawn ?? ds.timesDrawnMap.get(x.normKey) ?? 0,
      dsRaw:      (br as any)?.ds_raw ?? ds.dsRawMap.get(x.normKey) ?? 0,
      lastSeen:   ds.lastSeenMap.get(x.normKey) ?? (br as any)?.last_seen ?? null,
    };
  });

  const horizonsMeta = {
    ...ds.horizonsPresent,
    _engineVersion: ENGINE_VERSION, _mode: weightsKey,
    _confidence: Math.round(scopeConfidence * 100),
    _dataStats: { boxRowsUsed: ds.boxRowCount, pairRowsUsed: ds.pairRowCount, horizonsLoaded: ds.horizonsLoaded, usingFallback: ds.usingFallback },
    _source: 'edge',
    ...(is_supplement ? { _is_supplement: true } : {}),
  };
  const componentsJson = k6.map(x => ({
    combo: x.combo,
    components: { BOX: x.boxS, PBURST: x.pburstS, CO: x.coS, DGC: x.dgcS },
    temperature: x.energy, multiplicity: x.multiplicity, topPair: x.topPair,
    indicator: x.indicator, energy: x.energy,
  }));

  const payload: Record<string, unknown> = {
    scope, horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: weightsKey },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k6.map(x => x.normKey),
    components_json: componentsJson,
    updated_at_et: now, slate_date: effectiveDate,
    snapshot_hash: hash, hash, admin_published: true,
    ...(is_supplement ? { file_meta: JSON.stringify({ is_supplement: true, supplement_reason: 'post_hit_refresh', excluded_combo_sets: excludeComboSets }) } : {}),
  };

  // Soft-delete prior same-scope snapshot for today (non-supplement only)
  if (!is_supplement) {
    try {
      const etMs = 4 * 60 * 60 * 1000;
      const start = new Date(new Date(getTodayET() + 'T00:00:00').getTime() + etMs);
      const end   = new Date(start.getTime() + 86400000);
      await sbPatch(
        `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(scope)}&updated_at_et=gte.${start.toISOString()}&updated_at_et=lt.${end.toISOString()}&deleted_at=is.null`,
        { deleted_at: now },
      );
    } catch { /* non-fatal */ }
  }

  const res = await sbPost('/rest/v1/slate_snapshots', payload) as any[];
  const savedId = Array.isArray(res) && res.length > 0 ? String(res[0]?.id ?? '') : `zk6-${scope}-${Date.now()}`;

  // Write daily_intelligence (non-supplement only). on_slate is embedded in the
  // INSERT — no separate PATCH needed. Any K6 combo that didn't make top30 (because
  // pass-5 cooldown relaxation can pick combos outside the top30) gets appended as
  // an extra row past rank 30 so the Intelligence screen still finds it.
  if (!is_supplement) {
    try {
      const k6ComboSet = new Set(k6.map(x => x.combo));
      const top30Combos = new Set(top30PreRail.map(p => p.combo));

      const top30Rows = top30PreRail.map((p, i) => ({
        slate_date: effectiveDate, scope, mode: weightsKey, rank: i + 1,
        combo: p.combo, combo_set: p.comboSet, multiplicity: p.mult, top_pair: p.topPair,
        signal_box: p.signals.BOX, signal_pburst: p.signals.PBURST, signal_co: p.signals.CO, signal_dgc: p.signals.DGC,
        energy_score: p.energy,
        on_slate: k6ComboSet.has(p.combo), hit_box: false, hit_straight: false,
      }));

      const extraK6Rows = k6
        .filter(x => !top30Combos.has(x.combo))
        .map((x, i) => ({
          slate_date: effectiveDate, scope, mode: weightsKey, rank: 30 + i + 1,
          combo: x.combo, combo_set: x.normKey, multiplicity: x.multiplicity, top_pair: x.topPair,
          signal_box: x.boxS, signal_pburst: x.pburstS, signal_co: x.coS, signal_dgc: x.dgcS,
          energy_score: x.energy,
          on_slate: true, hit_box: false, hit_straight: false,
        }));

      const diRows = [...top30Rows, ...extraK6Rows];
      await sbDelete(`/rest/v1/daily_intelligence?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${encodeURIComponent(weightsKey)}&hit_box=eq.false&hit_straight=eq.false`);
      await sbPost('/rest/v1/daily_intelligence', diRows, 'resolution=merge-duplicates,return=minimal');
    } catch (e) { console.error('[edge-zk6] daily_intelligence write FAILED:', String(e)); }
  }

  return {
    id: savedId, scope,
    horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: weightsKey },
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k6.map(x => x.normKey),
    components_json: componentsJson,
    updated_at_et: now, slate_date: effectiveDate, hash,
    mode: weightsKey, engineVersion: ENGINE_VERSION, source: 'edge',
    confidence: Math.round(scopeConfidence * 100),
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
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[edge-zk6] error:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
