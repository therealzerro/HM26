import { Scope, SlateSnapshot, HorizonLabel } from '@/types/core';
import { ZK6_WEIGHTS, MULTIPLICITY_PRIORS, K6_QUOTAS, PAIR_REPETITION_CAP } from '@/constants/zk6';
import { fetchFromSupabase } from '@/lib/supabase';

export interface ComputeSlateParams {
  scope: Scope;
  weightsKey?: keyof typeof ZK6_WEIGHTS;
  excludedCombos?: Set<string>;
}

interface ScoredCombo {
  combo: string;
  comboSet: string;
  indicator: number;
  components: { BOX: number; PBURST: number; CO: number };
  multiplicity: 'singles' | 'doubles' | 'triples';
  topPair: string;
  temperature: number;
  rawComponents?: { BOX: number; PBURST: number; CO: number };
}

interface DatasetRow {
  key: string;
  ds_raw: number;
  ds_normalized: number;
  class_id: number;
  horizon_label: HorizonLabel;
  scope: Scope;
}

interface PercentileMap {
  class_id: number;
  scope: Scope;
  horizon_label: HorizonLabel;
  p99_cap: number;
  percentile_map: Record<string, number>;
}

interface HorizonBlend {
  class_id: number;
  scope: Scope;
  available_horizons: HorizonLabel[];
  weights: Record<HorizonLabel, number>;
}

const toComboSet = (combo: string): string => {
  const arr = combo.split('');
  arr.sort();
  return `{${arr.join(',')}}`;
};

function normalizeBoxKey(key: string): string {
  const digits = (key.match(/\d/g) ?? []).join('').slice(0, 3);
  if (digits.length === 3) {
    return toComboSet(digits);
  }
  return key;
}

function normalizePairKey(key: string): string {
  const digits = (key.match(/\d/g) ?? []).join('').slice(0, 2);
  if (digits.length === 2) {
    const arr = digits.split('').sort();
    return arr.join('');
  }
  return key;
}

function multiplicityOf(combo: string): 'singles' | 'doubles' | 'triples' {
  const a = combo[0];
  const b = combo[1];
  const c = combo[2];
  if (a === b && b === c) return 'triples';
  if (a === b || b === c || a === c) return 'doubles';
  return 'singles';
}

function unorderedPair(x: string, y: string): string {
  const p = [x, y].sort().join('');
  return p;
}

function topPairOf(combo: string): string {
  const ab = combo.slice(0, 2);
  const bc = combo.slice(1, 3);
  const ac = `${combo[0]}${combo[2]}`;
  const candidates = [ab, bc, ac].map((p) => unorderedPair(p[0], p[1]));
  candidates.sort();
  return candidates[0];
}

function pseudoPercentile(value: number, min: number, max: number): number {
  if (max <= min) return 0;
  const v = Math.max(min, Math.min(max, value));
  return (v - min) / (max - min);
}

