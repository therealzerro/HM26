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

import { Scope, SlateSnapshot, SlateDataStats, EngineMetadata, HorizonLabel } from '@/types/core';
import { getTodayET } from '@/lib/dateUtils';
import { K6_QUOTAS, PAIR_REPETITION_CAP } from '@/constants/zk6';
import { fetchFromSupabase } from '@/lib/supabase';
import {
  H_ALL,
  HORIZON_WEIGHTS,
  MULTIPLICITY_PRIORS,
  WeightSet,
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
} from '@/lib/engineCore';

const ENGINE_VERSION = 'v2.1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeSlateParams {
  scope: Scope;
  jurisdiction: string;
  weightsKey?: 'balanced' | 'conservative' | 'aggressive';
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
  pairData: PairTree;
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

export let lastScopeFallback: string | null = null;


// ─── Data Fetch ───────────────────────────────────────────────────────────────

async function fetchRaw(scopeEnc: string, jurisdictionEnc: string): Promise<{ boxRows: any[]; pairRows: any[] }> {
  // Fetch box data per-horizon in parallel — PostgREST caps single queries at 1000 rows,
  // and allday scope has 10,000 box rows (1000 combos × 10 horizons). Fetching each
  // horizon separately guarantees all 10 horizons are loaded regardless of server limit.
  const boxHorizonFetches = H_ALL.map(h =>
    fetchFromSupabase<any[]>({
      path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${scopeEnc}` +
            `&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=eq.${jurisdictionEnc}` +
            `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
    }).then(rows => Array.isArray(rows) ? rows : []),
  );

  const [boxByHorizonArrays, pairRows] = await Promise.all([
    Promise.all(boxHorizonFetches),
    fetchFromSupabase<any[]>({
      // NO horizon_label filter — fetch ALL horizons, ALL classes (2-11)
      path: `/rest/v1/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=eq.${jurisdictionEnc}` +
            `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=50000`,
    }),
  ]);

  return {
    boxRows: boxByHorizonArrays.flat(),
    pairRows: Array.isArray(pairRows) ? pairRows : [],
  };
}

