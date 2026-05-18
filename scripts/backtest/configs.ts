import type { EngineConfig } from './types.js';

export const CONFIGS: Record<string, EngineConfig> = {
  // Current (post-revert) configuration. Matches engine DEFAULT_CFG.
  default: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250,
    minEnergyThreshold: 0,
    recentHitCooldown: 20,
    synergyOn: false,
    synergyWeight: 0.15,
  },

  // Gemini CLI's aggressive config that ran 2026-05-09 12:00 ET → 2026-05-12.
  // Preserved as a permanent test fixture so this regression can never silently recur.
  // Verified against app_config before revert on 2026-05-12.
  destroyed: {
    presets: {
      balanced:     { BOX: 0.43,  PBURST: 0.25, CO: 0.17, DGC: 0.15 },
      conservative: { BOX: 0.75,  PBURST: 0.15, CO: 0.10, DGC: 0.10 },
      aggressive:   { BOX: 0.45,  PBURST: 0.35, CO: 0.20, DGC: 0.10 },
    },
    rails: { singlesMax: 5, doublesMax: 3, triplesOn: false, pairRepCap: 3 },
    pressureThreshold: 365,
    minEnergyThreshold: 97,
    recentHitCooldown: 1,
    synergyOn: true,
    synergyWeight: 0.05,
  },

  // Models the deployed edge function (compute-slate-zk6/index.ts) BEFORE the
  // yesterday-hit hard-block port. Identical to `default` in every other respect.
  // Used as the BASELINE when validating the edge-function port (2026-05-12).
  edge_current: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250,
    minEnergyThreshold: 0,
    recentHitCooldown: 20,
    synergyOn: false,
    synergyWeight: 0.15,
    excludeYesterdayHits: false,
  },

  // ───────────────────────── ENH-A: quality-floor candidates ─────────────────────────
  // Identical to `default` except `minEnergyThreshold` is raised. The K6 selector
  // already enforces minEnergyThreshold; setting it >0 means picks below that energy
  // percentile are refused at the rail step. If rails can't be satisfied above the
  // floor across all 6 passes, the slate returns <6 picks (no garbage fillers).
  floor50: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 50, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
  },
  floor70: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
  },

  // ───────────────────────── ENH-F: tiered cooldown candidates ─────────────────────────
  // Doubles statistically draw less often than singles (e.g. ~50% of frequency in 3-digit
  // games), so a 20-day cooldown disproportionately rejects valid double candidates.
  // We test two tier schemes vs default's flat 20.
  tieredCD_20_10_5: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    cooldownByMultiplicity: { singles: 20, doubles: 10, triples: 5 },
  },
  tieredCD_15_5_3: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    cooldownByMultiplicity: { singles: 15, doubles: 5, triples: 3 },
  },

  // ENH-A + ENH-F combined (floor + tiered)
  floor50_tieredCD: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 50, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    cooldownByMultiplicity: { singles: 20, doubles: 10, triples: 5 },
  },

  // ENH-C: weights proposed by `npm run intel:propose` (AUC-fitted on 4/13–5/8 data,
  // ~75K evaluated picks). CO emerges as the only signal with meaningful predictive
  // lift (AUC 0.535); BOX barely above random (0.510); PBURST/DGC essentially random.
  // Backtest before any production deploy — this is a large weight redistribution.
  intel_tuned: {
    presets: {
      balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
      conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
      aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
  },

  // intel_tuned combined with floor70 (ENH-A winner)
  intel_tuned_floor70: {
    presets: {
      balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
      conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
      aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
  },

  // ─────────────────── 2026-05-13: per-scope midday cooldown candidates ───────────────────
  // Hypothesis: midday's 37.9% hit rate (vs allday 100%, evening 69%) on the 30-day
  // BASELINE suggests its 20-day flat cooldown is over-aggressive — too many valid
  // midday-drawing combos get rejected for having drawn elsewhere recently. Test
  // tighter midday-only cooldowns. recentHitCooldownByScope.midday wins over global.
  // Evening + allday stay at the global 20.
  //
  // parity_midday_cd20 is a sanity guard: with the override = global, results MUST
  // match `default`. If they differ, the loader is wrong — do not proceed.
  parity_midday_cd20: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    recentHitCooldownByScope: { midday: 20 },
  },
  midday_cd15: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    recentHitCooldownByScope: { midday: 15 },
  },
  midday_cd10: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    recentHitCooldownByScope: { midday: 10 },
  },
  midday_cd5: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    recentHitCooldownByScope: { midday: 5 },
  },

  // ─────────────────── 2026-05-13: horizon-weight blend candidates ───────────────────
  // BOX dsRaw is now a per-horizon weighted blend (ENH-HW). horizonWeights are
  // DECIMALS summing to ~1.0 here (production app_config stores percentages).
  //
  // hw_parity_h01y is the sanity guard: weights={H01Y:1.0, rest:0} must match
  // `default` exactly. Any divergence means the wiring is broken.
  hw_parity_h01y: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    horizonWeights: { H01Y: 1.0, H02Y: 0, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
  },
  // hw_production matches the current app_config.horizon_weights value
  // (35.35/21.72/14.14/9.09/6.06/4.045/3/2.525/2.02/2.02 in % form).
  hw_production: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    horizonWeights: { H01Y: 0.350, H02Y: 0.220, H03Y: 0.140, H04Y: 0.090, H05Y: 0.060, H06Y: 0.045, H07Y: 0.030, H08Y: 0.025, H09Y: 0.020, H10Y: 0.020 },
  },
  // hw_uniform — equal 10% across all 10 horizons. Tests whether long-horizon
  // signal contributes when given equal voice.
  hw_uniform: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    horizonWeights: { H01Y: 0.10, H02Y: 0.10, H03Y: 0.10, H04Y: 0.10, H05Y: 0.10, H06Y: 0.10, H07Y: 0.10, H08Y: 0.10, H09Y: 0.10, H10Y: 0.10 },
  },
  // hw_h01y_heavy — half weight on H01Y, rest distributed in mild decay.
  // Hypothesis: H01Y has the strongest predictive signal; over-weighting it
  // may help. Counter-hypothesis: too narrow a window misses pattern history.
  hw_h01y_heavy: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    horizonWeights: { H01Y: 0.50, H02Y: 0.20, H03Y: 0.12, H04Y: 0.07, H05Y: 0.04, H06Y: 0.03, H07Y: 0.02, H08Y: 0.01, H09Y: 0.005, H10Y: 0.005 },
  },

  // ─────────────────── 2026-05-14: ENH-BP — BOX freq/pressure split candidates ───────────────────
  // FORENSIC-01 finding: midday pick lift = 0.51× rail-matched baseline on singles,
  // 0.0× on doubles (0 hits across 28 doubles picks). Hypothesis: the BOX signal's
  // 40% "over-due pressure" term is anti-correlated with results — picking combos
  // because they "should be due" is gambler's fallacy at the engine level.
  //
  // bp_parity_60_40 is the sanity guard: omitting weights vs setting them to the
  // current hardcoded values MUST produce identical replay output. If not, the
  // wiring is broken — abort before drawing conclusions.
  bp_parity_60_40: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeight: 0.60, boxPressureWeight: 0.40,
  },
  // bp_freq75 — gentler pressure (25% weight). Tests "level wrong" vs "direction wrong."
  bp_freq75: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeight: 0.75, boxPressureWeight: 0.25,
  },
  // bp_freq90 — minimal pressure (10% weight). Near-pure historical frequency.
  bp_freq90: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeight: 0.90, boxPressureWeight: 0.10,
  },
  // bp_freq100 — pressure disabled entirely. The "is pressure helping at all?" test.
  bp_freq100: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeight: 1.00, boxPressureWeight: 0.00,
  },
  // ── Per-scope BOX-pressure candidates (ENH-BP follow-up, 30d sweep #1 finding)
  // First sweep showed bp_inverted wins midday (0.50→0.70× pick lift) and evening
  // (0.81→0.87×) but loses allday (0.90→0.76×). Per-scope deployment can capture
  // both wins without the loss. Loader pattern mirrors recentHitCooldownByScope.
  //
  // bp_per_scope_parity is the sanity guard: every scope's per-scope override
  // equals 60/40 and globals are 60/40 → must match `default` bit-for-bit.
  bp_per_scope_parity: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeight: 0.60, boxPressureWeight: 0.40,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: 0.40, evening: 0.40, allday: 0.40 },
  },
  // bp_midday_evening_inverted — winner of sweep #1 applied to midday + evening only;
  // allday stays at production 60/40 since inversion hurt there.
  bp_midday_evening_inverted: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
  },
  // bp_midday_evening_inverted_floor70 — TRUE production parity (2026-05-15).
  // Identical to bp_midday_evening_inverted but with minEnergyThreshold: 70 to
  // match the live app_config. Isolates "weight change" from "floor enabled" in
  // comparisons against intel_tuned_floor70.
  bp_midday_evening_inverted_floor70: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
  },

  // ─── 2026-05-15: per-scope signal weights (ENH presetByScope) ───
  // presetByScope_parity — sanity guard. Every scope's per-scope preset is set
  // to identical values matching the global preset. Output MUST match
  // bp_midday_evening_inverted_floor70 bit-for-bit. If it doesn't, the override
  // wiring is broken — abort before drawing conclusions.
  presetByScope_parity: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
      },
      evening: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
      },
    },
  },

  // intel_weights_midday_only_floor70 — conservative variant. Only midday gets
  // intel_tuned weights; evening AND allday stay on production weights. Preserves
  // allday's slate hit rate at the cost of allday's pick-lift improvement.
  intel_weights_midday_only_floor70: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
      // evening + allday intentionally omitted → fall back to global production preset
    },
  },

  // intel_weights_midday_allday_floor70 — primary Phase 1 candidate.
  // Evening keeps current production weights (×1.04 rail-matched lift, the one
  // working scope). Midday + allday adopt intel_tuned weights (CO-heavy, DGC=0)
  // since the 60-day sweep showed they lift those scopes substantially without
  // helping evening. Floor70, pressure inversion, cooldown all match production.
  intel_weights_midday_allday_floor70: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
      // evening intentionally omitted → falls back to global preset (production)
      allday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
  },
  // bp_midday_only_inverted — conservative variant: only midday gets inverted.
  // Evening's win in sweep #1 was modest (0.81→0.87×); if the midday-only fix
  // is enough to push overall slate hit above default, smaller-blast-radius win.
  bp_midday_only_inverted: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: 0.40, allday: 0.40 },
  },

  // bp_inverted — flip the sign of pressure. If pressure is anti-correlated with
  // results (the gambler's-fallacy hypothesis), this should BEAT default.
  // pressureWeight = -0.40 means high-pressure combos get penalized in BOX scoring.
  bp_inverted: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 0, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeight: 0.60, boxPressureWeight: -0.40,
  },

  // ─────────────── 2026-05-18: ENH-EVCO — Evening CO-cut sweep [PARKED] ──────
  //
  // STATUS: Killed 2026-05-18 after 30d backtest + per-rank harness extension.
  // Configs kept in place for reproducibility; do NOT ship without re-evaluating.
  //
  // Original motivation (post-BUG-148/149/150 data cleanup, 5/18):
  //   1. Evening CO-dominant K6 picks hit 0/10 (0.0%) in last 30 days of LIVE
  //      adaptive_tracking, vs BOX-dom 55.3% (38), PBURST-dom 46.7%, DGC-dom 44.4%.
  //   2. Evening rank-1 LIVE hit rate (46.2%) was LOWER than rank-2 (60.0%) —
  //      suggested engine mis-ordering evening picks at top of slate.
  //
  // Backtest verdict (30d, n=30 slates/scope, balanced mode, per-rank harness):
  //   • Parity guard PASSED — `evening_co_cut_parity` matched
  //     `intel_weights_midday_only_floor70` byte-for-byte across all rank +
  //     lift sections. Loader wiring verified.
  //   • Slate-rate gain real but small: evening 66.7% → 70.0% (cut_5) →
  //     73.3% (zero); Wilson CIs overlap completely (n=30 too small).
  //   • Rank-1 unchanged in both candidates (26.7% across all 4 configs).
  //     The original r1<r2 symptom DID NOT REPLICATE in the replay
  //     (baseline shows r1=r2=26.7%, not 46/60 from live AT).
  //   • Candidates actually WORSENED rank ordering: lifted r2 to 33.3%
  //     while r1 stayed flat, triggering harness "engine mis-orders top of
  //     slate" warning. Per-rank lens revealed slate-rate gain came from
  //     redistribution (r2/r3/r5 up; r4/r6 down — r4 dropped 20%→3.3% in
  //     `zero`) rather than better top-of-slate ranking.
  //   • Rail-matched pick lift regressed: evening 0.95 → 0.85 (cut_5) /
  //     0.87 (zero). Per CLAUDE.md dual-lens rule, candidate fails.
  //
  // Hypothesis post-mortem: the LIVE r1<r2 inversion may have been a
  // confound of mid-day regenerations + BUG-148 session shifts (cleaned
  // up 5/18). Re-check live AT in 24-48h with fresh post-cleanup data
  // before opening another sweep on this surface.
  //
  // Original hypothesis (preserved for context): reducing evening's CO
  // weight restores rank monotonicity at the top AND lifts slate hit rate,
  // without touching midday (own preset) or allday (intact).
  //
  // Baseline for comparison: `intel_weights_midday_only_floor70` — that preset
  // is the closest match to live production (2026-05-18 app_config snapshot:
  // global preset for evening + allday, midday on CONFIG-07 CO-heavy override,
  // pressure inversion on midday + evening, floor 70).
  //
  // Run order:
  //   1) BASELINE   npm run backtest:replay -- --days 30 --config intel_weights_midday_only_floor70
  //   2) PARITY     npm run backtest:replay -- --days 30 --config evening_co_cut_parity
  //                 Must match (1) bit-for-bit. If not, the presetByScope.evening
  //                 loader path is broken — abort before any conclusions.
  //   3) CANDIDATE  npm run backtest:replay -- --days 30 --config evening_co_cut_5
  //   4) BOOKEND    npm run backtest:replay -- --days 30 --config evening_co_zero
  //
  // Decision rule per [[feedback-engine-metric-dual-lens]] + CLAUDE.md:
  // ship only if candidate ≥ baseline on BOTH slate hit rate AND rank-matched
  // pick lift, OR explicit user override with rollback condition + review date.

  // evening_co_cut_parity — sanity guard. presetByScope.evening is set to the
  // EXACT global preset values, so the override is active but functionally a
  // no-op. Output MUST match `intel_weights_midday_only_floor70` byte-for-byte.
  // If it doesn't, the loader treats the new override path differently from
  // the omitted-fall-through path → abort.
  evening_co_cut_parity: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
      evening: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
      },
    },
  },

  // evening_co_cut_5 — primary candidate. Reduces evening CO weight from 13.5%
  // to 5.0%. Redistributes 8.5pp to BOX (+6pp) and PBURST (+2.5pp), keeps DGC
  // at 10%. Conservative — preserves CO presence (in case the 0% n=10 sample
  // is noise) while substantially de-weighting it. Conservative + aggressive
  // modes get proportional redistributions.
  evening_co_cut_5: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
      evening: {
        balanced:     { BOX: 0.555, PBURST: 0.295, CO: 0.050, DGC: 0.10 },
        conservative: { BOX: 0.700, PBURST: 0.150, CO: 0.050, DGC: 0.10 },
        aggressive:   { BOX: 0.475, PBURST: 0.345, CO: 0.080, DGC: 0.10 },
      },
    },
  },

  // evening_co_zero — aggressive bookend. CO weight = 0 on evening entirely.
  // Answers "is CO worth anything on evening, or is the 0/10 signal real?"
  // If this beats evening_co_cut_5, the dominant-signal data was directional;
  // if it loses, the n=10 was noise and 5% was the right call.
  evening_co_zero: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
      evening: {
        balanced:     { BOX: 0.590, PBURST: 0.310, CO: 0.000, DGC: 0.10 },
        conservative: { BOX: 0.740, PBURST: 0.160, CO: 0.000, DGC: 0.10 },
        aggressive:   { BOX: 0.520, PBURST: 0.380, CO: 0.000, DGC: 0.10 },
      },
    },
  },

  // ─────────────── 2026-05-18: ENH-DBL — Doubles allocation sweep [PARKED] ──
  //
  // STATUS: Killed 2026-05-18 after 3 hypotheses + 18 candidate runs.
  // ALL 11 configs in this block kept for reproducibility; do NOT ship.
  //
  // H1 (flat multiplicity prior boost): zero effect. Even +0.06 doubles
  //   prior produced 0 doubles in 30 slates. The swing is dwarfed by the
  //   absolute score gap (singles ~0.5-1.0, doubles ~0.10-0.20).
  // H2 (energy floor relaxation for doubles): floor=40 had zero effect
  //   (doubles can't reach 40th percentile). floor=0 admitted doubles to
  //   cap but tanked quality — midday rank-1 dropped 30%→10%, overall
  //   slate rate 75.6%→72.2%. Weak doubles polluted the slate.
  // H3 (selective top-N doubles bonus): bonuses up to +0.50 tested.
  //   +0.05/+0.10 had zero effect. +0.30/+0.50 moved some doubles in but
  //   per-rank still regressed (midday r1 30%→20%) and overall slate
  //   rate dropped 75.6%→74.4%. The strong doubles that did enter via
  //   the bonus weren't actually stronger predictors than the mid-rank
  //   singles they displaced.
  //
  // Conclusion: the diag-doubles "doubles hit 100% (n=8)" finding was
  // selection bias per [[feedback-signal-analysis-selected-vs-universe]].
  // Doubles ARE correctly suppressed by the scoring model — frequency-
  // weighted BOX + per-scope CO-heavy presets correctly rank them below
  // singles. The "leaving lift on the table" framing was wrong.
  //
  // The new optional EngineConfig fields stay (multiplicityPriors,
  // minEnergyThresholdByMultiplicity, doublesTopNBoost) — useful
  // infrastructure for any future per-multiplicity experiment.
  //
  // Original investigation context (preserved):
  //
  // diag-doubles smoke run (2026-05-18, 30d, balanced) surfaced three facts:
  //   • midday picked 0 doubles in 21 slates (CO=74% preset suppresses)
  //   • evening + allday picked 4 doubles each, enter K6 at mean rank 5.0
  //     (rail-relaxation passes 4-6, not signal alone)
  //   • Doubles hit 100% when picked (n=8, all scopes) vs singles 24-56%
  //
  // Two hypotheses for why doubles never bubble to top of slate:
  //   H1 — Multiplicity prior too punitive. engineCore.MULTIPLICITY_PRIORS
  //        currently penalizes doubles by -0.02 in the indicator score.
  //        Singles dominate the top-of-rank, doubles can't compete on score.
  //   H2 — Energy floor (minEnergyThreshold=70) filters doubles. Doubles
  //        cluster at low energy percentiles because frequency-weighted BOX
  //        scoring inherently down-scores them (~50% draw frequency of singles).
  //
  // Per [[feedback-scopes-separate-data]]: midday is a different problem than
  // evening/allday (CO-heavy preset, separate input slice). Per-scope variants
  // included to test whether midday needs a stronger boost than evening/allday.
  //
  // ALL baselines built atop `intel_weights_midday_only_floor70` (current
  // production parity, 2026-05-18 app_config snapshot).
  //
  // Run order:
  //   1) BASELINE   npm run backtest:replay -- --days 30 --config intel_weights_midday_only_floor70
  //   2) PARITY     npm run backtest:replay -- --days 30 --config dbl_parity
  //                 Must match (1) byte-for-byte. Loader sanity guard.
  //   3) H1 family  --config dbl_h1_doubles_neutral,dbl_h1_doubles_boost,dbl_h1_midday_strong_boost
  //   4) H2 family  --config dbl_h2_floor_doubles_0,dbl_h2_floor_doubles_40
  //   5) COMBINED   --config dbl_h1_h2_combined
  //
  // Decision rule: ship only if candidate ≥ baseline on BOTH slate hit rate
  // AND rank-matched pick lift (per CLAUDE.md). Per-rank section flags whether
  // candidates restore healthy monotonicity; the doubles count in CSV's
  // picks_doubles column shows whether the intervention actually moved doubles.

  // dbl_parity — sanity guard. multiplicityPriors set to engineCore default,
  // minEnergyThresholdByMultiplicity omitted (falls back to global floor 70).
  // Must match `intel_weights_midday_only_floor70` byte-for-byte.
  dbl_parity: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    // Identity prior — equals engineCore.MULTIPLICITY_PRIORS exactly.
    multiplicityPriors: { singles: 0.00, doubles: -0.02, triples: -0.04 },
  },

  // ── H1 family: prior boost ──────────────────────────────────────────────────
  // dbl_h1_doubles_neutral — zero the doubles penalty. Doubles get equal prior
  // to singles (0.00). Minimal change: tests "is the -0.02 penalty meaningful?"
  dbl_h1_doubles_neutral: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    multiplicityPriors: { singles: 0.00, doubles: 0.00, triples: -0.04 },
  },

  // dbl_h1_doubles_boost — active boost. Doubles get +0.03 (was -0.02, swing
  // of 0.05). Should lift doubles a few rank positions in the indicator sort
  // given typical normalized signal scores in 0-1 range.
  dbl_h1_doubles_boost: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    multiplicityPriors: { singles: 0.00, doubles: 0.03, triples: -0.04 },
  },

  // dbl_h1_midday_strong_boost — per-scope intervention. Midday picks 0
  // doubles because CO=74% preset suppresses; needs a stronger boost than
  // evening/allday which already pick some doubles via rail-relaxation.
  // Midday doubles get +0.06, evening/allday stay at +0.02 (modest active
  // boost). Per [[feedback-scopes-separate-data]] — different scopes, different
  // interventions.
  dbl_h1_midday_strong_boost: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    multiplicityPriorsByScope: {
      midday:  { singles: 0.00, doubles: 0.06, triples: -0.04 },
      evening: { singles: 0.00, doubles: 0.02, triples: -0.04 },
      allday:  { singles: 0.00, doubles: 0.02, triples: -0.04 },
    },
  },

  // ── H2 family: energy-floor relaxation for doubles only ────────────────────
  // dbl_h2_floor_doubles_0 — keep priors at default, remove floor entirely for
  // doubles. Tests "is the floor what's filtering doubles?" Singles + triples
  // stay at 70. (Triples disabled by rails.triplesOn=false anyway, so the
  // triples value is moot.)
  dbl_h2_floor_doubles_0: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    multiplicityPriors: { singles: 0.00, doubles: -0.02, triples: -0.04 },
    minEnergyThresholdByMultiplicity: { singles: 70, doubles: 0, triples: 70 },
  },

  // dbl_h2_floor_doubles_40 — modest relaxation. Doubles at 40 (vs 70 for
  // singles) — still filters bottom-40th-percentile doubles but allows the
  // 40-69th percentile range that the 70 floor blocks today.
  dbl_h2_floor_doubles_40: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    multiplicityPriors: { singles: 0.00, doubles: -0.02, triples: -0.04 },
    minEnergyThresholdByMultiplicity: { singles: 70, doubles: 40, triples: 70 },
  },

  // ── Combined H1 + H2 ──────────────────────────────────────────────────────
  // dbl_h1_h2_combined — neutral doubles prior (0.0) + zero floor for doubles.
  // The "both levers wide open" test. If this doesn't move doubles count up,
  // there's a third blocker (likely pair-rep-cap or that doubles intrinsically
  // score lower on weighted signals — not solvable by these two knobs).
  dbl_h1_h2_combined: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    multiplicityPriors: { singles: 0.00, doubles: 0.00, triples: -0.04 },
    minEnergyThresholdByMultiplicity: { singles: 70, doubles: 0, triples: 70 },
  },

  // ─────────── 2026-05-18: ENH-DBL-H3 — top-N doubles selective bonus ──────
  //
  // Third hypothesis after H1 (flat prior, no effect) and H2 (flat floor
  // relaxation, tanked quality). H1/H2 treated all doubles equally; H3
  // targets ONLY the few doubles already showing signal strength.
  //
  // Mechanism: after weighted-signal scoring, identify top-N doubles by
  // raw score, add `bonus` to their finalScores. Strong doubles compete
  // with mid-rank singles in the iteration order AND clear the energy floor
  // (which is computed from the post-bonus score pool). Weak doubles stay
  // suppressed.
  //
  // Knobs:
  //   topN  — how many of the 90 doubles in the universe get boosted
  //   bonus — additive score lift (typical signal scores fall in 0-1.0 range
  //           after weighted sum + normalization)
  //
  // Configs (all built on `intel_weights_midday_only_floor70` baseline):
  //
  //   dbl_h3_parity       — boost omitted, must match baseline byte-for-byte
  //   dbl_h3_top5_b05     — top 5 of 90 doubles get +0.05 (focused, gentle)
  //   dbl_h3_top10_b05    — top 10 get +0.05 (wider, same lift per pick)
  //   dbl_h3_top5_b10     — top 5 get +0.10 (focused, aggressive)
  //   dbl_h3_per_scope    — midday gets stronger boost (top 5 @ +0.10) since
  //                          CO=74% suppresses doubles harder; evening/allday
  //                          stay at top 5 @ +0.05
  //
  // Run order:
  //   1) BASELINE  npm run backtest:replay -- --days 30 --config intel_weights_midday_only_floor70
  //   2) PARITY    npm run backtest:replay -- --days 30 --config dbl_h3_parity
  //   3) SWEEP     --config dbl_h3_top5_b05,dbl_h3_top10_b05,dbl_h3_top5_b10,dbl_h3_per_scope
  //
  // Decision rule per CLAUDE.md: ship only if candidate ≥ baseline on BOTH
  // slate hit rate AND rank-matched pick lift. Per-rank section flags
  // monotonicity. CSV picks_doubles column shows actual doubles allocation.
  //
  // Watch for: did boosting strong doubles lift slate rates WITHOUT the
  // catastrophic midday r1 regression from H2-floor-0?

  dbl_h3_parity: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    // No doublesTopNBoost — must match baseline byte-for-byte. Loader sanity check.
  },

  dbl_h3_top5_b05: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoost: { topN: 5, bonus: 0.05 },
  },

  dbl_h3_top10_b05: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoost: { topN: 10, bonus: 0.05 },
  },

  dbl_h3_top5_b10: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoost: { topN: 5, bonus: 0.10 },
  },

  // ── ENH-DBL-H3 second pass (2026-05-18): bigger bonuses ──
  // First H3 sweep (top5_b05, top10_b05, top5_b10, per_scope) had ZERO effect
  // on doubles allocation — every candidate was bit-identical to baseline.
  // Score-gap analysis: midday top doubles ~0.10 vs mid-rank singles ~0.60;
  // evening/allday top doubles ~0.20 vs singles ~0.50. +0.10 bonus moves top
  // double from 0.10 → 0.20 (midday), still nowhere near singles. Need
  // 5-10× larger bonuses to test the mechanism at all.
  dbl_h3_top5_b30: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoost: { topN: 5, bonus: 0.30 },
  },
  dbl_h3_top5_b50: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoost: { topN: 5, bonus: 0.50 },
  },
  dbl_h3_top10_b30: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoost: { topN: 10, bonus: 0.30 },
  },

  // Per-scope: midday needs stronger boost since CO=74% preset suppresses
  // doubles harder than the global preset evening/allday use.
  dbl_h3_per_scope: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    doublesTopNBoostByScope: {
      midday:  { topN: 5, bonus: 0.10 },
      evening: { topN: 5, bonus: 0.05 },
      allday:  { topN: 5, bonus: 0.05 },
    },
  },

  // ─────────────── 2026-05-18: ENH-MET — per-scope energy floor [PARKED] ───
  //
  // STATUS: Null result 2026-05-18. Config kept for reproducibility; do NOT
  // ship. Full backtest report: `docs/min_energy_threshold_midday_backtest_2026-05-18.md`.
  //
  // Verdict: Δ slate hit rate = 0.0pp across all scopes (n=57). Isolation
  // check passed (evening + allday bit-identical between baseline and
  // candidate). Midday per-rank composition shifted meaningfully — r3 went
  // 8.8% → 17.5% with offsetting drops at r2/r4 — but slate-level netted to
  // identical hit count. The floor relaxation admitted DIFFERENT picks
  // (50-69th energy percentile band) but not BETTER picks; new admits
  // weren't winning slates that the baseline picks didn't already cover.
  //
  // Doubles allocation unchanged (0/57 on midday at both 70 and 50) —
  // confirms doubles score so low they can't reach floor 50 either, only
  // ~0 admits them (which ENH-DBL H2 already showed tanks quality).
  //
  // Lesson: the energy floor is NOT the bottleneck on midday performance.
  // The 13-22pp tuning headroom from investigation Appendix D is real but
  // lives elsewhere. Next per-scope candidates to try (per investigation
  // §7 item #5, after CONFIG-07 5/22 review): `pair_rep_cap_${scope}` or
  // `pressure_threshold_${scope}`. Energy floor is closed as a tuning
  // lever for midday.
  //
  // Original investigation context (preserved):
  //
  // Per the engine-split investigation (docs/engine_split_investigation_2026-05-18.md)
  // §7 Next Steps, items #1–2: extend per-scope override surface with
  // `min_energy_threshold_${scope}`, test a midday-only candidate at 50.
  //
  // Hypothesis: midday picks have ~13-22pp of underperformance beyond what
  // data volume explains (investigation Appendix D). CONFIG-07's CO=74%
  // midday preset selects CO-heavy picks, which often have low energy
  // percentiles because BOX frequency scoring (still 20.8%) penalizes them.
  // A floor of 50 (vs global 70) lets those CO-rich midday picks through
  // without affecting evening or allday (still at floor 70).
  //
  // Isolation property: evening and allday slate hit rates MUST be
  // unchanged. If they move, the per-scope override isn't isolating
  // correctly — abort before drawing conclusions.
  //
  // Built on top of `intel_weights_midday_only_floor70` (live production
  // parity). Only differs by `minEnergyThresholdByScope.midday = 50`.
  min_energy_midday_50: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    minEnergyThresholdByScope: { midday: 50 },
    // evening + allday intentionally omitted → fall back to global minEnergyThreshold=70
  },

  // BOX-heavy 3-signal model (DGC weight = 0).
  // Tests whether introducing DGC was a regression vs the older 3-signal model.
  legacy: {
    presets: {
      balanced:     { BOX: 0.55, PBURST: 0.30, CO: 0.15, DGC: 0.00 },
      conservative: { BOX: 0.75, PBURST: 0.15, CO: 0.10, DGC: 0.00 },
      aggressive:   { BOX: 0.45, PBURST: 0.35, CO: 0.20, DGC: 0.00 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250,
    minEnergyThreshold: 0,
    recentHitCooldown: 20,
    synergyOn: false,
    synergyWeight: 0.15,
  },
};