async function fetchDatasets(scope: Scope): Promise<{
  boxData: Map<string, number>;
  pairData: Map<string, Map<number, number>>;
  percentileMaps: Map<string, PercentileMap>;
  horizonBlends: Map<number, HorizonBlend>;
  hasData: boolean;
  horizonsPresent: Record<string, boolean>;
}> {
  try {
    console.log('[zk6] Fetching datasets for scope:', scope);
    
    const canonicalScope = scope;
    
    const fetchPromises = [
      fetchFromSupabase<DatasetRow[]>({ 
        path: `/rest/v1/datasets_box?select=*&scope=eq.${encodeURIComponent(canonicalScope)}&class_id=eq.1&deleted_at=is.null&limit=10000` 
      }),
      fetchFromSupabase<DatasetRow[]>({ 
        path: `/rest/v1/datasets_pair?select=*&scope=eq.${encodeURIComponent(canonicalScope)}&class_id=gte.2&class_id=lte.11&deleted_at=is.null&limit=50000` 
      }),
      fetchFromSupabase<PercentileMap[]>({ 
        path: `/rest/v1/percentile_maps?select=*&scope=eq.${encodeURIComponent(canonicalScope)}&deleted_at=is.null&limit=200` 
      }),
      fetchFromSupabase<HorizonBlend[]>({ 
        path: `/rest/v1/horizon_blends?select=*&scope=eq.${encodeURIComponent(canonicalScope)}&deleted_at=is.null&limit=200` 
      })
    ];
    
    // Add timeout to prevent hanging
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('ZK6 datasets fetch timeout')), 15000);
    });
    
    console.log('[zk6] Starting parallel fetch for:', {
      scope,
      fetchCount: fetchPromises.length
    });
    
    const [boxRows, pairRows, percentileMaps, blends] = await Promise.race([
      Promise.all(fetchPromises),
      timeoutPromise
    ]);
    
    console.log('[zk6] Raw fetch results:', {
      boxRowsCount: Array.isArray(boxRows) ? boxRows.length : 0,
      pairRowsCount: Array.isArray(pairRows) ? pairRows.length : 0,
      percentileMapsCount: Array.isArray(percentileMaps) ? percentileMaps.length : 0,
      blendsCount: Array.isArray(blends) ? blends.length : 0,
      boxSample: Array.isArray(boxRows) ? boxRows.slice(0, 2) : [],
      pairSample: Array.isArray(pairRows) ? pairRows.slice(0, 2) : []
    });
    
    // Process box data with horizon blending
    const boxData = new Map<string, number>();
    const boxBlendedData = new Map<string, Map<HorizonLabel, number>>();
    
    if (Array.isArray(boxRows)) {
      (boxRows as DatasetRow[]).forEach(row => {
        if (row && typeof row.key === 'string' && typeof row.ds_normalized === 'number' && typeof row.horizon_label === 'string') {
          const normKey = normalizeBoxKey(row.key);
          if (!boxBlendedData.has(normKey)) {
            boxBlendedData.set(normKey, new Map());
          }
          boxBlendedData.get(normKey)!.set(row.horizon_label as HorizonLabel, row.ds_normalized);
        }
      });
    }
    
    // Process pair data by class with horizon blending
    const pairData = new Map<string, Map<number, number>>();
    const pairBlendedData = new Map<string, Map<number, Map<HorizonLabel, number>>>();
    
    if (Array.isArray(pairRows)) {
      (pairRows as DatasetRow[]).forEach(row => {
        if (row && typeof row.key === 'string' && typeof row.ds_normalized === 'number' && typeof row.class_id === 'number' && typeof row.horizon_label === 'string') {
          const normKey = normalizePairKey(row.key);
          if (!pairBlendedData.has(normKey)) {
            pairBlendedData.set(normKey, new Map());
          }
          if (!pairBlendedData.get(normKey)!.has(row.class_id)) {
            pairBlendedData.get(normKey)!.set(row.class_id, new Map());
          }
          pairBlendedData.get(normKey)!.get(row.class_id)!.set(row.horizon_label as HorizonLabel, row.ds_normalized);
        }
      });
    }
    
    // Process percentile maps
    const percentileMapsByKey = new Map<string, PercentileMap>();
    if (Array.isArray(percentileMaps)) {
      (percentileMaps as PercentileMap[]).forEach(pm => {
        if (pm && typeof pm.class_id === 'number' && typeof pm.scope === 'string' && typeof pm.horizon_label === 'string') {
          const key = `${pm.class_id}-${pm.scope}-${pm.horizon_label}`;
          percentileMapsByKey.set(key, pm);
        }
      });
    }
    
    // Process horizon blends
    const horizonBlendsByClass = new Map<number, HorizonBlend>();
    if (Array.isArray(blends)) {
      (blends as HorizonBlend[]).forEach(blend => {
        if (blend && typeof blend.class_id === 'number') {
          horizonBlendsByClass.set(blend.class_id, blend);
        }
      });
    }
    
    // Apply horizon blending for box data
    const boxBlend = horizonBlendsByClass.get(1); // Box class is class_id = 1
    if (boxBlend && boxBlendedData.size > 0) {
      for (const [key, horizonValues] of boxBlendedData.entries()) {
        let blendedValue = 0;
        let totalWeight = 0;
        
        for (const [horizon, weight] of Object.entries(boxBlend.weights)) {
          const value = horizonValues.get(horizon as HorizonLabel);
          if (value !== undefined && typeof weight === 'number') {
            blendedValue += value * weight;
            totalWeight += weight;
          }
        }
        
        if (totalWeight > 0) {
          const finalValue = blendedValue / totalWeight;
          boxData.set(key, finalValue);
          const rawKey = (key.match(/\d/g) ?? []).join('').slice(0, 3);
          if (rawKey.length === 3) {
            boxData.set(toComboSet(rawKey), finalValue);
          }
        }
      }
    }
    
    // Apply horizon blending for pair data
    for (const classId of [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]) {
      const pairBlend = horizonBlendsByClass.get(classId);
      if (pairBlend && pairBlendedData.size > 0) {
        for (const [key, classData] of pairBlendedData.entries()) {
          const horizonValues = classData.get(classId);
          if (horizonValues) {
            let blendedValue = 0;
            let totalWeight = 0;
            
            for (const [horizon, weight] of Object.entries(pairBlend.weights)) {
              const value = horizonValues.get(horizon as HorizonLabel);
              if (value !== undefined && typeof weight === 'number') {
                blendedValue += value * weight;
                totalWeight += weight;
              }
            }
            
            if (totalWeight > 0) {
              const finalValue = blendedValue / totalWeight;
              const normPair = normalizePairKey(key);
              if (!pairData.has(normPair)) {
                pairData.set(normPair, new Map());
              }
              pairData.get(normPair)!.set(classId, finalValue);
            }
          }
        }
      }
    }
    
    // Determine available horizons across all classes
    const horizonsPresent: Record<string, boolean> = {
      H01Y: false, H02Y: false, H03Y: false, H04Y: false, H05Y: false,
      H06Y: false, H07Y: false, H08Y: false, H09Y: false, H10Y: false,
    };
    
    // Check for H06Y specifically in the raw data
    if (Array.isArray(boxRows)) {
      const hasH06Y = (boxRows as DatasetRow[]).some(row => row.horizon_label === 'H06Y');
      if (hasH06Y) {
        horizonsPresent.H06Y = true;
        console.log('[zk6] Found H06Y data in box rows');
      }
    }
    
    if (Array.isArray(pairRows)) {
      const hasH06Y = (pairRows as DatasetRow[]).some(row => row.horizon_label === 'H06Y');
      if (hasH06Y) {
        horizonsPresent.H06Y = true;
        console.log('[zk6] Found H06Y data in pair rows');
      }
    }
    
    for (const blend of horizonBlendsByClass.values()) {
      if (Array.isArray(blend.available_horizons)) {
        blend.available_horizons.forEach(h => {
          if (typeof h === 'string' && h in horizonsPresent) {
            horizonsPresent[h] = true;
          }
        });
      }
    }
    
    const hasData = boxData.size > 0 || pairData.size > 0;
    
    console.log('[zk6] Datasets loaded and blended:', {
      boxEntries: boxData.size,
      pairEntries: pairData.size,
      percentileMaps: percentileMapsByKey.size,
      horizonBlends: horizonBlendsByClass.size,
      hasData,
      horizonsPresent: Object.entries(horizonsPresent).filter(([_, present]) => present).map(([h]) => h),
      boxDataSample: Array.from(boxData.entries()).slice(0, 3),
      pairDataSample: Array.from(pairData.entries()).slice(0, 3).map(([key, classMap]) => ({
        key,
        classes: Array.from(classMap.entries())
      }))
    });
    
    return {
      boxData,
      pairData,
      percentileMaps: percentileMapsByKey,
      horizonBlends: horizonBlendsByClass,
      hasData,
      horizonsPresent
    };
  } catch (error) {
    console.log('[zk6] Error fetching datasets:', error);
    throw error instanceof Error ? error : new Error('Failed to fetch datasets');
  }
}