async function fetchDatasets(scope: Scope, jurisdiction: string): Promise<Datasets> {
  const normalized = normalizeScope(scope);
  const enc = encodeURIComponent(normalized);
  const jEnc = encodeURIComponent(jurisdiction);
  const timeout = new Promise<never>((_, r) =>
    setTimeout(() => r(new Error('ZK6 fetch timeout (20s)')), 20000),
  );

  console.log('[zk30] Fetching all horizons for scope:', normalized, 'jurisdiction:', jurisdiction);

  let { boxRows, pairRows } = await Promise.race([fetchRaw(enc, jEnc), timeout]);
  let usingFallback = false;

  if (boxRows.length < 50 && normalized !== 'allday') {
    console.log('[zk30] Sparse data for', normalized, '(', boxRows.length, 'rows) — falling back to allday');
    lastScopeFallback = normalized;
    usingFallback = true;
    const fb = await Promise.race([fetchRaw(encodeURIComponent('allday'), jEnc), timeout]);
    boxRows = fb.boxRows;
    pairRows = fb.pairRows;
  } else {
    lastScopeFallback = null;
  }

  console.log('[zk30] Raw fetched:', { boxRows: boxRows.length, pairRows: pairRows.length });

  // ── Build boxByHorizon ────────────────────────────────────────────────────────
  const boxByHorizon: BoxByHorizon = new Map();
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

    if (!boxByHorizon.has(h)) boxByHorizon.set(h, new Map());
    boxByHorizon.get(h)!.set(normKey, rawDs);

    // Always take MAX timesDrawn across all rows for this normKey — multiple raw-combo
    // permutations (e.g. "398", "839", "983") all map to the same comboset "{3,8,9}".
    // Only one permutation gets updated with real data; the others remain 0. Using MAX
    // ensures the real value wins regardless of row ordering.
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
      if (row.last_seen && !lastSeenMap.has(normKey)) lastSeenMap.set(normKey, row.last_seen);
    }
  }

  console.log('[ZK6-DIAG] timesDrawnMap.size:',
    timesDrawnMap.size,
    'sample:',
    JSON.stringify(Array.from(timesDrawnMap.entries()).slice(0,3))
  )

  // ── Build pairData ────────────────────────────────────────────────────────────
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

    // Build pairMetaMap — H01Y preferred for draws_since/times_drawn metadata
    if (h === 'H01Y' || !pairMetaMap.get(pairKey)?.has(row.class_id)) {
      if (!pairMetaMap.has(pairKey)) pairMetaMap.set(pairKey, new Map());
      pairMetaMap.get(pairKey)!.set(row.class_id, {
        dsRaw: typeof row.ds_raw === 'number' ? row.ds_raw : 0,
        drawsSince: typeof row.ds_raw === 'number' ? row.ds_raw : 500,
        timesDrawn: typeof row.times_drawn === 'number' ? row.times_drawn : 0,
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

  console.log('[zk30] Datasets loaded:', {
    horizonsLoaded,
    boxTotalRows: boxRows.length,
    pairTotalRows: pairRows.length,
    usingFallback,
    h01YBoxSize: boxByHorizon.get('H01Y')?.size ?? 0,
  });

  return {
    boxByHorizon, pairData, pairMetaMap, drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap,
    horizonsPresent, horizonsLoaded, usingFallback,
    boxRowCount: boxRows.length, pairRowCount: pairRows.length,
    rawBoxRows: boxRows,
  };
}

async function fetchZK30Datasets(scope: Scope, jurisdiction: string): Promise<Datasets> {
  const ds = await fetchDatasets(scope, jurisdiction);

  const sessionClause =
    scope === 'midday'  ? '&session=in.(midday,morning)' :
    scope === 'evening' ? '&session=in.(evening,night)' : '';

  const rows = await fetchFromSupabase<any[]>({
    path: `/rest/v1/histories?jurisdiction=eq.${encodeURIComponent(jurisdiction)}${sessionClause}&select=result_digits,date_et&order=date_et.desc&limit=10000`,
  }).catch(() => [] as any[]);

  const drawsSinceMap = new Map<string, number>();
  const dsRawMap      = new Map<string, number>();
  const timesDrawnMap = new Map<string, number>();
  const lastSeenMap   = new Map<string, string>();

  if (Array.isArray(rows)) {
    const todayDays = Math.floor(Date.now() / 86400000);
    rows.forEach((row) => {
      if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) return;
      const cs = toComboSet(row.result_digits);
      if (!drawsSinceMap.has(cs)) {
        const rowMs = row.date_et ? new Date(String(row.date_et)).getTime() : 0;
        const actualDs = rowMs > 0 ? Math.max(0, todayDays - Math.floor(rowMs / 86400000)) : 999;
        drawsSinceMap.set(cs, actualDs);
        dsRawMap.set(cs, actualDs);
        if (row.date_et) lastSeenMap.set(cs, String(row.date_et));
      }
      timesDrawnMap.set(cs, (timesDrawnMap.get(cs) ?? 0) + 1);
    });
  }

  console.log('[zk30] fetchZK30Datasets:', {
    jurisdiction, scope,
    historyRows: Array.isArray(rows) ? rows.length : 0,
    combosFound: drawsSinceMap.size,
  });

  return { ...ds, drawsSinceMap, dsRawMap, timesDrawnMap, lastSeenMap };
}

// ─── Blending Helpers ─────────────────────────────────────────────────────────

/** Calculate normalized weights for active horizons to ensure sum=1.0 even if some are missing. */
function calculateActiveWeights(horizonsLoaded: string[]): Record<string, number> {
  const sumAvailable = horizonsLoaded.reduce((acc, h) => acc + (HORIZON_WEIGHTS[h as HorizonLabel] ?? 0), 0);

  // Guard: Zero-Weight Hazard — return equal weights if config or data is missing
  if (sumAvailable <= 0) {
    const count = horizonsLoaded.length;
    if (count === 0) return {};
    const equalWeight = 1 / count;
    const weights: Record<string, number> = {};
    for (const h of horizonsLoaded) weights[h] = equalWeight;
    return weights;
  }

  const weights: Record<string, number> = {};
  for (const h of horizonsLoaded) {
    weights[h] = (HORIZON_WEIGHTS[h as HorizonLabel] ?? 0) / sumAvailable;
  }
  return weights;
}

/** Blend a box combo's draws_since across all available horizons. */
function blendBox(normKey: string, boxByHorizon: BoxByHorizon, activeWeights: Record<string, number>): number {
  let total = 0;
  for (const h in activeWeights) {
    const ds = boxByHorizon.get(h)?.get(normKey) ?? 0;
    total += ds * activeWeights[h];
  }
  return total;
}

/** Blend a pair's ds_raw for a given classId across all available horizons. */
function blendPair(pairKey: string, classId: number, pairData: PairTree, activeWeights: Record<string, number>): number {
  const horizonMap = pairData.get(pairKey)?.get(classId);
  if (!horizonMap) return 0;
  let total = 0;
  for (const h in activeWeights) {
    total += (horizonMap.get(h) ?? 0) * activeWeights[h];
  }
  return total;
}

// ─── bestOrderFor ─────────────────────────────────────────────────────────────

/** Returns the 6-perm arrangement that maximises sum of position-specific pair scores. */
function bestOrderFor(combo: string, pairData: PairTree, activeWeights: Record<string, number>): string {
  const [a, b, c] = combo;
  const perms = [
    a+b+c, a+c+b,
    b+a+c, b+c+a,
    c+a+b, c+b+a,
  ];
  let best = combo;
  let bestScore = -1;
  for (const perm of perms) {
    const ab = sortedPair(perm[0], perm[1]);
    const bc = sortedPair(perm[1], perm[2]);
    const ac = sortedPair(perm[0], perm[2]);
    const score =
      blendPair(ab, 2, pairData, activeWeights) +   // front pair straight (class 2)
      blendPair(bc, 3, pairData, activeWeights) +   // back pair straight  (class 3)
      blendPair(ac, 4, pairData, activeWeights);    // split pair straight (class 4)
    if (score > bestScore) { bestScore = score; best = perm; }
  }
  return best;
}


// ─── History overrides ────────────────────────────────────────────────────────
// datasets_box.draws_since / last_seen are only updated on file imports, not from
// live results. Query histories to get the actual last-hit date and draws count
// so that a combo that just drew (like 2 days ago) isn't ranked as overdue.

async function fetchHistoryOverrides(scope: Scope, jurisdiction: string): Promise<{
  dsOverride: Map<string, number>;
  lsOverride: Map<string, string>;
  hitDatesMap: Map<string, number[]>;
}> {
  try {
    const sessionClause =
      scope === 'midday'  ? '&session=in.(midday,morning)' :
      scope === 'evening' ? '&session=in.(evening,night)' : '';
    const rows = await fetchFromSupabase<any[]>({
      path: `/rest/v1/histories?select=result_digits,date_et${sessionClause}&jurisdiction=eq.${encodeURIComponent(jurisdiction)}&order=date_et.desc&limit=3650`,
    });
    if (!Array.isArray(rows) || rows.length === 0) return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };
    const dsOverride = new Map<string, number>();
    const lsOverride = new Map<string, string>();
    const hitDatesMap = new Map<string, number[]>();
    rows.forEach((row, idx) => {
      if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) return;
      const cs = toComboSet(row.result_digits);
      if (!dsOverride.has(cs)) {
        dsOverride.set(cs, idx);
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

type WeightPresets = { balanced: WeightSet; conservative: WeightSet; aggressive: WeightSet };

interface RailConfig {
  singlesMax: number;
  doublesMax: number;
  triplesOn: boolean;
  pairRepCap: number;
}

const DEFAULT_WEIGHTS: WeightPresets = {
  balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
  conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
  aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
};

const DEFAULT_RAILS: RailConfig = {
  singlesMax: 25,
  doublesMax: 5,
  triplesOn:  K6_QUOTAS.triples > 0,
  pairRepCap: 8,
};

interface EngineConfig {
  presets: WeightPresets;
  rails: RailConfig;
  pressureThreshold: number;
  minEnergyThreshold: number;
  recentHitCooldown: number;
}

const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  presets: DEFAULT_WEIGHTS,
  rails: DEFAULT_RAILS,
  pressureThreshold: 250,
  minEnergyThreshold: 0,
  recentHitCooldown: 20,
};

async function loadEngineConfig(): Promise<EngineConfig> {
  try {
    const rows = await fetchFromSupabase<any[]>({
      path: '/rest/v1/app_config' +
        '?key=in.(engine_weights_balanced,engine_weights_conservative,engine_weights_aggressive,k6_triples_on,pressure_threshold,min_energy_threshold,recent_hit_cooldown)' +
        '&select=key,value',
    });
    if (!Array.isArray(rows) || rows.length === 0) return DEFAULT_ENGINE_CONFIG;

    const presets: WeightPresets = {
      balanced:     { ...DEFAULT_WEIGHTS.balanced },
      conservative: { ...DEFAULT_WEIGHTS.conservative },
      aggressive:   { ...DEFAULT_WEIGHTS.aggressive },
    };
    const rails: RailConfig = { ...DEFAULT_RAILS };
    let pressureThreshold = 250;
    let minEnergyThreshold = 0;
    let recentHitCooldown = 20;

    for (const row of rows) {
      try {
        if (row.key === 'k6_triples_on')        { rails.triplesOn = row.value === 'true'; continue; }
        if (row.key === 'pressure_threshold')   { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 50) pressureThreshold = v; continue; }
        if (row.key === 'min_energy_threshold') { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) minEnergyThreshold = v; continue; }
        if (row.key === 'recent_hit_cooldown')  { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) recentHitCooldown = v; continue; }

        const parsed = JSON.parse(row.value);
        const pct2dec = (v: number) => v > 1 ? v / 100 : v;
        const ws: WeightSet = {
          BOX:    pct2dec(parsed.BOX    ?? parsed.box    ?? 0),
          PBURST: pct2dec(parsed.PBURST ?? parsed.pburst ?? 0),
          CO:     pct2dec(parsed.CO     ?? parsed.co     ?? 0),
          DGC:    pct2dec(parsed.DGC    ?? parsed.dgc    ?? DEFAULT_WEIGHTS.balanced.DGC),
        };
        if (ws.BOX + ws.PBURST + ws.CO > 0.05) {
          if (row.key === 'engine_weights_balanced')     presets.balanced     = ws;
          if (row.key === 'engine_weights_conservative') presets.conservative = ws;
          if (row.key === 'engine_weights_aggressive')   presets.aggressive   = ws;
        }
      } catch {}
    }
    return { presets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown };
  } catch {
    return DEFAULT_ENGINE_CONFIG;
  }
}

