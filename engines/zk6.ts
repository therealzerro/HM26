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
import { getTodayET, getYesterdayET } from '@/lib/dateUtils';
import { K6_QUOTAS, PAIR_REPETITION_CAP } from '@/constants/zk6';
import { fetchFromSupabase } from '@/lib/supabase';
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
} from '@/lib/engineCore';

const ENGINE_VERSION = 'v2.1';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ComputeSlateParams {
  scope: Scope;
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

async function fetchRaw(scopeEnc: string): Promise<{ boxRows: any[]; pairRows: any[] }> {
  // Fetch box data per-horizon in parallel — PostgREST caps single queries at 1000 rows,
  // and allday scope has 10,000 box rows (1000 combos × 10 horizons). Fetching each
  // horizon separately guarantees all 10 horizons are loaded regardless of server limit.
  const boxHorizonFetches = H_ALL.map(h =>
    fetchFromSupabase<any[]>({
      path: `/rest/v1/datasets_box?class_id=eq.1&scope=eq.${scopeEnc}` +
            `&horizon_label=eq.${h}&deleted_at=is.null&jurisdiction=is.null` +
            `&select=key,ds_raw,times_drawn,last_seen,horizon_label&limit=1100`,
    }).then(rows => Array.isArray(rows) ? rows : []),
  );

  const [boxByHorizonArrays, pairRows] = await Promise.all([
    Promise.all(boxHorizonFetches),
    fetchFromSupabase<any[]>({
      // NO horizon_label filter — fetch ALL horizons, ALL classes (2-11)
      path: `/rest/v1/datasets_pair?scope=eq.${scopeEnc}&deleted_at=is.null&jurisdiction=is.null` +
            `&select=key,key_pair,class_id,ds_raw,times_drawn,horizon_label&limit=50000`,
    }),
  ]);

  return {
    boxRows: boxByHorizonArrays.flat(),
    pairRows: Array.isArray(pairRows) ? pairRows : [],
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

  console.log('[zk6v2] Datasets loaded:', {
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

// ─── Blending Helpers ─────────────────────────────────────────────────────────

/** Blend a box combo's draws_since across all available horizons. */
// ENH-HW (2026-05-13): now load-bearing — used in computeSlate's BOX scoring
// loop in place of the H01Y-only dsRawMap lookup. Accepts a runtime weights
// arg (from app_config.horizon_weights, falls back to HORIZON_WEIGHTS const).
// Weights are decimals summing to ~1.0; output is a weighted sum of per-
// horizon raw draws-since values.
function blendBoxDsRaw(normKey: string, boxByHorizon: BoxByHorizon, weights: Record<string, number>): number {
  let total = 0;
  for (const h of H_ALL) {
    const ds = boxByHorizon.get(h)?.get(normKey) ?? 0;
    total += ds * (weights[h] ?? 0);
  }
  return total;
}

/** Blend a pair's ds_raw for a given classId across all available horizons. */
function blendPair(pairKey: string, classId: number, pairData: PairTree): number {
  const horizonMap = pairData.get(pairKey)?.get(classId);
  if (!horizonMap) return 0;
  let total = 0;
  for (const h of H_ALL) {
    total += (horizonMap.get(h) ?? 0) * (HORIZON_WEIGHTS[h] ?? 0);
  }
  return total;
}

// ─── bestOrderFor ─────────────────────────────────────────────────────────────

/** Returns the 6-perm arrangement that maximises sum of position-specific pair scores. */
function bestOrderFor(combo: string, pairData: PairTree): string {
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
      blendPair(ab, 2, pairData) +   // front pair straight (class 2)
      blendPair(bc, 3, pairData) +   // back pair straight  (class 3)
      blendPair(ac, 4, pairData);    // split pair straight (class 4)
    if (score > bestScore) { bestScore = score; best = perm; }
  }
  return best;
}


// ─── History overrides ────────────────────────────────────────────────────────
// datasets_box.draws_since / last_seen are only updated on file imports, not from
// live results. Query histories to get the actual last-hit date and draws count
// so that a combo that just drew (like 2 days ago) isn't ranked as overdue.

async function fetchHistoryOverrides(scope: Scope): Promise<{
  dsOverride: Map<string, number>;
  lsOverride: Map<string, string>;
  hitDatesMap: Map<string, number[]>;
}> {
  try {
    const sessionClause = scope === 'allday' ? '' : `&session=eq.${encodeURIComponent(scope)}`;
    const rows = await fetchFromSupabase<any[]>({
      path: `/rest/v1/histories?select=result_digits,date_et${sessionClause}&order=date_et.desc&limit=3650`,
    });
    if (!Array.isArray(rows) || rows.length === 0) return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };
    const dsOverride = new Map<string, number>();
    const lsOverride = new Map<string, string>();
    const hitDatesMap = new Map<string, number[]>();
    const todayDays = Math.floor(Date.now() / 86400000);
    rows.forEach((row) => {
      if (typeof row?.result_digits !== 'string' || !/^\d{3}$/.test(row.result_digits)) return;
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
    });
    return { dsOverride, lsOverride, hitDatesMap };
  } catch {
    return { dsOverride: new Map(), lsOverride: new Map(), hitDatesMap: new Map() };
  }
}


// ─── Dynamic config loading from app_config ───────────────────────────────────

type WeightSet = { BOX: number; PBURST: number; CO: number; DGC: number };
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
};

async function loadEngineConfig(scope?: Scope): Promise<EngineConfig> {
  try {
    // Per-scope cooldown override (2026-05-13 CONFIG-05). When `scope` is passed,
    // also pull `recent_hit_cooldown_${scope}` and overlay it on the global. Only
    // recent_hit_cooldown is currently scope-overridable; other knobs stay global
    // until empirically justified.
    const scopeOverrideKey = scope ? `recent_hit_cooldown_${scope}` : null;
    const keyList = [
      'engine_weights_balanced', 'engine_weights_conservative', 'engine_weights_aggressive',
      'k6_singles_max', 'k6_doubles_max', 'k6_triples_on', 'pair_rep_cap',
      'pressure_threshold', 'min_energy_threshold', 'recent_hit_cooldown',
      'synergy_boost_on', 'synergy_boost_weight',
      'horizon_weights',
      ...(scopeOverrideKey ? [scopeOverrideKey] : []),
    ];
    const rows = await fetchFromSupabase<any[]>({
      path: '/rest/v1/app_config?key=in.(' + keyList.join(',') + ')&select=key,value',
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
    let scopeCooldownOverride: number | null = null;
    let synergyOn = false;
    let synergyWeight = 0.15;
    let horizonWeights: Record<string, number> = { ...HORIZON_WEIGHTS };

    for (const row of rows) {
      try {
        if (row.key === 'k6_singles_max')       { const v = parseInt(row.value, 10); if (!isNaN(v)) rails.singlesMax = v; continue; }
        if (row.key === 'k6_doubles_max')       { const v = parseInt(row.value, 10); if (!isNaN(v)) rails.doublesMax = v; continue; }
        if (row.key === 'k6_triples_on')        { rails.triplesOn = row.value === 'true'; continue; }
        if (row.key === 'pair_rep_cap')         { const v = parseInt(row.value, 10); if (!isNaN(v)) rails.pairRepCap = v; continue; }
        if (row.key === 'pressure_threshold')   { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 50) pressureThreshold = v; continue; }
        if (row.key === 'min_energy_threshold') { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) minEnergyThreshold = v; continue; }
        if (row.key === 'recent_hit_cooldown')  { const v = parseInt(row.value, 10); if (!isNaN(v) && v >= 0) recentHitCooldown = v; continue; }
        if (scopeOverrideKey && row.key === scopeOverrideKey) {
          const v = parseInt(row.value, 10);
          if (!isNaN(v) && v >= 0) scopeCooldownOverride = v;
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
          if (row.key === 'engine_weights_balanced')     presets.balanced     = ws;
          if (row.key === 'engine_weights_conservative') presets.conservative = ws;
          if (row.key === 'engine_weights_aggressive')   presets.aggressive   = ws;
        }
      } catch {}
    }
    // Scope override wins over global when present. Logged at the call site
    // so production diffs are visible in the console.
    const effectiveCooldown = scopeCooldownOverride ?? recentHitCooldown;
    if (scopeCooldownOverride !== null && scope) {
      console.log(`[zk6v2] cooldown override: scope=${scope} ${recentHitCooldown} → ${effectiveCooldown}`);
    }
    return { presets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown: effectiveCooldown, synergyOn, synergyWeight, horizonWeights };
  } catch {
    return DEFAULT_ENGINE_CONFIG;
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
      await fetchFromSupabase<any>({
        path: `/rest/v1/slate_snapshots?scope=eq.${encodeURIComponent(snapshot.scope)}&slate_date=eq.${effectiveSd}&deleted_at=is.null`,
        method: 'PATCH',
        headers: { 'Prefer': 'return=minimal' },
        body: { deleted_at: new Date().toISOString() },
      });
    } catch (patchErr) {
      console.warn('[zk6v2] soft-delete prior snapshots warn:', String(patchErr));
    }
  }

  try {
    const res = await fetchFromSupabase<any>({
      path: '/rest/v1/slate_snapshots',
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
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
    const result = await fetchFromSupabase<SlateSnapshot>({
      path: '/functions/v1/compute-slate-zk6',
      method: 'POST',
      body: { scope: rawScope, weightsKey, targetDate, excludeComboSets, is_supplement },
      timeoutMs: 60000,
    });
    return result;
  }

  const scope: Scope = normalizeScope(rawScope);
  const now = new Date().toISOString();
  const todayEt = getTodayET();
  const effectiveDate = targetDate || todayEt;

  const { presets: weightPresets, rails, pressureThreshold, minEnergyThreshold, recentHitCooldown, synergyOn, synergyWeight, horizonWeights } = await loadEngineConfig(scope);
  const weights = weightPresets[weightsKey] ?? weightPresets.balanced;
  const universe = buildUniverse();

  console.log('[zk6v2] computeSlate:', { scope, weightsKey });
  console.log('[zk6v2] using weights: BOX=' + weights.BOX + ' PBURST=' + weights.PBURST + ' CO=' + weights.CO);
  console.log('[zk6v2] K6 rails: singles≤' + rails.singlesMax + ' doubles≤' + rails.doublesMax + ' triples=' + rails.triplesOn + ' pairRepCap=' + rails.pairRepCap);
  console.log('[zk6v2] intelligence config: pressureThreshold=' + pressureThreshold + ' minEnergyThreshold=' + minEnergyThreshold + ' recentHitCooldown=' + recentHitCooldown);

  // ── 1. Fetch all horizons + live history overrides ───────────────────────────
  const [ds, { dsOverride, lsOverride, hitDatesMap }] = await Promise.all([
    fetchDatasets(scope),
    fetchHistoryOverrides(scope),
  ]);

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
  const todayHitComboSets = new Set<string>();
  const effectiveExcluded = new Set<string>(excludedCombos);

  const yesterdayEt = getYesterdayET();

  // Source A: histories table (raw draw results from imports)
  try {
    const recentWinners = await fetchFromSupabase<any[]>({
      path: `/rest/v1/histories?date_et=gte.${yesterdayEt}&date_et=lte.${todayEt}&select=result_digits&limit=1000`,
    });
    if (Array.isArray(recentWinners)) {
      recentWinners.forEach(w => {
        if (typeof w?.result_digits === 'string' && /^\d{3}$/.test(w.result_digits)) {
          todayHitComboSets.add(toComboSet(w.result_digits));
          effectiveExcluded.add(w.result_digits);
        }
      });
    }
  } catch (e) {
    console.log('[zk6v2] histories exclusion fetch warn (non-fatal):', e);
  }

  // Source B: daily_intelligence hit flags (set by hit detection, works even when
  // histories hasn't been imported yet for the most recent draw date)
  try {
    const diHits = await fetchFromSupabase<any[]>({
      path: `/rest/v1/daily_intelligence?slate_date=gte.${yesterdayEt}&or=(hit_box.eq.true,hit_straight.eq.true)&select=combo_set,hit_result&limit=500`,
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

  console.log('[zk6v2] Recent hit exclusion (today + yesterday, both sources):', {
    todayEt, yesterdayEt, scope,
    hardBlockSets: todayHitComboSets.size,
    totalStraights: effectiveExcluded.size,
  });

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
  // Bug fix: previously used dsRaw (draws-since = staleness) as "freqScore", which
  // made PBURST/CO reward the most stale pairs (inversely correlated with hits).
  // Now uses timesDrawn (historical count) to match the BOX signal's frequency logic.
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
    // freqScore: how frequently this pair has appeared historically (0→1, higher = more frequent)
    const freqScore = maxPairTimesDrawn > 0 ? timesDrawn / maxPairTimesDrawn : 0;
    // pressureScore: how overdue this pair is (peaks at 182 draws since last seen)
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
      // ENH-HW: dsVal is now a horizon-weighted blend across H01Y..H10Y.
      // With weights={H01Y:1.0, rest:0}, behavior is identical to the prior
      // H01Y-only lookup. Production app_config defaults to {H01Y:35%, H02Y:22%, …}
      // which gives a weighted-average across horizons — a different signal
      // than pure H01Y dsRaw. Backtest gates the production weights change.
      const dsVal      = blendBoxDsRaw(normKey, ds.boxByHorizon, horizonWeights);
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
    if (synergyOn && [normBox[i], normPburst[i], normCo[i], normDgc[i]].filter(v => v >= 0.65).length >= 2) {
      finalScores[i] *= (1 + synergyWeight);
    }
  }

  // ── 6. Two-pass K6 selection ──────────────────────────────────────────────────
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
  // Hard blocks never relaxed: selectedComboSets (no dupe picks) + todayHitComboSets (today + yesterday winners)
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
    if (!relaxExcludeComboSets && effectiveExcluded.has(combo)) return false;
    if (!relaxExcludeComboSets && excludeComboSetsSet.size > 0 && excludeComboSetsSet.has(normKey)) return false;
    const mult = multiplicityOf(combo);
    if (!relaxMultCaps) {
      if (mult === 'singles' && singles >= rails.singlesMax) return false;
      if (mult === 'doubles' && doubles >= rails.doublesMax) return false;
      if (mult === 'triples' && !rails.triplesOn) return false;
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
  k6.sort((a, b) => b.indicator - a.indicator);

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
      bestOrder: bestOrderFor(x.combo, ds.pairData),
      confidence: Math.round(scopeConfidence * 100),
      drawsSince: ds.dsRawMap.get(x.normKey) ?? boxRow?.ds_raw ?? null,
      timesDrawn: boxRow?.times_drawn ?? ds.timesDrawnMap.get(x.normKey) ?? 0,
      dsRaw: boxRow?.ds_raw ?? ds.dsRawMap.get(x.normKey) ?? 0,
      lastSeen: ds.lastSeenMap.get(x.normKey) ?? boxRow?.last_seen ?? null,
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
        draws_since: pick.drawsSince,
        times_drawn: pick.timesDrawn,
        best_order: bestOrderFor(pick.combo, ds.pairData),
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
          draws_since: ds.drawsSinceMap.get(x.normKey) ?? null,
          times_drawn: ds.timesDrawnMap.get(x.normKey) ?? 0,
          best_order: bestOrderFor(x.combo, ds.pairData),
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
          draws_since: null as any,
          times_drawn: 0,
          best_order: combo,
          on_slate: false,
          hit_box: h.hit_box,
          hit_straight: h.hit_straight,
          hit_state: h.hit_state,
          hit_session: h.hit_session,
          hit_result: h.hit_result,
        }));

      const diRows = [...top30Rows, ...extraK6Rows, ...hitOrphanRows];
      const delErr = await fetchFromSupabase({
        path: `/rest/v1/daily_intelligence?slate_date=eq.${effectiveDate}&scope=eq.${encodeURIComponent(scope)}&mode=eq.${encodeURIComponent(weightsKey)}`,
        method: 'DELETE',
        headers: { 'Prefer': 'return=minimal' },
      }).then(() => null).catch((e: unknown) => e);
      if (delErr) {
        console.warn('[zk6v2] daily_intelligence DELETE failed (rows may already be absent):', String(delErr));
      }
      await fetchFromSupabase({
        path: '/rest/v1/daily_intelligence',
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
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
      await fetchFromSupabase({
        path: '/rest/v1/adaptive_tracking',
        method: 'POST',
        headers: { 'Prefer': 'return=minimal' },
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