function scoreComponentsWithData(
  combo: string,
  boxData: Map<string, number>,
  pairData: Map<string, Map<number, number>>
): { BOX: number; PBURST: number; CO: number } {
  const a = combo[0];
  const b = combo[1];
  const c = combo[2];
  
  // BOX component - normalized DS for the combo set
  const comboSet = toComboSet(combo);
  const BOX = boxData.get(comboSet) ?? 0;
  
  // PBURST component - best-order mean of Front/Back/Split pairs
  const ab = unorderedPair(a, b);
  const bc = unorderedPair(b, c);
  const ac = unorderedPair(a, c);
  
  const frontScore = pairData.get(ab)?.get(2) ?? 0; // Front pairs (class_id = 2)
  const backScore = pairData.get(bc)?.get(3) ?? 0;  // Back pairs (class_id = 3)
  const splitScore = pairData.get(ac)?.get(4) ?? 0; // Split pairs (class_id = 4)
  
  const PBURST = (frontScore + backScore + splitScore) / 3;
  
  // CO component - any-position unordered pair pressures
  const co1 = pairData.get(ab)?.get(11) ?? 0; // Any-position pairs (class_id = 11)
  const co2 = pairData.get(ac)?.get(11) ?? 0;
  const co3 = pairData.get(bc)?.get(11) ?? 0;
  
  const CO = (co1 + co2 + co3) / 3;
  
  return { BOX, PBURST, CO };
}