// ─── saveSlateSnapshot ────────────────────────────────────────────────────────

async function saveSlateSnapshot(snapshot: SlateSnapshot, extraFields?: Record<string, unknown>): Promise<string> {
  console.log('[zk30] Saving snapshot:', {
    id: snapshot.id, scope: snapshot.scope,
    hash: snapshot.hash?.slice(0, 8),
    topK: Array.isArray(snapshot.top_k_straights_json)
      ? snapshot.top_k_straights_json.length : 0,
  });

  const payload: Record<string, unknown> = {
    scope: snapshot.scope,
    horizons_present_json: snapshot.horizons_present_json,
    weights_json: snapshot.weights_json,
    top_k_straights_json: snapshot.top_k_straights_json,
    top_k_boxes_json: snapshot.top_k_boxes_json,
    components_json: snapshot.components_json,
    updated_at_et: snapshot.updated_at_et,
    slate_date: snapshot.slate_date ?? null,
    snapshot_hash: snapshot.hash ?? null,
    hash: snapshot.hash ?? null,
    mode: snapshot.mode ?? null,
    admin_published: true,
    ...(extraFields ?? {}),
  };

  const saveToAuditFallback = async (reason: string) => {
    try {
      await fetchFromSupabase({
        path: '/rest/v1/audit_logs',
        method: 'POST',
        body: {
          actor_id: 'system',
          action: 'slate_snapshot_fallback',
          target: snapshot.scope,
          payload_meta: { reason, snapshot: payload },
        },
      });
      console.log('[zk30] Snapshot stored in audit_logs (RLS fallback).');
    } catch (e) {
      console.log('[zk30] audit_logs fallback also failed:', String(e));
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
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const tomorrowStart = new Date(todayStart);
      tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
      await fetchFromSupabase<any>({
        path: `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(snapshot.scope)}&updated_at_et=gte.${todayStart.toISOString()}&updated_at_et=lt.${tomorrowStart.toISOString()}&deleted_at=is.null&mode=eq.zk30`,
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { deleted_at: new Date().toISOString() },
      });
    } catch (patchErr) {
      console.warn('[zk30] soft-delete prior snapshots warn:', String(patchErr));
      // Non-fatal — proceed with insert
    }
  }

  try {
    const res = await fetchFromSupabase<any>({
      path: '/rest/v1/slate_snapshots',
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    console.log('[zk30] POST slate_snapshots raw response:', JSON.stringify(res));
    const dbId = Array.isArray(res) && res.length > 0
      ? (res[0]?.id as string | undefined) : undefined;
    console.log('[zk30] Snapshot saved:', { scope: snapshot.scope, dbId });
    return dbId ?? snapshot.id;
  } catch (err) {
    const msg = String(err instanceof Error ? err.message : err);
    const isRls = /42501|row-level security|RLS|violates row-level security/i.test(msg);
    console.log('[zk30] Save error:', { msg: msg.slice(0, 200), isRls });
    if (isRls) { await saveToAuditFallback(msg); return snapshot.id; }
    throw err instanceof Error ? err : new Error('Failed to save slate snapshot');
  }
}

// ─── computeZK30Slate ─────────────────────────────────────────────────────────

export async function computeZK30Slate({
  scope: rawScope,
  jurisdiction,
  weightsKey = 'balanced',
  targetDate,
  excludedCombos = new Set<string>(),
  skipHistoriesExclusion = false,
  excludeComboSets = [],
  is_supplement = false,
}: ComputeSlateParams): Promise<SlateSnapshot> {
  const scope: Scope = normalizeScope(rawScope);
  const now = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;

  const { presets: weightPresets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown } = await loadEngineConfig();
  const weights = weightPresets[weightsKey] ?? weightPresets.balanced;
  const universe = buildUniverse();

  console.log('[zk30] computeSlate:', { scope, weightsKey, jurisdiction });
  console.log('[zk30] using weights: BOX=' + weights.BOX + ' PBURST=' + weights.PBURST + ' CO=' + weights.CO);
  console.log('[zk30] K6 rails: singles≤' + rails.singlesMax + ' doubles≤' + rails.doublesMax + ' triples=' + rails.triplesOn + ' pairRepCap=' + rails.pairRepCap);
  console.log('[zk30] intelligence config: pressureThreshold=' + pressureThreshold + ' minEnergyThreshold=' + minEnergyThreshold + ' recentHitCooldown=' + recentHitCooldown);

  // ── 1. Fetch all horizons + live history overrides ───────────────────────────
  const [ds, { dsOverride, lsOverride, hitDatesMap }] = await Promise.all([
    fetchZK30Datasets(scope, jurisdiction),
    fetchHistoryOverrides(scope, jurisdiction),
  ]);

  // Calculate normalized weights for active horizons to ensure sum=1.0 even if some are missing.
  const activeWeights = calculateActiveWeights(ds.horizonsLoaded);

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
  console.log('[zk30] History overrides applied — corrected draws_since for', dsOverride.size, 'combos');

  const dgcMap = new Map<string, number>();
  for (const [cs, dates] of hitDatesMap) {
    dgcMap.set(cs, computeDGC(dates));
  }

  if (ds.horizonsLoaded.length === 0) {
    const label = scope === 'allday' ? 'All-Day'
      : scope.charAt(0).toUpperCase() + scope.slice(1);
    throw new Error(`No BOX data available for scope: ${label}`);
  }

  // ── 2. Today's draws — ALWAYS excluded, unconditionally ──────────────────────
  // This runs regardless of skipHistoriesExclusion or any caller-supplied sets.
  // ComboSets are computed here from result_digits (not the DB column) so the
  // exclusion is correct even when comboset_sorted is null in older rows.
  const todayHitComboSets = new Set<string>();
  const effectiveExcluded = new Set<string>(excludedCombos);

  try {
    const todayEt = getTodayET();
    const todayWinners = await fetchFromSupabase<any[]>({
      path: `/rest/v1/histories?date_et=eq.${todayEt}&select=result_digits&limit=500`,
    });
    if (Array.isArray(todayWinners)) {
      todayWinners.forEach(w => {
        if (typeof w?.result_digits === 'string' && /^\d{3}$/.test(w.result_digits)) {
          todayHitComboSets.add(toComboSet(w.result_digits));
          effectiveExcluded.add(w.result_digits);
        }
      });
    }
    console.log('[zk30] Today hit exclusion:', {
      todayEt, scope,
      hitSets: Array.from(todayHitComboSets),
      totalStraights: effectiveExcluded.size,
    });
  } catch (e) {
    console.log('[zk30] Today hit fetch warn (non-fatal):', e);
  }

  // ── 3. First pass — raw signal scores for all 1000 combos ────────────────────
  // Pre-pass: find maxTimesDrawn so frequency can be normalised 0-1
  let maxTimesDrawn = 0;
  console.log('[ZK6-DIAG] timesDrawnMap size:', ds.timesDrawnMap.size, 'maxTimesDrawn will be:', Array.from(ds.timesDrawnMap.values()).reduce((a,b) => Math.max(a,b), 0))
  for (let i = 0; i < 1000; i++) {
    const td = ds.timesDrawnMap.get(toComboSet(universe[i])) ?? 0;
    if (td > maxTimesDrawn) maxTimesDrawn = td;
  }
  console.log('[ZK6-DIAG2] maxTimesDrawn after prepass:', maxTimesDrawn, '| sample key check:', toComboSet('742'), '=', ds.timesDrawnMap.get(toComboSet('742')) ?? 'MISS');

  // Pre-pass: find maxTimesDrawn across all pair rows for frequency normalization.
  // Bug fix: previously used dsRaw (staleness) as freqScore — inversely correlated with hits.
  let maxPairTimesDrawn = 0;
  for (const classMap of ds.pairMetaMap.values()) {
    for (const meta of classMap.values()) {
      if (meta.timesDrawn > maxPairTimesDrawn) maxPairTimesDrawn = meta.timesDrawn;
    }
  }

  const getPairSignal = (pairKey: string, classId: number): number => {
    const meta = ds.pairMetaMap.get(pairKey)?.get(classId);
    if (!meta) return 0;
    const drawsSince = meta.drawsSince || 500;
    const timesDrawn = meta.timesDrawn || 0;
    const freqScore = maxPairTimesDrawn > 0 ? timesDrawn / maxPairTimesDrawn : 0;
    const pressureScore = (timesDrawn > 0 && drawsSince < 500)
      ? Math.min(drawsSince / 182, 1.0)
      : 0;
    return (freqScore * 0.70) + (pressureScore * 0.30);
  };

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

    // BOX signal = 60% historical frequency + 40% recency pressure.
    // freqScore    : timesDrawn / maxTimesDrawn — proves the pattern exists.
    // pressureScore: peaked curve, optimal at 100-pressureThreshold draws.
    //   0-100 draws                → ramps 0→0.5  (recently hit, building again)
    //   100-pressureThreshold draws → ramps 0→1.0  (ideal pressure window)
    //   pressureThreshold+ draws   → decays 1.0→0.3 floor (getting stale but still valid)
    const timesDrawnVal = ds.timesDrawnMap.get(normKey) ?? 0;
    if (timesDrawnVal > 0) {
      const freqScore  = maxTimesDrawn > 0 ? timesDrawnVal / maxTimesDrawn : 0;
      // Use blended draws_since for more robust pressure signal across horizons
      const dsVal      = blendBox(normKey, ds.boxByHorizon, activeWeights);
      const ptSpan     = Math.max(pressureThreshold - 100, 1);
      const pressureScore =
        dsVal >= 100 && dsVal <= pressureThreshold
          ? Math.min((dsVal - 100) / ptSpan, 1.0)
          : dsVal > pressureThreshold
          ? Math.max(1.0 - (dsVal - pressureThreshold) / 200, 0.3)
          : (dsVal / 100) * 0.5;
      rawFreq[i]     = freqScore;
      rawPressure[i] = pressureScore;
      rawBox[i]      = (freqScore * 0.60) + (pressureScore * 0.40);
    } else {
      rawFreq[i] = rawPressure[i] = rawBox[i] = 0;
    }


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
  }

  // ── 6. Two-pass K30 selection ─────────────────────────────────────────────────
  // Pass 1: real data combos (timesDrawn > 0), full diversity rails, sorted by score.
  // Pass 2: fill any remaining slots with placeholder combos sorted by PBURST only.

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
    normPburst[b] !== normPburst[a]
      ? normPburst[b] - normPburst[a]
      : universe[a].localeCompare(universe[b]),
  );

  const scorePoolForEnergy = Array.from(finalScores).sort((a, b) => a - b);

  // Top-30 pre-diversity-rail list for daily_intelligence (before K30 rails are applied)
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
  }).sort((a, b) => b.finalScore - a.finalScore).slice(0, 30);

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
  console.log('[zk30] Key diagnostics (top 5 real):', JSON.stringify(keyDiag));
  console.log('[zk30] Pool sizes — real:', realIdx.length, 'placeholder:', placeholderIdx.length);

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

  const tryAdd = (
    idx: number,
    relaxExcludeComboSets = false,
    relaxPairRepCap = false,
    relaxCooldown = false,
  ): boolean => {
    if (k6.length >= 30) return false;
    const combo = universe[idx];
    if (effectiveExcluded.has(combo)) {
      console.log('[RAIL] excluded:', combo); return false; }
    const normKey = toComboSet(combo);
    if (selectedComboSets.has(normKey)) {
      console.log('[RAIL] duplicate comboSet:', combo, normKey); return false; }
    if (!relaxExcludeComboSets && excludeComboSetsSet.size > 0 && excludeComboSetsSet.has(normKey)) {
      console.log('[RAIL] excludeComboSets:', combo); return false; }
    if (todayHitComboSets.size > 0 && todayHitComboSets.has(normKey)) {
      console.log('[RAIL] today hit:', combo); return false; }
    const mult = multiplicityOf(combo);
    if (mult === 'singles' && singles >= rails.singlesMax) {
      console.log('[RAIL] singles cap:', combo, singles, '>=', rails.singlesMax); return false; }
    if (mult === 'doubles' && doubles >= rails.doublesMax) {
      console.log('[RAIL] doubles cap:', combo); return false; }
    if (mult === 'triples' && !rails.triplesOn) {
      console.log('[RAIL] triples off:', combo); return false; }
    const tp = topPairOf(combo);
    if (!relaxPairRepCap && (pairCounts[tp] ?? 0) >= rails.pairRepCap) {
      console.log('[RAIL] pairRepCap:', combo, 'pair:', tp); return false; }
    const energy = percentileRankOf(finalScores[idx], scorePoolForEnergy);
    if (minEnergyThreshold > 0 &&
      (ds.timesDrawnMap.get(toComboSet(combo)) ?? 0) > 0 &&
      energy < minEnergyThreshold) {
      console.log('[RAIL] energy below threshold:', combo, energy, '<', minEnergyThreshold); return false; }
    const recentDs = ds.drawsSinceMap.get(normKey) ?? 999;
    if (!relaxCooldown && recentHitCooldown > 0 && dsOverride.has(normKey) && (ds.timesDrawnMap.get(normKey) ?? 0) > 0 && recentDs < recentHitCooldown) {
      console.log('[RAIL] cooldown:', combo, 'ds:', recentDs, '<', recentHitCooldown); return false; }
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
    if (k6.length >= 30) break;
    tryAdd(idx);
  }

  // Pass 2: fill remaining slots with placeholder combos
  if (k6.length < 30) {
    console.log('[zk30] Pass 1 yielded', k6.length, 'real picks — filling', 30 - k6.length, 'from placeholders');
    for (const idx of placeholderIdx) {
      if (k6.length >= 30) break;
      tryAdd(idx);
    }
  }

  // Pass 3: relax excludeComboSets (yesterday's draws)
  if (k6.length < 30) {
    console.log('[zk30] Pass 2 yielded', k6.length, 'picks — pass 3: relaxing excludeComboSets');
    for (const idx of allIdx) {
      if (k6.length >= 30) break;
      tryAdd(idx, true);
    }
  }

  // Pass 4: also relax pairRepCap
  if (k6.length < 30) {
    console.log('[zk30] Pass 3 yielded', k6.length, 'picks — pass 4: relaxing pairRepCap');
    for (const idx of allIdx) {
      if (k6.length >= 30) break;
      tryAdd(idx, true, true);
    }
  }

  // Pass 5: last resort — also relax cooldown
  if (k6.length < 30) {
    console.log('[zk30] Pass 4 yielded', k6.length, 'picks — pass 5: relaxing cooldown');
    for (const idx of allIdx) {
      if (k6.length >= 30) break;
      tryAdd(idx, true, true, true);
    }
  }

  console.log('[zk30] K30 after rails:', k6.map(x => `${x.combo}(e=${x.energy})`));

  // Data quality verification log — ZK30 multi-signal component scores
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
  console.log('[zk30] Top-3 data quality check:', JSON.stringify(top3, null, 2));
  if (top3.some(x => !x.isReal)) {
    console.warn('[zk30] WARNING: placeholder in top 3 — only', realIdx.length, 'real-data combos available');
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
      bestOrder: bestOrderFor(x.combo, ds.pairData, activeWeights),
      confidence: Math.round(scopeConfidence * 100),
      drawsSince: ds.dsRawMap.get(x.normKey) ?? boxRow?.ds_raw ?? null,
      timesDrawn: boxRow?.times_drawn ?? ds.timesDrawnMap.get(x.normKey) ?? 0,
      dsRaw: boxRow?.ds_raw ?? ds.dsRawMap.get(x.normKey) ?? 0,
      lastSeen: ds.lastSeenMap.get(x.normKey) ?? boxRow?.last_seen ?? null,
    };
  });

  const hash = computeSlateHash(scope, 'zk30', k6.map(x => x.combo), ds.horizonsPresent);

  const dataStats: SlateDataStats = {
    boxRowsUsed: ds.boxRowCount,
    pairRowsUsed: ds.pairRowCount,
    horizonsLoaded: ds.horizonsLoaded,
    usingFallback: ds.usingFallback,
  };

  const horizonsMeta: EngineMetadata = {
    ...ds.horizonsPresent,
    _engineVersion: ENGINE_VERSION,
    _mode: 'zk30',
    _confidence: Math.round(scopeConfidence * 100),
    _dataStats: dataStats,
    _source: 'live',
    ...(is_supplement ? { _is_supplement: true } : {}),
  };

  const snapshot: SlateSnapshot = {
    id: `zk6-${scope}-${Date.now()}`,
    scope,
    horizons_present_json: horizonsMeta,
    weights_json: { ...weights, _mode: 'zk30' },
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
    mode: 'zk30',
    engineVersion: ENGINE_VERSION,
    source: 'live',
    confidence: Math.round(scopeConfidence * 100),
    dataStats,
  };

  console.log('[zk30] Slate computed:', {
    scope, weightsKey, jurisdiction,
    k6Count: k6.length,
    horizonsLoaded: ds.horizonsLoaded,
    usingFallback: ds.usingFallback,
    confidence: snapshot.confidence,
    hash: hash.slice(0, 8),
    topPicks: k6.slice(0, 30).map(x =>
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
  const savedId = await saveSlateSnapshot(snapshot, { jurisdiction, ...(supplementExtra ?? {}) });
  if (typeof savedId === 'string' && savedId.length > 0) {
    snapshot.id = savedId;
  }

  // Write top 30 pre-rail picks to daily_intelligence
  try {
    const diRows = top30PreRail.map((pick, idx) => ({
      slate_date: effectiveDate,
      scope,
      mode: 'zk30',
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
      draws_since: pick.drawsSince,
      times_drawn: pick.timesDrawn,
      best_order: bestOrderFor(pick.combo, ds.pairData, activeWeights),
      hit_box: false,
      hit_straight: false,
    }));
    // Delete existing rows for this date/scope/mode first to avoid unique
    // constraint 409s — upsert via on_conflict requires knowing the exact
    // constraint columns which may vary across DB migrations.
    await fetchFromSupabase({
      path: `/rest/v1/daily_intelligence?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.zk30&hit_box=eq.false&hit_straight=eq.false`,
      method: 'DELETE',
      headers: { 'Prefer': 'return=minimal' },
    }).catch(() => {/* non-fatal: no rows yet */});
    await fetchFromSupabase({
      path: '/rest/v1/daily_intelligence',
      method: 'POST',
      headers: { 'Prefer': 'return=minimal' },
      body: diRows,
    });
    console.log('[zk30] daily_intelligence: wrote top 30 for scope:', scope, 'date:', effectiveDate);
    const slateCombos = k6.map(x => x.combo).join(',');
    await fetchFromSupabase({
      path: `/rest/v1/daily_intelligence?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.zk30&combo=in.(${slateCombos})`,
      method: 'PATCH',
      headers: { 'Prefer': 'return=minimal' },
      body: { on_slate: true },
    });
  } catch (e) {
    console.log('[zk30] daily_intelligence write warn (non-fatal):', e);
  }

  return snapshot;
}
