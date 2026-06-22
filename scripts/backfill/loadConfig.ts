/**
 * loadConfig.ts — build a replay-style EngineConfig from LIVE app_config.
 *
 * WHY THIS EXISTS
 * The backtest harness (scripts/backtest/configs.ts) carries STATIC presets that
 * are hand-maintained to mirror production app_config — and can silently drift
 * (the CONFIG-01 / 2026-05-09 Gemini incident is exactly this failure mode). A
 * durable backfill must reconstruct a missed day with the SAME config production
 * would have used, so it reads app_config live rather than trusting a snapshot.
 *
 * This is a faithful Node mirror of compute-slate-zk6/index.ts::loadEngineConfig
 * (the edge fn). The edge fn resolves per-scope overrides INTO a single-scope
 * config (it is called once per scope); we do the same, emitting one resolved
 * config per scope with the scope-resolved values placed in the GLOBAL fields so
 * computeSlateAsOf (which reads `config.<field>` with the *ByScope maps absent)
 * uses them directly.
 *
 * DRIFT GUARD: the runtime parity gate (parity-check.ts) recomputes a recent day
 * that already has a production snapshot and compares comboSets. If this mapping
 * drifts from the edge fn, the gate catches it before any write. Keep this file
 * in lockstep with the edge fn's loadEngineConfig — same as the lib/engineCore.ts
 * → _shared sync discipline (sync:edge-shared).
 *
 * READ-ONLY: uses dbGet (GET only). No writes happen here.
 */

import { dbGet } from '../backtest/data.js';
import { HORIZON_WEIGHTS } from '../../lib/engineCore.js';
import type { EngineConfig, Scope, WeightSet } from '../backtest/types.js';

// Mirror of edge fn DEFAULT_CFG (compute-slate-zk6/index.ts:138), expressed in
// the replay EngineConfig shape. balanced is the only mode production consumes;
// conservative/aggressive are filled with the same weights (mode is always
// 'balanced' through the backfill path) so the type is satisfied harmlessly.
const DEFAULT_BALANCED: WeightSet = { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 };

function baseConfig(): EngineConfig {
  const b = { ...DEFAULT_BALANCED };
  return {
    presets: { balanced: { ...b }, conservative: { ...b }, aggressive: { ...b } },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250,
    minEnergyThreshold: 0,
    recentHitCooldown: 20,
    synergyOn: false,
    synergyWeight: 0.15,
    boxFreqWeight: 0.60,
    boxPressureWeight: 0.40,
    timesDrawnHorizonBlend: true,        // edge DEFAULT_CFG.timesDrawnBlendEnabled = true
    adaptiveSignalWeights: { enabled: false, alpha: 1.0 },
    warmingWeight: 0,
    warmingWindowDays: 7,
    pressureScaleMode: 'legacy',
    stateStrWeight: 0,
    stateStrHalfLifeDays: 14,
    stateStrWindowDays: 60,
    // PARITY: the edge fn (v39, ENG-REORDER-01..04) reorders the final 6 picks
    // by draws_since desc + per-scope tiebreak before persisting. Mirror it so
    // the written snapshot's rank order (and rank-1) matches production.
    modelDisplayReorder: true,
  };
}

function parseWeightSet(raw: string): WeightSet | null {
  try {
    const parsed = JSON.parse(raw);
    const p = (v: number) => (v > 1 ? v / 100 : v);
    const ws: WeightSet = {
      BOX:    p(parsed.BOX    ?? parsed.box    ?? 0),
      PBURST: p(parsed.PBURST ?? parsed.pburst ?? 0),
      CO:     p(parsed.CO     ?? parsed.co     ?? 0),
      DGC:    p(parsed.DGC    ?? parsed.dgc    ?? DEFAULT_BALANCED.DGC),
    };
    if (ws.BOX + ws.PBURST + ws.CO > 0.05) return ws;
    return null;
  } catch {
    return null;
  }
}

/**
 * Load the production-faithful EngineConfig for a single scope, resolving all
 * per-scope app_config overrides into the global config fields.
 */