function buildUniverse(): string[] {
  const out: string[] = [];
  for (let i = 0; i < 1000; i += 1) {
    const s = i.toString().padStart(3, '0');
    out.push(s);
  }
  return out;
}

function deterministicSort(a: ScoredCombo, b: ScoredCombo): number {
  if (b.indicator !== a.indicator) return b.indicator - a.indicator;
  const aBoxTie = a.components.BOX;
  const bBoxTie = b.components.BOX;
  if (bBoxTie !== aBoxTie) return bBoxTie - aBoxTie;
  return a.combo.localeCompare(b.combo);
}

function applyRails(items: ScoredCombo[]): ScoredCombo[] {
  const result: ScoredCombo[] = [];
  let singles = 0;
  let doubles = 0;
  let triples = 0;
  const pairCounts: Record<string, number> = {};

  for (const it of items) {
    if (it.multiplicity === 'singles' && singles >= K6_QUOTAS.singles) continue;
    if (it.multiplicity === 'doubles' && doubles >= K6_QUOTAS.doubles) continue;
    if (it.multiplicity === 'triples' && triples >= K6_QUOTAS.triples) continue;

    const pc = pairCounts[it.topPair] ?? 0;
    if (pc >= PAIR_REPETITION_CAP) continue;

    result.push(it);

    if (it.multiplicity === 'singles') singles += 1;
    if (it.multiplicity === 'doubles') doubles += 1;
    if (it.multiplicity === 'triples') triples += 1;
    pairCounts[it.topPair] = pc + 1;

    if (result.length >= 10) break;
  }
  return result;
}

function calculateTemperature(indicator: number, allIndicators: number[]): number {
  if (allIndicators.length === 0) return 50;
  
  allIndicators.sort((a, b) => a - b);
  const p10Index = Math.floor(allIndicators.length * 0.1);
  const p90Index = Math.floor(allIndicators.length * 0.9);
  
  const p10 = allIndicators[p10Index];
  const p90 = allIndicators[p90Index];
  
  if (p90 <= p10) return 50;
  
  const normalized = (indicator - p10) / (p90 - p10);
  return Math.max(0, Math.min(100, normalized * 100));
}

