/**
 * compute-slate-zk6 — Supabase Edge Function
 * Server-side ZK6 slate computation using service-role key for all writes.
 * Signal math imported from lib/engineCore.ts (pure TS, Deno-safe).
 */

import {
  H_ALL, HORIZON_WEIGHTS, MULTIPLICITY_PRIORS,
  toComboSet, sortedPair, multiplicityOf, topPairOf, buildUniverse,
  normalizeBoxKey, normalizePairKey,
  computeDGC, percentileRankOf, maxNorm,
  computeSlateHash, computeConfidenceScore,
  computeBoxSignalDetailed, blendBoxDsRaw, getPairSignalFromMap,
  blendBoxTimesDrawn, blendPairTimesDrawn,
  bestOrderFor, intelligenceRowExtras, computeAdaptiveWeights,
  computeWeightedScore,
  type PairDataTree, type PairTimesDrawnTree,
  type Scope, type WeightSet, type SignalAuc,
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
// SCRUB-01 (2026-05-27): production is balanced-only during deep live testing.
// Conservative/aggressive removed from production. Harness retains 3 modes.
type WeightPresets = { balanced: WeightSet };

interface RailConfig { singlesMax: number; doublesMax: number; triplesOn: boolean; pairRepCap: number; }
interface EngineConfig {
  presets: WeightPresets; rails: RailConfig;
  pressureThreshold: number; minEnergyThreshold: number;
  recentHitCooldown: number; synergyOn: boolean; synergyWeight: number;
  horizonWeights: Record<string, number>;
  // CONFIG-02 (2026-05-14): BOX freq/pressure split, with per-scope override
  // wins-over-global wins-over-default (0.60 / 0.40). Negative pressure weight
  // = "inverted" — penalise high-pressure ("overdue") combos. Validated by
  // 30-day backtest: midday/evening benefit from inversion, allday does not.
  boxFreqWeight: number;
  boxPressureWeight: number;
  /** Resolved effective values (post-scope-override). Same defaults if unset. */
  effectiveBoxFreqWeight?: number;
  effectiveBoxPressureWeight?: number;
  // CONFIG-08 (2026-05-27): when true, BOX times_drawn + pair times_drawn
  // honor horizon_weights via blend. Read from app_config; defaults to true.
  timesDrawnBlendEnabled: boolean;
  // ENH-AFL-2 (2026-05-27): adaptive signal weights.
  adaptiveSignalWeightsEnabled: boolean;
  adaptiveSignalWeightsAlpha: number;
}
interface Datasets {
  boxByHorizon: BoxByHorizon;
  // CONFIG-08: per-horizon BOX times_drawn (parallel to boxByHorizon).
  boxTimesDrawnByHorizon: Map<string, Map<string, number>>;
  pairMetaMap:  Map<string, Map<number, PairMeta>>;
  // Per-horizon pair ds_raw tree — needed by bestOrderFor (engineCore).
  // Parallel to pairMetaMap but preserves all horizons instead of H01Y-preferred.
  pairData:     PairDataTree;
  // CONFIG-08: per-horizon pair times_drawn tree (parallel to pairData).
  pairTimesDrawnByHorizon: PairTimesDrawnTree;
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
    balanced: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
  },
  rails:             { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
  pressureThreshold: 250,
  minEnergyThreshold: 0,
  recentHitCooldown: 20,
  synergyOn:     false,
  synergyWeight: 0.15,
  horizonWeights: { ...HORIZON_WEIGHTS },
  boxFreqWeight: 0.60,
  boxPressureWeight: 0.40,
  timesDrawnBlendEnabled: true,
  adaptiveSignalWeightsEnabled: false,
  adaptiveSignalWeightsAlpha: 1.0,
};

// ─── Config loader ────────────────────────────────────────────────────────────

async function loadEngineConfig(scope?: Scope): Promise<EngineConfig> {
  try {
    // Per-scope cooldown override (2026-05-13 CONFIG-05). When `scope` is passed,
    // also pull `recent_hit_cooldown_${scope}` and overlay it on the global. Only
    // recent_hit_cooldown is currently scope-overridable; other knobs stay global
    // until empirically justified.
    const scopeCooldownKey = scope ? `recent_hit_cooldown_${scope}` : null;
    const scopeBoxFreqKey  = scope ? `box_freq_weight_${scope}`     : null;
    const scopeBoxPressKey = scope ? `box_pressure_weight_${scope}` : null;
    // CONFIG-07 (2026-05-15): per-scope signal-weight overrides.
    // SCRUB-01 (2026-05-27): only balanced is consumed in production.
    const scopeBalancedKey = scope ? `engine_weights_balanced_${scope}` : null;
    // ENH-MET (2026-05-18): per-scope energy floor override. Parity with
    // engines/zk6.ts. Falls back to global min_energy_threshold then hardcoded.
    const scopeMinEnergyKey = scope ? `min_energy_threshold_${scope}` : null;
    const keyList = [
      'engine_weights_balanced',
      'k6_singles_max', 'k6_doubles_max', 'k6_triples_on', 'pair_rep_cap',
      'pressure_threshold', 'min_energy_threshold', 'recent_hit_cooldown',
      'synergy_boost_on', 'synergy_boost_weight',
      'horizon_weights',
      'box_freq_weight', 'box_pressure_weight',
      'box_times_drawn_blend_enabled',
      'adaptive_signal_weights_enabled', 'adaptive_signal_weights_alpha',
      ...(scopeCooldownKey ? [scopeCooldownKey] : []),
      ...(scopeBoxFreqKey  ? [scopeBoxFreqKey]  : []),
      ...(scopeBoxPressKey ? [scopeBoxPressKey] : []),
      ...(scopeBalancedKey ? [scopeBalancedKey] : []),
      ...(scopeMinEnergyKey ? [scopeMinEnergyKey] : []),
    ];
    const rows = await sbGet<{ key: string; value: string }[]>(
      '/rest/v1/app_config?key=in.(' + keyList.join(',') + ')&select=key,value',
    );
    if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_CFG;
    const cfg: EngineConfig = JSON.parse(JSON.stringify(DEFAULT_CFG));
    let scopeCooldownOverride: number | null = null;
    let scopeBoxFreqOverride:  number | null = null;
    let scopeBoxPressOverride: number | null = null;
    let scopeBalancedOverride:     WeightSet | null = null;
    let scopeMinEnergyOverride: number | null = null;
    for (const row of rows) {
      try {
        if (row.key === 'k6_singles_max')       { const v = parseInt(row.value,10); if (!isNaN(v)) cfg.rails.singlesMax = v; continue; }
        if (row.key === 'k6_doubles_max')       { const v = parseInt(row.value,10); if (!isNaN(v)) cfg.rails.doublesMax = v; continue; }
        if (row.key === 'k6_triples_on')        { cfg.rails.triplesOn = row.value === 'true'; continue; }
        if (row.key === 'pair_rep_cap')         { const v = parseInt(row.value,10); if (!isNaN(v)) cfg.rails.pairRepCap = v; continue; }
        if (row.key === 'pressure_threshold')   { const v = parseInt(row.value,10); if (!isNaN(v) && v >= 50) cfg.pressureThreshold = v; continue; }
        if (row.key === 'min_energy_threshold') { const v = parseInt(row.value,10); if (!isNaN(v) && v >= 0) cfg.minEnergyThreshold = v; continue; }
        if (row.key === 'recent_hit_cooldown')  { const v = parseInt(row.value,10); if (!isNaN(v) && v >= 0) cfg.recentHitCooldown = v; continue; }
        if (scopeCooldownKey && row.key === scopeCooldownKey) {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 0) scopeCooldownOverride = v;
          continue;
        }
        if (row.key === 'box_freq_weight') {
          const v = parseFloat(row.value);
          if (!isNaN(v)) cfg.boxFreqWeight = v;
          continue;
        }
        if (row.key === 'box_pressure_weight') {
          const v = parseFloat(row.value);
          if (!isNaN(v)) cfg.boxPressureWeight = v;
          continue;
        }
        if (row.key === 'box_times_drawn_blend_enabled') {
          if (row.value === 'true')  { cfg.timesDrawnBlendEnabled = true;  continue; }
          if (row.value === 'false') { cfg.timesDrawnBlendEnabled = false; continue; }
          continue;
        }
        if (row.key === 'adaptive_signal_weights_enabled') {
          if (row.value === 'true')  { cfg.adaptiveSignalWeightsEnabled = true;  continue; }
          if (row.value === 'false') { cfg.adaptiveSignalWeightsEnabled = false; continue; }
          continue;
        }
        if (row.key === 'adaptive_signal_weights_alpha') {
          const v = parseFloat(row.value);
          if (!isNaN(v) && v >= 0 && v <= 2) cfg.adaptiveSignalWeightsAlpha = v;
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
        if (row.key === 'synergy_boost_on')     { cfg.synergyOn = row.value === 'true'; continue; }
        if (row.key === 'synergy_boost_weight') { const v = parseFloat(row.value); if (!isNaN(v) && v >= 0) cfg.synergyWeight = v; continue; }
        if (row.key === 'horizon_weights') {
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
              cfg.horizonWeights = candidate;
            } else {
              console.warn('[edge-zk6] horizon_weights ignored (invalid or sum != 100):', sum);
            }
          } catch { console.warn('[edge-zk6] horizon_weights parse failed'); }
          continue;
        }
        const parsed = JSON.parse(row.value);
        const p = (v: number) => v > 1 ? v / 100 : v;
        const ws: WeightSet = {
          BOX:    p(parsed.BOX    ?? parsed.box    ?? 0),
          PBURST: p(parsed.PBURST ?? parsed.pburst ?? 0),
          CO:     p(parsed.CO     ?? parsed.co     ?? 0),
          DGC:    p(parsed.DGC    ?? parsed.dgc    ?? DEFAULT_CFG.presets.balanced.DGC),
        };
        if (ws.BOX + ws.PBURST + ws.CO > 0.05) {
          if (row.key === 'engine_weights_balanced') cfg.presets.balanced = ws;
          if (scopeBalancedKey && row.key === scopeBalancedKey) scopeBalancedOverride = ws;
        }
      } catch { /* keep default */ }
    }
    // SCRUB-01: balanced-only in production.
    if (scopeBalancedOverride && scope) {
      console.log(`[edge-zk6] preset override: scope=${scope} preset=balanced ${JSON.stringify(cfg.presets.balanced)} → ${JSON.stringify(scopeBalancedOverride)}`);
      cfg.presets.balanced = scopeBalancedOverride;
    }
    if (scopeCooldownOverride !== null && scope) {
      console.log(`[edge-zk6] cooldown override: scope=${scope} ${cfg.recentHitCooldown} → ${scopeCooldownOverride}`);
      cfg.recentHitCooldown = scopeCooldownOverride;
    }
    cfg.effectiveBoxFreqWeight     = scopeBoxFreqOverride  ?? cfg.boxFreqWeight;
    cfg.effectiveBoxPressureWeight = scopeBoxPressOverride ?? cfg.boxPressureWeight;
    if ((scopeBoxFreqOverride !== null || scopeBoxPressOverride !== null) && scope) {
      console.log(`[edge-zk6] box weight override: scope=${scope} freq=${cfg.effectiveBoxFreqWeight} pressure=${cfg.effectiveBoxPressureWeight}`);
    }
    if (scopeMinEnergyOverride !== null && scope) {
      console.log(`[edge-zk6] energy floor override: scope=${scope} ${cfg.minEnergyThreshold} → ${scopeMinEnergyOverride}`);
      cfg.minEnergyThreshold = scopeMinEnergyOverride;
    }
    return cfg;
  } catch {
    return DEFAULT_CFG;
  }
}