export async function loadBackfillConfig(scope: Scope): Promise<EngineConfig> {
  const cfg = baseConfig();

  // Per-scope override keys (mirror edge fn).
  const k = {
    cooldown:  `recent_hit_cooldown_${scope}`,
    boxFreq:   `box_freq_weight_${scope}`,
    boxPress:  `box_pressure_weight_${scope}`,
    balanced:  `engine_weights_balanced_${scope}`,
    minEnergy: `min_energy_threshold_${scope}`,
    warming:   `warming_weight_${scope}`,
    stateStr:  `state_str_weight_${scope}`,
  };

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
    k.stateStr, k.cooldown, k.boxFreq, k.boxPress, k.balanced, k.minEnergy, k.warming,
  ];

  const rows = await dbGet<{ key: string; value: string }[]>(
    `/app_config?key=in.(${keyList.join(',')})&select=key,value`,
  );
  if (!Array.isArray(rows) || rows.length === 0) return cfg;

  let scopeCooldown: number | null = null;
  let scopeBoxFreq: number | null = null;
  let scopeBoxPress: number | null = null;
  let scopeBalanced: WeightSet | null = null;
  let scopeMinEnergy: number | null = null;
  let scopeWarming: number | null = null;
  let scopeStateStr: number | null = null;

  for (const row of rows) {
    try {
      const key = row.key;
      const val = row.value;
      if (key === 'k6_singles_max')       { const v = parseInt(val, 10); if (!isNaN(v)) cfg.rails.singlesMax = v; continue; }
      if (key === 'k6_doubles_max')       { const v = parseInt(val, 10); if (!isNaN(v)) cfg.rails.doublesMax = v; continue; }
      if (key === 'k6_triples_on')        { cfg.rails.triplesOn = val === 'true'; continue; }
      if (key === 'pair_rep_cap')         { const v = parseInt(val, 10); if (!isNaN(v)) cfg.rails.pairRepCap = v; continue; }
      if (key === 'pressure_threshold')   { const v = parseInt(val, 10); if (!isNaN(v) && v >= 50) cfg.pressureThreshold = v; continue; }
      if (key === 'min_energy_threshold') { const v = parseInt(val, 10); if (!isNaN(v) && v >= 0) cfg.minEnergyThreshold = v; continue; }
      if (key === 'recent_hit_cooldown')  { const v = parseInt(val, 10); if (!isNaN(v) && v >= 0) cfg.recentHitCooldown = v; continue; }
      if (key === k.cooldown)             { const v = parseInt(val, 10); if (!isNaN(v) && v >= 0) scopeCooldown = v; continue; }
      if (key === 'box_freq_weight')      { const v = parseFloat(val); if (!isNaN(v)) cfg.boxFreqWeight = v; continue; }
      if (key === 'box_pressure_weight')  { const v = parseFloat(val); if (!isNaN(v)) cfg.boxPressureWeight = v; continue; }
      if (key === 'box_times_drawn_blend_enabled') {
        if (val === 'true')  cfg.timesDrawnHorizonBlend = true;
        if (val === 'false') cfg.timesDrawnHorizonBlend = false;
        continue;
      }
      if (key === 'adaptive_signal_weights_enabled') {
        if (val === 'true')  cfg.adaptiveSignalWeights = { enabled: true,  alpha: cfg.adaptiveSignalWeights?.alpha ?? 1.0 };
        if (val === 'false') cfg.adaptiveSignalWeights = { enabled: false, alpha: cfg.adaptiveSignalWeights?.alpha ?? 1.0 };
        continue;
      }
      if (key === 'adaptive_signal_weights_alpha') {
        const v = parseFloat(val);
        if (!isNaN(v) && v >= 0 && v <= 2) cfg.adaptiveSignalWeights = { enabled: cfg.adaptiveSignalWeights?.enabled ?? false, alpha: v };
        continue;
      }
      if (key === k.boxFreq)  { const v = parseFloat(val); if (!isNaN(v)) scopeBoxFreq = v; continue; }
      if (key === k.boxPress) { const v = parseFloat(val); if (!isNaN(v)) scopeBoxPress = v; continue; }
      if (key === k.minEnergy){ const v = parseInt(val, 10); if (!isNaN(v) && v >= 0) scopeMinEnergy = v; continue; }
      if (key === 'warming_weight')      { const v = parseFloat(val); if (!isNaN(v) && v >= 0 && v <= 1) cfg.warmingWeight = v; continue; }
      if (key === 'warming_window_days') { const v = parseInt(val, 10); if (!isNaN(v) && v >= 1 && v <= 30) cfg.warmingWindowDays = v; continue; }
      if (key === k.warming)  { const v = parseFloat(val); if (!isNaN(v) && v >= 0 && v <= 1) scopeWarming = v; continue; }
      if (key === 'state_str_weight')         { const v = parseFloat(val); if (!isNaN(v) && v >= 0 && v <= 1) cfg.stateStrWeight = v; continue; }
      if (key === 'state_str_half_life_days') { const v = parseInt(val, 10); if (!isNaN(v) && v >= 1 && v <= 90) cfg.stateStrHalfLifeDays = v; continue; }
      if (key === 'state_str_window_days')    { const v = parseInt(val, 10); if (!isNaN(v) && v >= 7 && v <= 365) cfg.stateStrWindowDays = v; continue; }
      if (key === k.stateStr) { const v = parseFloat(val); if (!isNaN(v) && v >= 0 && v <= 1) scopeStateStr = v; continue; }
      if (key === 'pressure_scale_mode') {
        if (val === 'legacy' || val === 'p95ramp' || val === 'percentile') cfg.pressureScaleMode = val;
        continue;
      }
      if (key === 'synergy_boost_on')     { cfg.synergyOn = val === 'true'; continue; }
      if (key === 'synergy_boost_weight') { const v = parseFloat(val); if (!isNaN(v) && v >= 0) cfg.synergyWeight = v; continue; }
      if (key === 'horizon_weights') {
        try {
          const parsedHw = JSON.parse(val);
          const candidate: Record<string, number> = {};
          let sum = 0, valid = true;
          for (const h of Object.keys(HORIZON_WEIGHTS)) {
            const v = parsedHw[h];
            if (typeof v !== 'number' || v < 0) { valid = false; break; }
            candidate[h] = v / 100;
            sum += v;
          }
          if (valid && Math.abs(sum - 100) <= 1) cfg.horizonWeights = candidate;
        } catch { /* keep default */ }
        continue;
      }
      if (key === 'engine_weights_balanced') { const ws = parseWeightSet(val); if (ws) cfg.presets.balanced = ws; continue; }
      if (key === k.balanced)                { const ws = parseWeightSet(val); if (ws) scopeBalanced = ws; continue; }
    } catch { /* keep default for this row */ }
  }

  // Resolve per-scope overrides into the global fields (we build one config per
  // scope, so the global field IS the scope-resolved value).
  if (scopeBalanced)  { cfg.presets.balanced = scopeBalanced; cfg.presets.conservative = scopeBalanced; cfg.presets.aggressive = scopeBalanced; }
  if (scopeCooldown !== null)  cfg.recentHitCooldown = scopeCooldown;
  if (scopeBoxFreq !== null)   cfg.boxFreqWeight = scopeBoxFreq;
  if (scopeBoxPress !== null)  cfg.boxPressureWeight = scopeBoxPress;
  if (scopeMinEnergy !== null) cfg.minEnergyThreshold = scopeMinEnergy;
  if (scopeWarming !== null)   cfg.warmingWeight = scopeWarming;
  if (scopeStateStr !== null)  cfg.stateStrWeight = scopeStateStr;

  // PARITY: yesterday-hit hard block is per-scope (ENG-BLOCK-PERSCOPE-01, edge
  // fn line 864). MIDDAY blocks D-1; evening + allday block today-only, which is
  // a no-op at slate-build time (today's draws aren't known yet) → no block.
  if (scope === 'midday') {
    cfg.excludeYesterdayHits = true;
    cfg.recentHitBlockDays = 1;
  } else {
    cfg.excludeYesterdayHits = false;
  }

  return cfg;
}