async function saveSlateSnapshot(snapshot: SlateSnapshot): Promise<string> {
  console.log('[zk6] Saving slate snapshot:', {
    id: snapshot.id,
    scope: snapshot.scope,
    hash: snapshot.hash?.slice(0, 8),
    topKCount: Array.isArray(snapshot.top_k_straights_json) ? snapshot.top_k_straights_json.length : 0
  });

  const url = '/rest/v1/slate_snapshots';

  const payload = {
    scope: snapshot.scope,
    horizons_present_json: snapshot.horizons_present_json,
    weights_json: snapshot.weights_json,
    top_k_straights_json: snapshot.top_k_straights_json,
    top_k_boxes_json: snapshot.top_k_boxes_json,
    components_json: snapshot.components_json,
    updated_at_et: snapshot.updated_at_et,
    snapshot_hash: snapshot.hash ?? null,
    hash: snapshot.hash ?? null, // Include both hash fields for compatibility
  } as const;

  console.log('[zk6] Snapshot payload size:', {
    payloadSize: JSON.stringify(payload).length,
    topKLength: Array.isArray(payload.top_k_straights_json) ? payload.top_k_straights_json.length : 0,
    componentsLength: Array.isArray(payload.components_json) ? payload.components_json.length : 0,
    includesHash: Object.prototype.hasOwnProperty.call(payload, 'snapshot_hash')
  });

  const saveToAuditAsFallback = async (reason: string) => {
    try {
      console.log('[zk6] RLS fallback: saving snapshot to audit_logs');
      await fetchFromSupabase({
        path: '/rest/v1/audit_logs',
        method: 'POST',
        body: {
          actor_id: 'system',
          action: 'slate_snapshot_fallback',
          target: snapshot.scope,
          payload_meta: {
            reason,
            snapshot: {
              scope: snapshot.scope,
              snapshot_hash: snapshot.hash,
              horizons_present_json: snapshot.horizons_present_json,
              weights_json: snapshot.weights_json,
              top_k_straights_json: snapshot.top_k_straights_json,
              top_k_boxes_json: snapshot.top_k_boxes_json,
              components_json: snapshot.components_json,
              updated_at_et: snapshot.updated_at_et,
            }
          }
        }
      });
      console.log('[zk6] Snapshot stored in audit_logs as fallback.');
    } catch (e) {
      console.log('[zk6] Failed to save snapshot to audit_logs fallback:', e instanceof Error ? e.message : String(e));
    }
  };

  try {
    const res = await fetchFromSupabase<any>({
      path: url,
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=representation' },
      body: payload,
    });
    const dbId = Array.isArray(res) && res.length > 0 ? (res[0]?.id as string | undefined) : undefined;
    console.log('[zk6] Slate snapshot saved successfully:', { scope: snapshot.scope, hash: snapshot.hash?.slice(0, 8), dbId });
    return dbId ?? snapshot.id;
  } catch (error) {
    const msg = String(error instanceof Error ? error.message : error);
    const isRls = /42501|row-level security|RLS|violates row-level security/i.test(msg);
    console.log('[zk6] Error saving slate snapshot (final):', { msgSnippet: msg.slice(0, 200), scope: snapshot.scope, isRls });
    if (isRls) {
      await saveToAuditAsFallback(msg);
      return snapshot.id;
    }
    throw error instanceof Error ? error : new Error('Failed to save slate snapshot');
  }
}