/**
 * ENH-AFL-2: Load rolling 30-day per-signal AUC from signal_auc_per_day.
 * Returns null when < 14 days of data are available (cold-start fallback).
 */
async function loadRollingAuc(scope: Scope): Promise<SignalAuc | null> {
  try {
    const sinceDate = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const rows = await sbGet<{ signal: string; auc: number }[]>(
      `/rest/v1/signal_auc_per_day?scope=eq.${encodeURIComponent(scope)}&day=gte.${sinceDate}&select=signal,auc&limit=200`,
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
  // BUG-153: PostgREST caps single REST responses at 1000 rows regardless of
  // client `limit`. The pair fetch was returning ~1000 of 1370+ rows per scope,
  // silently dropping the highest-class / oldest-horizon rows. Paginate via
  // offset until a page returns fewer than pageSize rows.
  const fetchPairRowsPaginated = async (): Promise<unknown[]> => {
    const all: unknown[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await sbGet<unknown[]>(
        `/rest/v1/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=is.null` +
        `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=${pageSize}&offset=${offset}`,
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

async function fetchDatasets(scope: Scope): Promise<Datasets> {
  const enc = encodeURIComponent(scope);
  let { boxRows, pairRows } = await fetchRaw(enc);
  let usingFallback = false;
  if (boxRows.length < 50 && scope !== 'allday') {
    const fb = await fetchRaw(encodeURIComponent('allday'));
    boxRows = fb.boxRows; pairRows = fb.pairRows; usingFallback = true;
  }

  const boxByHorizon: BoxByHorizon = new Map();
  const boxTimesDrawnByHorizon = new Map<string, Map<string, number>>();
  const dsRawMap      = new Map<string, number>();
  const timesDrawnMap = new Map<string, number>();
  const drawsSinceMap = new Map<string, number>();
  const lastSeenMap   = new Map<string, string>();
  const rawBoxRows    = [...boxRows];

  // BUG-129 fix: dsRaw / drawsSince must come from H01Y horizon (1-year window),
  // not whichever horizon happens to have the highest times_drawn (typically H10Y).
  // The local engine and replay harness both prefer H01Y; the edge function was
  // letting long-horizon dsRaw values bleed in, inflating BOX pressure scores and
  // biasing selection toward "long-overdue" combos. timesDrawn is allowed to take
  // its max across horizons (max wins) since it's a frequency measure.
  for (const row of boxRows as any[]) {
    if (!row || typeof row.key !== 'string') continue;
    const h       = String(row.horizon_label ?? 'H01Y');
    const normKey = normalizeBoxKey(row.key);
    const ds      = typeof row.ds_raw === 'number' ? row.ds_raw : 0;
    const td      = typeof row.times_drawn === 'number' ? row.times_drawn : 0;
    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, ds);

    // CONFIG-08: per-horizon times_drawn (parallel structure used by blend path).
    if (!boxTimesDrawnByHorizon.has(h)) boxTimesDrawnByHorizon.set(h, new Map());
    boxTimesDrawnByHorizon.get(h)!.set(normKey, td);

    // timesDrawn: max across horizons wins (kept as placeholder-vs-real gate).
    if (td > (timesDrawnMap.get(normKey) ?? 0)) {
      timesDrawnMap.set(normKey, td);
    }

    // dsRaw / drawsSince: H01Y preferred, within H01Y non-zero wins.
    // If no H01Y row arrives for a normKey, the first horizon seen seeds the value.
    if (h === 'H01Y' || !drawsSinceMap.has(normKey)) {
      const existing = dsRawMap.get(normKey) ?? 0;
      if (existing === 0 || ds > 0) {
        dsRawMap.set(normKey, ds);
        drawsSinceMap.set(normKey, ds);
      }
    }

    const ls = typeof row.last_seen === 'string' ? row.last_seen : null;
    if (ls && (!lastSeenMap.has(normKey) || ls > lastSeenMap.get(normKey)!))
      lastSeenMap.set(normKey, ls);
  }

  // BUG-129 fix (pair path): pairMetaMap must be H01Y-preferred, matching the local
  // engine and replay harness. The edge function was previously selecting the horizon
  // with the highest times_drawn (typically H10Y), causing pair signal scores to use
  // 10-year aggregates for both freq and pressure components, which inflated PBURST/CO.
  //
  // pairData (per-horizon tree) is built in parallel for bestOrderFor — its position-
  // pair scoring needs all horizons, blended by HORIZON_WEIGHTS. Parity with engines/zk6.ts.
  const pairMetaMap = new Map<string, Map<number, PairMeta>>();
  const pairData: PairDataTree = new Map();
  // CONFIG-08: per-horizon pair times_drawn tree, parallel to pairData.
  const pairTimesDrawnByHorizon: PairTimesDrawnTree = new Map();
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
      cm.set(classId, { dsRaw: ds, drawsSince: ds, timesDrawn: td });
    }
    // Per-horizon pairData tree (all horizons preserved)
    if (!pairData.has(normKey)) pairData.set(normKey, new Map());
    const cd = pairData.get(normKey)!;
    if (!cd.has(classId)) cd.set(classId, new Map());
    cd.get(classId)!.set(h, ds);

    // CONFIG-08: per-horizon pair times_drawn (parallel to pairData).
    if (!pairTimesDrawnByHorizon.has(normKey)) pairTimesDrawnByHorizon.set(normKey, new Map());
    const ct = pairTimesDrawnByHorizon.get(normKey)!;
    if (!ct.has(classId)) ct.set(classId, new Map());
    ct.get(classId)!.set(h, td);
  }

  const horizonsPresent: Record<string, boolean> = {};
  const horizonsLoaded: string[] = [];
  for (const h of H_ALL) {
    const has = (boxByHorizon.get(h)?.size ?? 0) > 0;
    horizonsPresent[h] = has;
    if (has) horizonsLoaded.push(h);
  }

  return {
    boxByHorizon, boxTimesDrawnByHorizon, pairMetaMap, pairData, pairTimesDrawnByHorizon,
    drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap,
    horizonsPresent, horizonsLoaded, usingFallback,
    boxRowCount: boxRows.length, pairRowCount: pairRows.length, rawBoxRows,
  };
}

async function fetchHistoryOverrides(scope: Scope) {
  try {
    const clause = scope === 'allday' ? '' : `&session=eq.${encodeURIComponent(scope)}`;
    // BUG-152: PostgREST caps responses at 1000 rows regardless of client `limit`.
    // Paginate via offset until a page returns fewer than pageSize rows.
    const rows: any[] = [];
    const pageSize = 1000;
    for (let offset = 0; offset < 20000; offset += pageSize) {
      const page = await sbGet<any[]>(
        `/rest/v1/histories?select=result_digits,date_et${clause}&order=date_et.desc&limit=${pageSize}&offset=${offset}`,
      );
      const arr = Array.isArray(page) ? page : [];
      rows.push(...arr);
      if (arr.length < pageSize) break;
    }
    if (rows.length === 0)
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
  // SCRUB-01: weightsKey param retained for caller compat but always resolves
  // to balanced in production. Persisted as 'balanced' on every snapshot/AT row.
  const { targetDate, excludeComboSets = [], is_supplement = false } = params;
  const weightsKey = 'balanced';
  const scope = normalizeScope(params.scope);
  const now   = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;
  const universe = buildUniverse();

  const cfg = await loadEngineConfig(scope);
  const { presets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown, synergyOn, synergyWeight, horizonWeights } = cfg;
  const baseWeights: WeightSet = presets.balanced;

  // ENH-AFL-2: adaptive signal weights. Layer on top of base when enabled and
  // sufficient AUC history exists. See engines/zk6.ts for parity copy.
  let weights: WeightSet = baseWeights;
  let adaptiveDiagnostics: ReturnType<typeof computeAdaptiveWeights>['diagnostics'] | null = null;
  if (cfg.adaptiveSignalWeightsEnabled) {
    const rollingAuc = await loadRollingAuc(scope);
    if (rollingAuc) {
      const adaptive = computeAdaptiveWeights(baseWeights, rollingAuc, cfg.adaptiveSignalWeightsAlpha);
      weights = adaptive.weights;
      adaptiveDiagnostics = adaptive.diagnostics;
      console.log(`[edge-zk6] ENH-AFL-2 adaptive: scope=${scope} α=${cfg.adaptiveSignalWeightsAlpha}`,
        `auc=${JSON.stringify(rollingAuc)}`,
        `base→adj: ${JSON.stringify(baseWeights)} → ${JSON.stringify(weights)}`);
    } else {
      console.log(`[edge-zk6] ENH-AFL-2 adaptive: scope=${scope} — insufficient AUC data, using base`);
    }
  }
  // CONFIG-02 (2026-05-14): effective per-scope BOX freq/pressure split.
  const effBoxFreqWeight     = cfg.effectiveBoxFreqWeight     ?? cfg.boxFreqWeight;
  const effBoxPressureWeight = cfg.effectiveBoxPressureWeight ?? cfg.boxPressureWeight;
  console.log('[edge-zk6] BOX split: freq=' + effBoxFreqWeight + ' pressure=' + effBoxPressureWeight);

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
  // CONFIG-08 (2026-05-27): when timesDrawnBlendEnabled is true, BOX + pair
  // times_drawn honor horizon_weights via blend. Build synthetic pairMetaMap
  // keyed by the blended times_drawn (drawsSince stays H01Y — ds_raw invariant
  // across horizons by construction). Legacy pairMetaMap stays for cooldown reads.
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

  let maxTimesDrawn = 0;
  for (let i = 0; i < 1000; i++) {
    const nk = toComboSet(universe[i]);
    const td = tdBlend
      ? blendBoxTimesDrawn(nk, ds.boxTimesDrawnByHorizon, horizonWeights)
      : (ds.timesDrawnMap.get(nk) ?? 0);
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  console.log('[edge-zk6] CONFIG-08 blend:', tdBlend, 'maxTimesDrawn:', maxTimesDrawn, 'horizonWeights:', JSON.stringify(horizonWeights));

  let maxPairTimesDrawn = 0;
  for (const cm of pairMetaForSignals.values()) for (const m of cm.values()) if (m.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = m.timesDrawn;

  // Pair signal: delegates to engineCore.getPairSignalFromMap. When CONFIG-08
  // blend is on, pairMetaForSignals carries the blended times_drawn.
  const getPairSignal = (pk: string, classId: number): number =>
    getPairSignalFromMap(pairMetaForSignals, pk, classId, maxPairTimesDrawn);

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
    // BOX: delegates to engineCore.computeBoxSignalDetailed (shared math).
    // ENH-HW: dsVal is a horizon-weighted blend.
    // CONFIG-08: times_drawn is also horizon-blended when the flag is on.
    const td = tdBlend
      ? blendBoxTimesDrawn(normKey, ds.boxTimesDrawnByHorizon, horizonWeights)
      : (ds.timesDrawnMap.get(normKey) ?? 0);
    const dsVal = blendBoxDsRaw(normKey, ds.boxByHorizon, horizonWeights);
    const parts = computeBoxSignalDetailed(
      td, dsVal, maxTimesDrawn, pressureThreshold,
      effBoxFreqWeight, effBoxPressureWeight,
    );
    rawFreq[i]     = parts.freq;
    rawPressure[i] = parts.pressure;
    rawBox[i]      = parts.box;
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
  // ENG-AUDIT-02 (2026-06-06): replaces the inline body with the shared
  // computeWeightedScore helper. Behavior bit-identical at the default
  // synergy threshold (0.65) and minCount (2), which matches the prior
  // inline implementation. Completes the consolidation started in
  // ENG-AUDIT-01: lib/engineCore.computeWeightedScore is now the single
  // source of truth across engines/zk6.ts, scripts/backtest/replay.ts,
  // and this edge function.
  const finalScores = new Float64Array(1000);
  for (let i = 0; i < 1000; i++) {
    const multAdj = MULTIPLICITY_PRIORS[multiplicityOf(universe[i])];
    finalScores[i] = computeWeightedScore(
      normBox[i], normPburst[i], normCo[i], normDgc[i],
      weights, multAdj, synergyOn, synergyWeight,
    );
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
      drawsSince: ds.drawsSinceMap.get(nk) ?? null,
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
      rank: idx + 1,
      // Position-pair maximised arrangement (engineCore.bestOrderFor). Parity with engines/zk6.ts.
      bestOrder: bestOrderFor(x.combo, ds.pairData, horizonWeights),
      confidence: Math.round(scopeConfidence * 100),
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

  // Soft-delete prior same-scope snapshot for the slate's effective date
  // (non-supplement only). Filtering on slate_date matches engines/zk6.ts and
  // correctly handles past-date regens (e.g. backfilling yesterday's slate).
  // Prior implementation used a UTC+4h window on updated_at_et which only
  // worked for "today" and was off by an hour during EST (Nov–Mar).
  if (!is_supplement) {
    try {
      await sbPatch(
        `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(scope)}&slate_date=eq.${effectiveDate}&deleted_at=is.null`,
        { deleted_at: now },
      );
    } catch { /* non-fatal */ }
  }

  const res = await sbPost('/rest/v1/slate_snapshots', payload) as any[];
  const savedId = Array.isArray(res) && res.length > 0 ? String(res[0]?.id ?? '') : `zk6-${scope}-${Date.now()}`;

  // ENH-08 (2026-05-15): engine_runs telemetry row per slate generation.
  // Captures the EFFECTIVE config used at gen time (post per-scope overrides) so
  // longitudinal queries can correlate config changes to live outcomes without
  // having to reconstruct what was in app_config at gen time. Non-fatal —
  // wrapped in try/catch so a telemetry failure never blocks slate save.
  if (!is_supplement) {
    try {
      await sbPost('/rest/v1/engine_runs', {
        slate_hash:           hash,
        scope,
        mode:                 weightsKey,
        slate_date:           effectiveDate,
        effective_weights:    {
          ...weights,
          _mode: weightsKey,
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
        source:               'edge',
        generated_at_et:      now,
      }, 'resolution=merge-duplicates,return=minimal');
    } catch (e) {
      console.warn('[edge-zk6] engine_runs telemetry write failed (non-fatal):', String(e));
    }
  }

  // Write daily_intelligence (non-supplement only). on_slate is embedded in the
  // INSERT — no separate PATCH needed. Any K6 combo that didn't make top30 (because
  // pass-5 cooldown relaxation can pick combos outside the top30) gets appended as
  // an extra row past rank 30 so the Intelligence screen still finds it.
  //
  // BUG-139 fix: previous write strategy was DELETE-WHERE-hit_box=false then INSERT
  // new top30 with `Prefer: resolution=merge-duplicates`. This preserved rows where
  // hits had already been stamped, but caused the entire INSERT batch to abort
  // silently when the new top30 occupied a rank held by a preserved hit-row — the
  // unique constraint on (slate_date, scope, mode, rank) fired before merge-
  // duplicates could resolve the natural-key conflict. 2026-05-13 allday demonstrated
  // this: 916/924 preserved at ranks 2/8, regen failed to write the remaining ~28
  // rows, Intel screen showed only those 2 picks for the whole day. Midday/evening
  // were unaffected because they had no hits → no preserved rows → no rank conflict.
  //
  // New strategy: DELETE ALL rows for (date, scope, mode) unconditionally, then
  // INSERT fresh top30 + K6-extras. Hit annotations are recovered by reading
  // adaptive_tracking (slate_hash-keyed, survives regens — the canonical hit log
  // per ENH-01) BEFORE the delete, and stamped onto matching combos in the new
  // INSERT batch. Combos that hit today but fell outside the new top30/K6 (because
  // their box-set was excluded by the today-hit filter) get appended past the
  // top30 + extra-K6 ranks so the Track Record band's hit_box=true count and the
  // Intel screen's "hit chip" still find them.
  if (!is_supplement) {
    try {
      const k6ComboSet = new Set(k6.map(x => x.combo));
      const top30Combos = new Set(top30PreRail.map(p => p.combo));

      // Hits-from-adaptive_tracking lookup: combo → primary match (first hit row
      // per combo; multi-state secondaries are still in adaptive_tracking but
      // daily_intelligence has 1-row-per-(date,scope,mode,combo) so we collapse).
      let hitsByCombo = new Map<string, { hit_box: boolean; hit_straight: boolean; hit_state: string | null; hit_session: string | null; hit_result: string | null }>();
      try {
        const at = await sbGet<any[]>(
          `/rest/v1/adaptive_tracking?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${encodeURIComponent(weightsKey)}&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo,hit_box,hit_straight,matched_state,matched_session,actual_result&limit=200`,
        );
        if (Array.isArray(at)) {
          for (const r of at) {
            if (!r.combo) continue;
            const existing = hitsByCombo.get(r.combo);
            // Prefer straight > box when collapsing multi-state
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
      } catch (e) { console.warn('[edge-zk6] adaptive_tracking hits fetch warn:', String(e)); }

      const stamp = (combo: string) => {
        const h = hitsByCombo.get(combo);
        return h ?? { hit_box: false, hit_straight: false, hit_state: null, hit_session: null, hit_result: null };
      };

      const top30Rows = top30PreRail.map((p, i) => ({
        slate_date: effectiveDate, scope, mode: weightsKey, rank: i + 1,
        combo: p.combo, combo_set: p.comboSet, multiplicity: p.mult, top_pair: p.topPair,
        signal_box: p.signals.BOX, signal_pburst: p.signals.PBURST, signal_co: p.signals.CO, signal_dgc: p.signals.DGC,
        energy_score: p.energy,
        ...intelligenceRowExtras(p.combo, p.comboSet, ds.drawsSinceMap, ds.timesDrawnMap, ds.pairData, horizonWeights),
        on_slate: k6ComboSet.has(p.combo),
        ...stamp(p.combo),
      }));

      const extraK6Rows = k6
        .filter(x => !top30Combos.has(x.combo))
        .map((x, i) => ({
          slate_date: effectiveDate, scope, mode: weightsKey, rank: 30 + i + 1,
          combo: x.combo, combo_set: x.normKey, multiplicity: x.multiplicity, top_pair: x.topPair,
          signal_box: x.boxS, signal_pburst: x.pburstS, signal_co: x.coS, signal_dgc: x.dgcS,
          energy_score: x.energy,
          ...intelligenceRowExtras(x.combo, x.normKey, ds.drawsSinceMap, ds.timesDrawnMap, ds.pairData, horizonWeights),
          on_slate: true,
          ...stamp(x.combo),
        }));

      // Any hit-bearing combo NOT in top30 and NOT in K6 (e.g. its box-set was
      // already drawn so the engine excluded it from the new top30) gets
      // appended so the historical hit row stays visible on Intel/Track Record.
      const placedCombos = new Set([...top30Combos, ...k6ComboSet]);
      const k6ExtraEndRank = 30 + extraK6Rows.length;
      const hitOrphanRows = [...hitsByCombo.entries()]
        .filter(([combo]) => !placedCombos.has(combo))
        .map(([combo, h], i) => ({
          slate_date: effectiveDate, scope, mode: weightsKey, rank: k6ExtraEndRank + i + 1,
          combo, combo_set: `{${combo.split('').sort().join(',')}}`,
          multiplicity: null, top_pair: null,
          signal_box: 0, signal_pburst: 0, signal_co: 0, signal_dgc: 0,
          energy_score: 0,
          ...intelligenceRowExtras(combo, `{${combo.split('').sort().join(',')}}`, null, null, null),
          on_slate: false,
          hit_box: h.hit_box, hit_straight: h.hit_straight,
          hit_state: h.hit_state, hit_session: h.hit_session, hit_result: h.hit_result,
        }));

      const diRows = [...top30Rows, ...extraK6Rows, ...hitOrphanRows];
      await sbDelete(`/rest/v1/daily_intelligence?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${encodeURIComponent(weightsKey)}`);
      await sbPost('/rest/v1/daily_intelligence', diRows, 'return=minimal');
      console.log('[edge-zk6] daily_intelligence: wrote', diRows.length, 'rows (' + hitOrphanRows.length + ' hit-orphans appended)');
    } catch (e) { console.error('[edge-zk6] daily_intelligence write FAILED:', String(e)); }

    // ─── E1+E2+E5: adaptive_tracking K6 primary rows (mirrors engines/zk6.ts) ───
    // Idempotency: skip INSERT if primary rows already exist for this
    // (slate_hash, mode). Same slate_hash → same picks → no new data to
    // record. Prevents duplicate accumulation across regens.
    try {
      const existing = await sbGet<any[]>(
        `/rest/v1/adaptive_tracking?slate_hash=eq.${encodeURIComponent(hash)}&mode=eq.${encodeURIComponent(weightsKey)}&matched_state=is.null&select=id&limit=1`,
      );
      if (Array.isArray(existing) && existing.length > 0) {
        console.log('[edge-zk6] adaptive_tracking: slate_hash already has primary rows, skipping');
      } else {
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
            slate_date: effectiveDate, scope, slate_hash: hash,
            rank: idx + 1, combo: x.combo, combo_set: x.normKey,
            // adaptive_tracking uses signal_burst as the DGC slot (legacy name).
            signal_box: bs, signal_pburst: ps, signal_co: cs, signal_burst: ds,
            energy_score: x.energy, mode: weightsKey,
            box_top_quartile:    bs >= boxQ75,
            pburst_top_quartile: ps >= pburstQ75,
            co_top_quartile:     cs >= coQ75,
            burst_top_quartile:  ds >= dgcQ75,  // DGC quartile
            dominant_signal: dominant,
          };
        });
        await sbPost('/rest/v1/adaptive_tracking', atRows, 'return=minimal');
        console.log('[edge-zk6] adaptive_tracking: wrote', atRows.length, 'K6 primary rows');
      }
    } catch (e) { console.warn('[edge-zk6] adaptive_tracking pre-write failed:', String(e)); }
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
    // Top-level dataStats parity with engines/zk6.ts. Same payload also lives
    // inside horizons_present_json._dataStats for the persisted snapshot row.
    dataStats: {
      boxRowsUsed:    ds.boxRowCount,
      pairRowsUsed:   ds.pairRowCount,
      horizonsLoaded: ds.horizonsLoaded,
      usingFallback:  ds.usingFallback,
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
    return new Response(JSON.stringify(result), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[edge-zk6] error:', msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