export async function computeSlate({ scope, weightsKey = 'balanced', excludedCombos = new Set() }: ComputeSlateParams): Promise<SlateSnapshot> {
  const now = new Date().toISOString();
  const weights = ZK6_WEIGHTS[weightsKey];
  const universe = buildUniverse();
  
  console.log('[zk6] Computing slate for scope:', scope, 'with weights:', weightsKey);
  
  // Fetch live data only
  const { boxData, pairData, horizonsPresent, hasData } = await fetchDatasets(scope);

  console.log('[zk6] Dataset validation:', {
    hasData,
    boxDataSize: boxData.size,
    pairDataSize: pairData.size,
    excludedCombosSize: excludedCombos.size,
    universeSize: universe.length
  });

  if (!hasData) {
    const displayScope = scope === 'allday' ? 'All-Day' : scope === 'midday' ? 'Midday' : scope === 'evening' ? 'Evening' : scope;
    throw new Error(`No BOX data available for scope: ${displayScope}`);
  }

  if (boxData.size === 0) {
    const displayScope = scope === 'allday' ? 'All-Day' : scope === 'midday' ? 'Midday' : scope === 'evening' ? 'Evening' : scope;
    throw new Error(`No BOX data available for scope: ${displayScope}`);
  }
  
  if (pairData.size === 0) {
    console.log('[zk6] Warning: No PAIR data available, PBURST and CO components will be zero');
  }

  const scored: ScoredCombo[] = universe
    .filter(combo => !excludedCombos.has(combo))
    .map((combo) => {
      const multiplicity = multiplicityOf(combo);
      const components = scoreComponentsWithData(combo, boxData, pairData);
      const prior = MULTIPLICITY_PRIORS[multiplicity];
      const indicator =
        weights.BOX * components.BOX +
        weights.PBURST * components.PBURST +
        weights.CO * components.CO +
        prior;
      const topPair = topPairOf(combo);
      
      // Debug first few combos
      if (universe.indexOf(combo) < 5) {
        console.log(`[zk6] Scoring combo ${combo}:`, {
          multiplicity,
          components,
          prior,
          indicator,
          topPair,
          weights
        });
      }
      
      return {
        combo,
        comboSet: toComboSet(combo),
        components,
        indicator,
        multiplicity,
        topPair,
        temperature: 0,
        rawComponents: components,
      };
    });
    
  console.log('[zk6] Scored combos:', {
    totalScored: scored.length,
    excludedCount: excludedCombos.size,
    sampleScores: scored.slice(0, 3).map(s => ({ combo: s.combo, indicator: s.indicator, components: s.components }))
  });

  scored.sort(deterministicSort);
  
  // Calculate temperatures
  const allIndicators = scored.map(s => s.indicator);
  scored.forEach(s => {
    s.temperature = calculateTemperature(s.indicator, allIndicators);
  });
  
  const k6 = applyRails(scored);
  
  console.log('[zk6] K6 after rails:', {
    k6Count: k6.length,
    topCombos: k6.slice(0, 6).map(x => ({ combo: x.combo, indicator: x.indicator, multiplicity: x.multiplicity })),
    multiplicityBreakdown: {
      singles: k6.filter(x => x.multiplicity === 'singles').length,
      doubles: k6.filter(x => x.multiplicity === 'doubles').length,
      triples: k6.filter(x => x.multiplicity === 'triples').length
    }
  });
  
  const hashInput = JSON.stringify({
    scope,
    weights,
    topCombos: k6.map(x => x.combo),
    horizons: horizonsPresent,
    timestamp: now.slice(0, 16) // Include hour for uniqueness
  });
  const hash = hashInput.split('').reduce((a, b) => {
    a = ((a << 5) - a) + b.charCodeAt(0);
    return a & a;
  }, 0).toString(16).toUpperCase();

  // Create the snapshot with proper data format for UI consumption
  const topKStraights = k6.map((x, idx) => ({
    combo: x.combo,
    indicator: x.indicator,
    box: x.components.BOX,
    pburst: x.components.PBURST,
    co: x.components.CO,
    multiplicity: x.multiplicity,
    topPair: x.topPair,
    temperature: x.temperature,
    rank: idx + 1
  }));

  const snapshot: SlateSnapshot = {
    id: `zk6-${scope}-${Date.now()}`,
    scope,
    horizons_present_json: horizonsPresent,
    weights_json: weights,
    top_k_straights_json: topKStraights,
    top_k_boxes_json: k6.map((x) => x.comboSet),
    components_json: k6.map((x) => ({
      combo: x.combo,
      components: x.components,
      temperature: x.temperature,
      multiplicity: x.multiplicity,
      topPair: x.topPair,
      indicator: x.indicator,
      rawComponents: x.rawComponents
    })),
    updated_at_et: now,
    hash,
  };
  
  console.log('[zk6] Slate computed successfully:', {
    scope,
    k6Count: k6.length,
    horizonsCount: Object.values(horizonsPresent).filter(Boolean).length,
    hash: hash.slice(0, 8),
    topK: k6.slice(0, 6).map(x => x.combo),
    dataQuality: {
      boxDataEntries: boxData.size,
      pairDataEntries: pairData.size,
      avgIndicator: k6.length > 0 ? (k6.reduce((sum, x) => sum + x.indicator, 0) / k6.length).toFixed(4) : 0
    }
  });
  
  const savedId = await saveSlateSnapshot(snapshot);
  if (typeof savedId === 'string' && savedId.length > 0) {
    snapshot.id = savedId;
  }
  return snapshot;
}
