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

  // ─── 2026-05-27: ENH-BOA — bestOrderFor realignment validation ─────────────
  // Production engine change: bestOrderFor now threads config.horizonWeights
  // through to its pair-blend (engineCore.blendPairAcrossHorizons), matching
  // the BOX dsRaw blend. Pre-change it always used the hardcoded
  // HORIZON_WEIGHTS const regardless of app_config.horizon_weights.
  //
  // The two configs below isolate the realignment effect from any other
  // config delta. Both reproduce the current production stack
  // (intel_weights_midday_only_floor70 base + pure-H01Y horizon blend +
  // CONFIG-07 midday CO-heavy preset + pressure inversion); they differ ONLY
  // in how bestOrderFor weights itself.
  //
  // Run order:
  //   1) BASELINE   npm run backtest:replay -- --days 30 --config ehnboa_prod_baseline
  //                 (simulates pre-realignment engine — bestOrderFor uses
  //                 HORIZON_WEIGHTS, BOX uses pure-H01Y per CONFIG-06)
  //   2) CANDIDATE  npm run backtest:replay -- --days 30 --config ehnboa_prod_aligned
  //                 (simulates post-realignment engine — both bestOrderFor
  //                 and BOX use pure-H01Y, matching app_config.horizon_weights)
  //
  // Decision rule per CLAUDE.md: ship only if CANDIDATE ≥ BASELINE on overall
  // straight + box hit rate. K6 selection is identical between the two by
  // design (only bestOrder differs) — total hit count should NOT diverge
  // (box matches are comboset-based, invariant) but straight/box SPLIT can.
  // If straights ≥ baseline on every scope, ship. If straights regress on
  // any scope, halt and document.
  ehnboa_prod_baseline: {
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
    horizonWeights: { H01Y: 1.0, H02Y: 0, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    bestOrderUseDefaultHorizonWeights: true,
  },
  ehnboa_prod_aligned: {
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
    horizonWeights: { H01Y: 1.0, H02Y: 0, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    // bestOrderUseDefaultHorizonWeights omitted → false (aligned behavior).
  },

  // ─── 2026-05-27: H01Y/H02Y blend sweep ─────────────────────────────────────
  // Hypothesis: pair tables only have H01Y+H02Y populated; production weights
  // H01Y at 100% and ignores H02Y. User confirmed both should contribute —
  // find the ratio. All four configs inherit ehnboa_prod_aligned base; ONLY
  // horizonWeights differ.
  //
  // Run order:
  //   1) BASELINE   --config ehnboa_prod_aligned
  //   2) PARITY     --config hw_h01_h02_parity
  //                 Must match baseline byte-for-byte. Sanity guard.
  //   3) CANDIDATES --config hw_h01_70_h02_30,hw_h01_60_h02_40,hw_h01_50_h02_50
  //
  // Decision rule per CLAUDE.md dual-lens: ship best candidate only if it
  // beats baseline on BOTH overall slate hit rate AND rank-1 lift.
  hw_h01_h02_parity: {
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
    horizonWeights: { H01Y: 1.0, H02Y: 0, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
  },

  hw_h01_70_h02_30: {
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
    horizonWeights: { H01Y: 0.70, H02Y: 0.30, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
  },

  hw_h01_60_h02_40: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
  },

  hw_h01_50_h02_50: {
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
    horizonWeights: { H01Y: 0.50, H02Y: 0.50, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
  },

  // ─── 2026-05-27: ENH-TDB — times_drawn horizon-blend sweep ─────────────────
  // First H01Y/H02Y ratio sweep proved horizonWeights had no effect because
  // the only horizon-blended value (ds_raw) is invariant across horizons by
  // construction (days-since-last-hit doesn't depend on lookback window).
  // ENH-TDB adds horizon-blended times_drawn for BOX + pair, gated on
  // `timesDrawnHorizonBlend: true`.
  //
  // Legacy behavior was inconsistent: BOX times_drawn = MAX across horizons
  // (effectively H02Y-only since H02Y is a superset window), pair times_drawn
  // = H01Y-only. The blend path applies horizon_weights uniformly to both.
  //
  // No clean parity guard: ANY blend setting diverges from legacy. tdblend_h02_only
  // matches legacy BOX (H02Y) but not legacy pair (legacy pair = H01Y).
  // tdblend_h01_only does the opposite. Both are diagnostic bookends.
  //
  // Run order:
  //   1) BASELINE   --config ehnboa_prod_aligned (legacy inconsistent path)
  //   2) BOOKENDS   --config tdblend_h01_only,tdblend_h02_only
  //   3) BLENDS     --config tdblend_h01_70_h02_30,tdblend_h01_60_h02_40,tdblend_h01_50_h02_50
  //
  // Decision rule per CLAUDE.md dual-lens: ship best candidate only if it
  // beats baseline on BOTH overall slate hit rate AND rank-1 lift.
  tdblend_h01_only: {
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
    horizonWeights: { H01Y: 1.0, H02Y: 0, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  tdblend_h02_only: {
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
    horizonWeights: { H01Y: 0, H02Y: 1.0, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  tdblend_h01_70_h02_30: {
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
    horizonWeights: { H01Y: 0.70, H02Y: 0.30, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  tdblend_h01_60_h02_40: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  tdblend_h01_50_h02_50: {
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
    horizonWeights: { H01Y: 0.50, H02Y: 0.50, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── 2026-05-27: midday DGC re-enablement sweep ──────────────────────────────
  // Hypothesis: CONFIG-07's intel-tuned weights zeroed midday DGC because the
  // AUC fit (4/13–5/8) said DGC had no predictive lift. That fit ran against
  // legacy MAX/H01Y mixed-horizon BOX scoring + stale pair data. Under
  // CONFIG-08 + fresh pair data (post 2026-05-27 rebuild), DGC's recurrence-
  // consistency signal may behave differently — today's midday slate showed
  // wildly erratic DGC values (0.019 – 0.668) because the engine doesn't
  // optimize for it. Test re-enabling DGC at 5/10/15% by carving from CO.
  //
  // Baseline: tdblend_h01_60_h02_40 (current production parity, CONFIG-08 live).
  // Parity guard: dgc_midday_parity is identical to baseline; must match
  // byte-for-byte. If not, the loader is broken — abort before drawing
  // conclusions.
  //
  // All candidates only modify midday's preset. Evening + allday inherit
  // the global preset unchanged.
  //
  // Run order:
  //   1) BASELINE   --config tdblend_h01_60_h02_40
  //   2) PARITY     --config dgc_midday_parity
  //   3) CANDIDATES --config dgc_midday_5,dgc_midday_10,dgc_midday_15
  //
  // Decision rule per CLAUDE.md dual-lens: ship only if winner beats baseline
  // on BOTH midday slate hit rate AND midday rail-matched pick lift. Evening
  // and allday should not change (no scope override applied) — flag if they do.
  dgc_midday_parity: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.740, DGC: 0.000 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.616, DGC: 0.000 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.810, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  dgc_midday_5: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.690, DGC: 0.050 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.566, DGC: 0.050 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.760, DGC: 0.050 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  dgc_midday_10: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  dgc_midday_15: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.590, DGC: 0.150 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.466, DGC: 0.150 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.660, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── 2026-05-27: allday DGC sweep ────────────────────────────────────────────
  // Hypothesis: CONFIG-08 backtest revealed allday's r5=55.2% > r1=41.4% — the
  // engine systematically puts the strongest pick at rank 5 instead of rank 1
  // (same pattern CONFIG-09 just fixed for midday). Allday currently uses the
  // global preset (DGC=10) — test DGC=5/15/20 carved from CO to find the
  // weight that restores monotonic top-of-slate ordering.
  //
  // Baseline: tdblend_h01_60_h02_40 (current production, allday inherits global
  // DGC=10). Parity guard: dgc_allday_parity uses an explicit allday override
  // at the same values; must match baseline byte-for-byte. If not, the loader
  // is broken — abort before drawing conclusions.
  //
  // All candidates modify ONLY allday. Midday inherits CONFIG-09 (DGC=10);
  // evening inherits global (DGC=10).
  //
  // Run order:
  //   1) BASELINE   --config tdblend_h01_60_h02_40
  //   2) PARITY     --config dgc_allday_parity
  //   3) CANDIDATES --config dgc_allday_5,dgc_allday_15,dgc_allday_20
  //
  // Decision rule per CLAUDE.md dual-lens: ship only if winner beats baseline
  // on BOTH allday slate hit rate AND allday rail-matched pick lift, AND
  // restores r1 > r5 ordering. Midday + evening should not change (no
  // override applied to those scopes).
  dgc_allday_parity: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.100 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.100 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.100 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  dgc_allday_5: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.185, DGC: 0.050 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.140, DGC: 0.050 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.230, DGC: 0.050 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  dgc_allday_15: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  dgc_allday_20: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.035, DGC: 0.200 },
        conservative: { BOX: 0.675, PBURST: 0.085, CO: 0.040, DGC: 0.200 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.080, DGC: 0.200 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── 2026-05-27: ENH-AFL-2 adaptive signal weights ──────────────────────────
  // Layer Option β adaptive adjustment on top of current production
  // (dgc_allday_15 ≈ CONFIG-08 + CONFIG-09 + CONFIG-10).
  //
  // Baseline: dgc_allday_15 (current production parity, no adaptive).
  // Parity guard: adaptive_parity has flag enabled at α=0, must match baseline
  //   byte-for-byte (α=0 makes the (1 + α × (auc−0.5)) factor degenerate to 1).
  //
  // Run order:
  //   1) BASELINE   --config dgc_allday_15
  //   2) PARITY     --config adaptive_parity
  //   3) CANDIDATES --config adaptive_alpha_05,adaptive_alpha_10,adaptive_alpha_15
  //
  // Decision rule per CLAUDE.md dual-lens: ship winning α only if it beats
  // baseline on BOTH overall slate hit rate AND rail-matched pick lift.
  // Out-of-sample sanity: examine last 14 days separately from the 16-day
  // warmup window since AUC is freshest on the most recent days.
  adaptive_parity: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    adaptiveSignalWeights: { enabled: true, alpha: 0 },
  },

  adaptive_alpha_05: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    adaptiveSignalWeights: { enabled: true, alpha: 0.5 },
  },

  adaptive_alpha_10: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    adaptiveSignalWeights: { enabled: true, alpha: 1.0 },
  },

  adaptive_alpha_15: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    adaptiveSignalWeights: { enabled: true, alpha: 1.5 },
  },

  // ─── CONFIG-11a (2026-06-06): evening per-scope CO boost ────────────────────
  // Evening is the only live scope without a per-scope weights override —
  // inherits the global preset (CO 13.5%) while absorbing the 5/27 horizon
  // collapse to H01Y:60/H02Y:40. Performance era-split shows evening box rate
  // -4.7pp and slate rate -16pp after the 5/27 ship, while midday (with its
  // CO=64% override) gained +6.8pp box / +16pp slate.
  //
  // Engine screen 30-day rolling AUC: evening CO = 0.617 (highest of any
  // signal in any scope), evening BOX = 0.585, evening PBURST = 0.538,
  // evening DGC = 0.483 (anti-predictive but recovered at the slate-rate
  // lens per the dual-lens pattern). The 13.5% global CO weight is well
  // below where the universe-AUC says the signal lives.
  //
  // CONFIG-11a balances evening toward CO without abandoning BOX dominance:
  //   BOX 49.5 → 45.0  (-4.5pp)   still primary
  //   PBURST 27.0 → 22.0  (-5.0pp) middle-weight
  //   CO 13.5 → 23.0      (+9.5pp) closer to AUC strength
  //   DGC 10.0 → 10.0     unchanged
  // Sum = 100% ✓. Mirrors the per-scope override pattern used for midday
  // and allday. Conservative + aggressive entries shifted proportionally
  // following the dgc_allday_15 derivation; production is balanced-only
  // (SCRUB-01) so those modes are not exercised in prod.
  //
  // Baseline:  dgc_allday_15 (production parity post-5/27)
  // Candidate: evening_co_boost_23 (this preset)
  // Ship gate: candidate evening box AND slate rate ≥ baseline,
  //            no other scope drops > 2pp on either lens.
  // CONFIG-11a alternate (2026-06-06): less aggressive CO boost. The CO=23%
  // candidate redistributed evening hits dramatically (r1: 17.2% → 31.0%
  // resolving the r1<r2 inversion) but dipped overall pick rate by 1.1pp
  // (within noise but failing the strict ship gate). CO=20% softens the
  // bet — proportional shave from global default (BOX 49.5 / PBURST 27 /
  // CO 13.5 / DGC 10) of just 6.5pp instead of 14.5pp. If r1 lift holds at
  // a smaller magnitude AND aggregate pick rate stays ≥ baseline, this is
  // the strict-gate-passing variant.
  evening_co_boost_20: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  evening_co_boost_23: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.220, CO: 0.230, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.090, CO: 0.180, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.265, CO: 0.275, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── CONFIG-12 candidates (2026-06-06): pressure_threshold sweep ────────────
  // Live pressure_threshold=250 sits above where hits actually live. Intelligence
  // screen 30-day evidence:
  //   draws_since 0-30   : 1,460 picks, 8.42% hit
  //   draws_since 31-100 :    60 picks, 13.33% hit
  //   draws_since 101-200:    10 picks, 30.00% hit  ← sweet spot
  //   draws_since 201-365:   215 picks, 21.40% hit
  //   draws_since 365+   :    17 picks, 35.29% hit  ← outlier, small n
  // Current threshold (250) only bonuses picks above the 250-day band,
  // missing the 101-249 zone where hit rate peaks. CONFIG-12 sweeps 100,
  // 150, 200 to map the response curve; pick the strict-gate winner.
  //
  // All three clone `evening_co_boost_20` (the new production-parity
  // baseline post-CONFIG-11a) and change ONLY pressureThreshold. This is
  // a GLOBAL change (no per-scope override path) — backtest gate must
  // show ≥ baseline on ALL three scopes, not just average. Earliest ship
  // is 2026-06-13 after CONFIG-11a 7-day review ratifies.
  pressure_100: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  pressure_150: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 150, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  pressure_200: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 200, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── CONFIG-13 candidates (2026-06-06): min_energy_threshold sweep ──────────
  // Live min_energy_threshold = 70 (shipped pre-CONFIG-08 era). Intelligence
  // screen 30-day evidence (PRE-CONFIG-11a/12 — see backtest interpretation
  // caveat below):
  //   energy band 0-50    :    4 picks, 100% hit (n too small)
  //   energy band 66-75   :    6 picks,   0% hit (n too small)
  //   energy band 76-85   :   20 picks,  15% hit
  //   energy band 86-95   :  279 picks, 4.66% hit  ← underperformer
  //   energy band 96-100  : 2463 picks, 9.34% hit  ← carries the load
  // The 86-95 band drags the overall hit rate. CONFIG-13 raises the floor
  // to strip it, concentrating K6 selection in the higher-confidence 96+
  // band where hit rates are ~2x better. Risk: rail-relax passes have to
  // fire more often (smaller candidate pool); backtest will surface.
  //
  // Three candidates clone `pressure_100` (current production parity post
  // CONFIG-11a + CONFIG-12) and change ONLY minEnergyThreshold. Caveat:
  // the live-data energy distribution was measured PRE-CONFIG-11a/12, so
  // the 86-95 vs 96-100 gap may have shifted under the new signal weights
  // + pressure threshold. This backtest tests whether the evidence still
  // holds; ship only if it does.
  //
  // Earliest ship: post-2026-06-13 review of CONFIG-11a + CONFIG-12.
  // CONFIG-13 affects ALL THREE scopes uniformly — worst attribution
  // profile of any candidate this cycle — so ship gates must clear on
  // every per-scope metric AND not just average.
  energy_floor_80: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 80, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  energy_floor_86: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 86, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── Synergy threshold sweep (2026-06-06): re-attempt after dead-band ─────
  // Original synergy sweep (synergy_010/015/020, weight values 0.10/0.15/0.20
  // at threshold 0.65) all produced byte-identical output — every K6-eligible
  // pick has ≥2 of 4 signals above 0.65, so the multiplicative bonus applies
  // uniformly and doesn't re-order. Engine investigation: production threshold
  // 0.65 is too lenient; top-30 hits average BOX 0.88 / PBURST 0.77 / CO 0.71 /
  // DGC 0.74, all comfortably above. Raising threshold makes the bonus
  // selective — only the elite picks qualify, so they out-rank mid-tier picks.
  //
  // synergyThreshold + synergyMinCount fields added to EngineConfig (types.ts)
  // and replay.ts (was hardcoded 0.65 / 2). Defaults preserve prod parity.
  // Production engine (engines/zk6.ts:1041) still has hardcoded 0.65 / 2 —
  // if a candidate wins the backtest, a follow-up commit parameterizes via
  // app_config keys (synergy_boost_threshold, synergy_boost_min_count) then
  // SQL ships the chosen values.
  //
  // Weight pinned at 0.15 (the configured default). Sweep is over threshold
  // and minCount only.
  synergy_t075: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.15, synergyThreshold: 0.75, synergyMinCount: 2,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  synergy_t080: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.15, synergyThreshold: 0.80, synergyMinCount: 2,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  synergy_t085: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.15, synergyThreshold: 0.85, synergyMinCount: 2,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // The lib/engineCore.computeWeightedScore "all 4 above 0.65" formula — never
  // called in prod, but worth testing as a fourth candidate.
  synergy_strict4: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.15, synergyThreshold: 0.65, synergyMinCount: 4,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── doublesTopNBoost sweep (2026-06-06): ENH-DBL-H3 re-test atop new baseline
  // The mechanism is HARNESS-ONLY — not in engines/zk6.ts or the edge fn.
  // ENH-DBL-H3 originally backtested it in 5/18 atop the pre-CONFIG-08
  // baseline; results were never ported to production. Important properties:
  //   - Additive bonus on top of weighted-signal score (re-orders, unlike
  //     synergy's uniform multiplier)
  //   - Applied to top-N doubles by score, BEFORE energy percentile and rank
  //     sort — bonused doubles get TWO advantages (clear floor + rank lift)
  //   - Per-scope override available (doublesTopNBoostByScope)
  //
  // Parked-memory finding from 5/18: "midday picks 0 doubles in 21 slates,
  // evening+allday doubles hit 100% but only at mean rank 5.0" — doubles
  // hit when picked but rarely picked at top ranks. ENH-DBL-H3 attempts to
  // pull strong doubles into K6 at higher ranks.
  //
  // These three candidates clone pressure_100 (new production parity post
  // CONFIG-11a + CONFIG-12) and add doublesTopNBoost at increasing bonus
  // magnitudes. If a candidate wins, the mechanism would need to be ported
  // to engines/zk6.ts + compute-slate-zk6/index.ts + new app_config keys —
  // bigger lift than a config tweak. Test first; commit to porting only if
  // backtest justifies it.
  dbl_top5_b005: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    doublesTopNBoost: { topN: 5, bonus: 0.05 },
  },

  dbl_top5_b010: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    doublesTopNBoost: { topN: 5, bonus: 0.10 },
  },

  dbl_top5_b020: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    doublesTopNBoost: { topN: 5, bonus: 0.20 },
  },

  // ─── Synergy weight sweep (2026-06-06): r1<r2 inversion attack ─────────────
  // Live synergy_boost_on=false, synergy_boost_weight=0.15 (configured but
  // dormant). Synergy adds an indicator-score bonus when ≥2 signals are
  // simultaneously above 0.70 — rewards multi-signal alignment over single-
  // dominant-signal picks. Hypothesis: r1<r2 inversion persists across all
  // scopes because the indicator-sort puts a high-mono-signal pick at r1
  // while a more-balanced pick at r2 actually hits more often. Synergy
  // re-orders to favor balanced picks.
  //
  // Three candidates clone pressure_100 (current production parity post
  // CONFIG-11a + CONFIG-12) and flip synergyOn=true with varying weight.
  // Fingerprint showed selected picks already avg signal >0.7 across the
  // board, so synergy bonus may not differentiate much — backtest reveals
  // whether the effect is real.
  //
  // Earliest ship: post-2026-06-13 review of CONFIG-11a + CONFIG-12.
  // Scoring-math change with wider blast radius than per-scope weight
  // tweaks; ship gates strict on every per-scope metric.
  synergy_010: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.10,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  synergy_015: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  synergy_020: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: true, synergyWeight: 0.20,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  energy_floor_90: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 90, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── WARMING v1 (2026-06-06): drop DGC, add 7-day cross-jurisdiction signal ─
  // Combines two findings from today's session:
  //   1. DGC anti-predictive in all scopes (28d AUC 0.43-0.49) → zero out
  //   2. prior_7d_draws predicts same-day multi-draw with 3-10× lift over
  //      baseline (60d n=2955 evidence in ENH-WARMING-2026-06-06)
  //
  // DGC weight slot becomes the WARMING weight slot, scope-by-scope:
  //   midday  DGC 10% → WARMING 10%
  //   evening DGC 10% → WARMING 10%
  //   allday  DGC 15% → WARMING 15%
  //
  // Hypothesis: WARMING captures the {1,5,7} case (drawn 28x prior 7d, then
  // drew 4× on 6/5) that BOX/PBURST/CO/DGC all missed. Sign reads on the
  // multi-drawn singles from 6/5 are dominant; 60d evidence is monotonic.
  //
  // Risk: WARMING may correlate with BOX freq (high-freq combos also burst).
  // If correlation is high, lift will be illusory. AUC + rank-correlation
  // analysis pending — current preset is the empirical first probe.
  warming_v1: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.00 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.00 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.00 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.00 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.00 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.00 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.00 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.00 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.00 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.00 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.00 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.00 },
      },
    },
    timesDrawnHorizonBlend: true,
    warmingWindowDays: 7,
    warmingWeightByScope: { midday: 0.10, evening: 0.10, allday: 0.15 },
  },

  // ─── WARMING v2 (2026-06-06): scope-matched history filter ────────────────
  // v1 result (cross-session): overall -1.1pp slate, midday r1 collapsed
  // 24.1 → 10.3, allday -6.9pp slate. Hypothesis: counting prior-7d draws
  // across ALL sessions polluted the midday/evening signal. The engine's
  // existing datasets_box/_pair already filter by session for midday/evening
  // — warming should match that pattern.
  //
  // v2 changes ONE thing vs v1: warmingScopeMatched = true.
  // - midday slate's warming counts prior-7d MIDDAY draws only
  // - evening slate's warming counts prior-7d EVENING draws only
  // - allday slate's warming counts everything (unchanged)
  //
  // If v2 fixes midday/allday while preserving the evening +6.9pp gain, the
  // scope-mismatch hypothesis is confirmed. If midday/allday still hurt,
  // WARMING is dominated by BOX freq and the audit needs falsification update.
  warming_v2: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.00 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.00 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.00 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.00 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.00 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.00 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.00 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.00 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.00 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.00 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.00 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.00 },
      },
    },
    timesDrawnHorizonBlend: true,
    warmingWindowDays: 7,
    warmingScopeMatched: true,
    warmingWeightByScope: { midday: 0.10, evening: 0.10, allday: 0.15 },
  },

  // ─── WARMING evening-only (2026-06-06): isolate the only working signal ───
  // v1 + v2 both surfaced the same pattern: midday + allday regress, evening
  // gains. v1 evening +10.3pp slate, v2 evening +6.9pp slate. Both outside
  // ±1.7pp noise. This preset isolates that win by setting WARMING weight to
  // 0 on midday + allday (those scopes are unchanged from baseline) and
  // keeping 10% on evening only.
  //
  // Uses cross-session warming for evening (matches v1's evening result, which
  // was stronger than v2's). Evening scope's warming counts all national draws
  // in the prior 7 days — same {1,5,7} story that motivated the investigation.
  //
  // DGC stays at 0 on evening (matched to v1/v2). Midday + allday retain DGC
  // at baseline levels (10% + 15%) since we're not touching them.
  warming_evening_only: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.00 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.00 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.00 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    warmingWindowDays: 7,
    warmingScopeMatched: false,
    warmingWeightByScope: { midday: 0.00, evening: 0.10, allday: 0.00 },
  },

  // ─── MIDDAY popularity-penalty signal (2026-06-06) ──────────────────────────
  // After midday CO sweep falsified the "reweight" approach, this preset adds
  // a NEW derived signal targeting the doubly-popular interaction directly.
  // popPenalty[i] = (TD[i]/maxTD) × normCo[i], max-normed, subtracted with
  // weight 0.15 on midday only. Phase A test — multiplicative smooth variant.
  // If null result, try thresholded variants (B/C in audit). All other config
  // including midday baseline weights UNCHANGED.
  midday_pop_penalty_v1: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    popularityPenaltyWeightByScope: { midday: 0.15, evening: 0.00, allday: 0.00 },
  },

  // ─── MIDDAY CO investigation (2026-06-06) ──────────────────────────────────
  // Midday is structurally different from allday:
  //   - Allday CO weight was 8.5% (small) → zeroing was a small indicator shift
  //   - Midday CO weight is 64% (largest in system) → zeroing is a MAJOR restructure
  // Two competing theories:
  //   A. CO is a popularity trap on midday too (same as allday) — zero helps
  //   B. CO is a noise smoother — without it, BOX freq dominates and picks
  //      the popularity ceiling MORE aggressively
  // Run both midday_co_zero AND midday_co_modest to see the response curve.
  // Bar for ship: outside ±1.7pp noise, r1 preserved, no scope regression > 2pp.

  // Full zero — proportional redistribution. CO 64 → 0; scale 100/36 = 2.778
  // applied to BOX 20.8, PBURST 5.2, DGC 10. Result: BOX 57.8 / PBURST 14.4 /
  // DGC 27.8 / CO 0. Major flip away from CO dominance to BOX dominance.
  midday_co_zero: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.578, PBURST: 0.144, CO: 0.000, DGC: 0.278 },
        conservative: { BOX: 0.752, PBURST: 0.071, CO: 0.000, DGC: 0.177 },
        aggressive:   { BOX: 0.483, PBURST: 0.172, CO: 0.000, DGC: 0.345 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // Modest reduction. CO 64 → 30 (34pp redistributed). Scale 34/36 = 0.944 of
  // residual capacity applied to BOX 20.8, PBURST 5.2, DGC 10. Result:
  // BOX 40.4 / PBURST 10.1 / CO 30 / DGC 19.4.
  // Less radical than zero, preserves CO's smoothing role.
  midday_co_modest: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.404, PBURST: 0.101, CO: 0.300, DGC: 0.195 },
        conservative: { BOX: 0.508, PBURST: 0.046, CO: 0.300, DGC: 0.146 },
        aggressive:   { BOX: 0.342, PBURST: 0.122, CO: 0.300, DGC: 0.236 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── ALLDAY CO=0 investigation (2026-06-06): test the anti-CO finding ─────
  // 60d on-slate evidence: allday CO-low (<0.5) picks hit at 90.3% (n=154),
  // CO-high (≥0.5) picks hit at 45.8% (n=155). 44.5pp gap, monotonic.
  // Same anti-pattern present (smaller) on evening + midday but ALLDAY shows
  // it most strongly. Engine's CO weight on allday is currently 8.5% positive
  // — the data says it should be 0 or negative.
  //
  // CAVEAT: analysis was on on_slate=true picks (selection-biased). This
  // backtest is the disambiguator — if candidate beats baseline, CO is
  // genuinely anti-predictive. If candidate ties or regresses, the on-slate
  // finding was forced by rail constraints filling spare slots with diverse
  // low-CO combos that happened to be good for OTHER reasons.
  //
  // Reallocation: allday CO 8.5pp → 0. Proportionally scale remaining
  // BOX/PBURST/DGC to sum to 100. Midday + evening untouched (their CO weights
  // are higher and matter more for those scopes; CONFIG-11a evening review
  // window still open).
  //
  // balanced allday  scale 100/91.5  = 1.0929 → BOX 54.1 / PBURST 29.5 / DGC 16.4
  // conservative     scale 100/96.0  = 1.0417 → BOX 70.3 / PBURST 14.1 / DGC 15.6
  // aggressive       scale 100/87.0  = 1.1494 → BOX 46.6 / PBURST 36.2 / DGC 17.2
  allday_co_zero: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        conservative: { BOX: 0.703, PBURST: 0.141, CO: 0.000, DGC: 0.156 },
        aggressive:   { BOX: 0.466, PBURST: 0.362, CO: 0.000, DGC: 0.172 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── WARMING isolation (2026-06-06): WARMING on evening, DGC stays at 10 ──
  // warming_evening_only bundled two changes: DGC 10→0 AND WARMING 0→10 on
  // evening. The backtest +10.3pp slate could be either lever. This preset
  // isolates WARMING by keeping evening DGC at 10%. If this preset still
  // beats baseline by >2pp on evening, WARMING is doing the work. If it ties
  // baseline, the DGC drop was the lever.
  warming_evening_only_keep_dgc: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    warmingWindowDays: 7,
    warmingScopeMatched: false,
    warmingWeightByScope: { midday: 0.00, evening: 0.10, allday: 0.00 },
  },

  // ─── DGC drop candidate (2026-06-06): zero out the anti-predictive signal ──
  // Phase 1 fix (LEARN-01 + HIT-DET-01) cleaned signal_auc_per_day. 28d AUC:
  //   DGC midday 0.430 / evening 0.485 / allday 0.454 — anti-predictive in ALL
  //   BOX strongest on allday (0.594); CO strongest on midday (0.596) + evening (0.615)
  //
  // Hypothesis: DGC's 10% (midday/evening) / 15% (allday) weight is actively
  // dragging hit rate down. Drop DGC to 0; redistribute weight to remaining
  // signals proportional to their current allocation (no new bets, just
  // remove the dead-weight signal).
  //
  // Allocation math = scale remaining 3 signals to sum to 1.0:
  //   midday  scale 100/90  = 1.111  → BOX 23.1 / PBURST 5.8 / CO 71.1
  //   evening scale 100/90  = 1.111  → BOX 50.0 / PBURST 27.8 / CO 22.2
  //   allday  scale 100/85  = 1.176  → BOX 58.2 / PBURST 31.8 / CO 10.0
  //   global  scale 100/90  = 1.111  → BOX 55.0 / PBURST 30.0 / CO 15.0
  //
  // Ship gate (when 6/13 review window closes and this becomes a candidate):
  //   candidate ≥ baseline on slate AND pick rate, no scope > 2pp regression,
  //   r1 hit rate per scope preserved (per Lever-2 lesson).
  dgc_cut_v1: {
    presets: {
      balanced:     { BOX: 0.550, PBURST: 0.300, CO: 0.150, DGC: 0.00 },
      conservative: { BOX: 0.750, PBURST: 0.150, CO: 0.100, DGC: 0.00 },
      aggressive:   { BOX: 0.450, PBURST: 0.350, CO: 0.200, DGC: 0.00 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.231, PBURST: 0.058, CO: 0.711, DGC: 0.000 },
        conservative: { BOX: 0.390, PBURST: 0.036, CO: 0.574, DGC: 0.000 },
        aggressive:   { BOX: 0.156, PBURST: 0.056, CO: 0.788, DGC: 0.000 },
      },
      evening: {
        balanced:     { BOX: 0.500, PBURST: 0.278, CO: 0.222, DGC: 0.000 },
        conservative: { BOX: 0.700, PBURST: 0.128, CO: 0.172, DGC: 0.000 },
        aggressive:   { BOX: 0.400, PBURST: 0.328, CO: 0.272, DGC: 0.000 },
      },
      allday: {
        balanced:     { BOX: 0.582, PBURST: 0.318, CO: 0.100, DGC: 0.000 },
        conservative: { BOX: 0.794, PBURST: 0.159, CO: 0.047, DGC: 0.000 },
        aggressive:   { BOX: 0.476, PBURST: 0.371, CO: 0.153, DGC: 0.000 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── AFL re-test (2026-06-06): adaptive feedback loop on clean AUC data ────
  // Original ENH-AFL conclusion (5/27) was flag-OFF because backtest showed
  // no lift. Source data (signal_auc_per_day) was contaminated by the
  // canonical-row filter bug fixed in Phase 1 last night (LEARN-01) and the
  // missing result_at stamps for misses (HIT-DET-01). Both fixed 2026-06-06.
  //
  // 28-day post-Phase-1 AUC shows real gradient:
  //   DGC anti-predictive in ALL scopes (mean AUC 0.43-0.49)
  //   CO strongest on midday (0.596) + evening (0.615)
  //   BOX strongest on allday (0.594)
  //
  // Hypothesis: AFL alpha=1.0 layered on evening_co_boost_20 (production-
  // parity baseline) now produces lift the contaminated test couldn't see.
  // Same preset shape as evening_co_boost_20 + adaptiveSignalWeights on.
  evening_co_boost_20_afl_10: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    adaptiveSignalWeights: { enabled: true, alpha: 1.0 },
  },

  // Softer AFL variant — alpha=0.5 halves the gradient pull. Tests whether the
  // alpha=1.0 result (allday +3.5pp slate, midday -3.4pp slate) was an over-
  // correction. If midday flattens (no loss) and allday holds gain, alpha=0.5
  // becomes the ship candidate.
  evening_co_boost_20_afl_05: {
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
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
    adaptiveSignalWeights: { enabled: true, alpha: 0.5 },
  },

  // ─── Lever 2 investigation (2026-06-06): evening pressure weight neutral ────
  // ⛔ FALSIFIED 2026-06-06 — DO NOT SHIP. Kept for audit-trail reference only.
  //
  // Hypothesis was: evening's box_pressure_weight = -0.40 miscalibrated based on
  // 60-day daily_intelligence bucket hit rates (<50 ds = 9.41%, 100-149 = 33%).
  // 30d backtest showed total pick-hits +6 but r1 rate degraded -6.9pp
  // (34.5% → 27.6%) AND introduced a new r1<r2 rank-ordering inversion.
  // The negative pressure weight is doing real work strengthening rank-1
  // ordering. Lesson: selected-pick bucket hit rates can't justify a per-scope
  // weight sign flip — only full backtest can. Reinforces feedback_signal_
  // analysis_selected_vs_universe.
  evening_pressure_neutral: {
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.090, DGC: 0.10 },
      aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.180, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 250, minEnergyThreshold: 70, recentHitCooldown: 20,
    synergyOn: false, synergyWeight: 0.15,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: 0.00, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.351, PBURST: 0.032, CO: 0.516, DGC: 0.100 },
        aggressive:   { BOX: 0.140, PBURST: 0.050, CO: 0.710, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.450, PBURST: 0.250, CO: 0.200, DGC: 0.100 },
        conservative: { BOX: 0.630, PBURST: 0.115, CO: 0.155, DGC: 0.100 },
        aggressive:   { BOX: 0.360, PBURST: 0.295, CO: 0.245, DGC: 0.100 },
      },
      allday: {
        balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.085, DGC: 0.150 },
        conservative: { BOX: 0.675, PBURST: 0.135, CO: 0.040, DGC: 0.150 },
        aggressive:   { BOX: 0.405, PBURST: 0.315, CO: 0.130, DGC: 0.150 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── TRUE production parity as of 2026-06-09 23:59 UTC (post-CONFIG-15) ─────
  // Replaces evening_co_boost_20 as the parity baseline. Captures the full live
  // app_config + engine state after the 2026-06-09 session:
  //   - CONFIG-12: pressure_threshold 100 (global; verified dormant on the
  //     post-DATA-01 ds_raw scale — p95 ≈ 24, nothing reaches the 100+ zone)
  //   - CONFIG-14: allday  {BOX:54.1, PBURST:29.5, CO:0, DGC:16.4}
  //   - CONFIG-15: evening {BOX:56.25, PBURST:31.25, CO:0, DGC:12.5}
  //   - CONFIG-13 REVERT: warming OFF (no warming fields)
  //   - ENG-BLOCK-NARROW-01: today-only winner block → excludeYesterdayHits:false
  //   - recent_hit_cooldown_midday = 10 (CONFIG-05)
  // NOTE: production is balanced-only (SCRUB-01/02); conservative/aggressive
  // below mirror balanced — placeholders for the harness type, never shipped.
  // ENG-OBS-06 (2026-06-10): modelDisplayReorder:true — per-rank r1–r6 numbers
  // now reflect the production ds-desc + per-scope-tiebreak ordering and ARE
  // comparable to live post-reorder rank metrics. (The first run of this preset
  // on 2026-06-10, pre-flag, was selection-ordered: overall 85.1%, midday
  // 75.9%, evening 89.7%, allday 89.7% — slate/pick rates unaffected by the flag.)
  prod_parity_2026_06_09: {
    modelDisplayReorder: true,
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      aggressive:   { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    recentHitCooldownByScope: { midday: 10 },
    synergyOn: false, synergyWeight: 0.15,
    excludeYesterdayHits: false,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        aggressive:   { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        conservative: { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        aggressive:   { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
      },
      allday: {
        balanced:     { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        conservative: { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        aggressive:   { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── ENG-OBS-05 candidates (2026-06-10): pressure channel rescaled to the ──
  // live post-DATA-01 ds_raw distribution. Identical to prod_parity_2026_06_09
  // except pressureScaleMode. Operator override of the 6/13 config freeze
  // (2026-06-10): "we can never wait for known engine errors affecting
  // accuracy". Ship gate unchanged: candidate ≥ baseline overall slate rate,
  // no per-scope regression beyond the ~1.7pp run-noise band (>2pp margin).
  prp_p95ramp: {
    modelDisplayReorder: true,
    pressureScaleMode: 'p95ramp',
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      aggressive:   { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    recentHitCooldownByScope: { midday: 10 },
    synergyOn: false, synergyWeight: 0.15,
    excludeYesterdayHits: false,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        aggressive:   { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        conservative: { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        aggressive:   { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
      },
      allday: {
        balanced:     { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        conservative: { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        aggressive:   { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── CONFIG-16 candidate (2026-06-10): DGC → 0 in all scopes ────────────────
  // Live 49-day per-signal AUC (signal_auc_per_day): DGC 0.449 midday / 0.474
  // evening / 0.454 allday — below 0.5 (anti-predictive) in every scope while
  // carrying 10–16.4% weight. Weight redistributed proportionally to the
  // surviving channels per scope (CONFIG-14/15 allocation pattern):
  //   midday  {20.8,5.2,64,10}   → /0.90  → {23.11, 5.78, 71.11, 0}
  //   evening {56.25,31.25,0,12.5} → /0.875 → {64.29, 35.71, 0, 0}
  //   allday  {54.1,29.5,0,16.4} → /0.836 → {64.71, 35.29, 0, 0}
  // Counter-evidence to beat: CONFIG-09/10 (5/27) showed DGC helping r1 under
  // the old indicator ordering. With the ds-desc reorder now modeled, the gate
  // re-adjudicates on current production ordering.
  dgc_zero_all: {
    modelDisplayReorder: true,
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      aggressive:   { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    recentHitCooldownByScope: { midday: 10 },
    synergyOn: false, synergyWeight: 0.15,
    excludeYesterdayHits: false,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.2311, PBURST: 0.0578, CO: 0.7111, DGC: 0 },
        conservative: { BOX: 0.2311, PBURST: 0.0578, CO: 0.7111, DGC: 0 },
        aggressive:   { BOX: 0.2311, PBURST: 0.0578, CO: 0.7111, DGC: 0 },
      },
      evening: {
        balanced:     { BOX: 0.6429, PBURST: 0.3571, CO: 0, DGC: 0 },
        conservative: { BOX: 0.6429, PBURST: 0.3571, CO: 0, DGC: 0 },
        aggressive:   { BOX: 0.6429, PBURST: 0.3571, CO: 0, DGC: 0 },
      },
      allday: {
        balanced:     { BOX: 0.6471, PBURST: 0.3529, CO: 0, DGC: 0 },
        conservative: { BOX: 0.6471, PBURST: 0.3529, CO: 0, DGC: 0 },
        aggressive:   { BOX: 0.6471, PBURST: 0.3529, CO: 0, DGC: 0 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── TRUE production parity as of 2026-06-10 00:42 UTC (post-CONFIG-16) ────
  // = prod_parity_2026_06_09 with the CONFIG-16 allday weights (DGC→0,
  // redistributed: {64.7, 35.3, 0, 0}). Use as BASELINE from 2026-06-10 on.
  prod_parity_2026_06_10: {
    modelDisplayReorder: true,
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      aggressive:   { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    recentHitCooldownByScope: { midday: 10 },
    synergyOn: false, synergyWeight: 0.15,
    excludeYesterdayHits: false,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        aggressive:   { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        conservative: { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        aggressive:   { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
      },
      allday: {
        balanced:     { BOX: 0.647, PBURST: 0.353, CO: 0, DGC: 0 },
        conservative: { BOX: 0.647, PBURST: 0.353, CO: 0, DGC: 0 },
        aggressive:   { BOX: 0.647, PBURST: 0.353, CO: 0, DGC: 0 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── ENH-AUDIT v2 STATE_STR sweep (2026-06-10) ──────────────────────────────
  // Per-state pattern-strength channel as post-score additive boost. Global
  // weight for direction-finding; ship (if any) will be per-scope per the spec
  // risk note. Gate: midday top-6 ≥ 25% without slate regression elsewhere.
  // Defined via spread of the 2026-06-10 parity baseline — only the stateStr
  // fields differ; all other knobs are production-identical.
  get state_str_010() {
    return { ...this.prod_parity_2026_06_10, stateStrWeight: 0.10, stateStrWindowDays: 60, stateStrHalfLifeDays: 14 };
  },
  // BESTORDER-SWEEP (2026-06-10): production parity + per-pick order variants.
  // Selection identical to prod_parity_2026_06_10; adds the straight-conversion
  // table (raw control / pair / pair_full / pos60 / blend) in one pass.
  get bestorder_sweep() {
    return { ...this.prod_parity_2026_06_10, bestOrderSweepVariants: true };
  },
  get state_str_020() {
    return { ...this.prod_parity_2026_06_10, stateStrWeight: 0.20, stateStrWindowDays: 60, stateStrHalfLifeDays: 14 };
  },

  // ─── SIGNAL-INFO-01 (2026-06-10): inverted-signals direction test ──────────
  // Exact negation of every active signal weight in the production-parity
  // baseline (global + per-scope). Ranks the LOWEST-signal real combos first.
  // Purpose: disambiguate the within-slate anti-predictive pattern (4th
  // confirmation 2026-06-10: 10/12 selected-pick AUCs < 0.5) between
  //   (a) real anti-structure → this preset beats baseline by > 2pp noise floor
  //   (b) selection artifact (Berkson/range restriction) → lands at baseline
  // BACKTEST-ONLY. Never ship: multiplicity priors stay additive so the
  // inversion is rank-exact on the signal component, but energy floors and
  // cooldowns interact with a low-signal pool in untested ways.
  get inverted_signals() {
    const base = this.prod_parity_2026_06_10;
    const neg = (w: { BOX: number; PBURST: number; CO: number; DGC: number }) =>
      ({ BOX: -w.BOX, PBURST: -w.PBURST, CO: -w.CO, DGC: -w.DGC });
    const negModes = (m: Record<string, { BOX: number; PBURST: number; CO: number; DGC: number }>) => ({
      balanced: neg(m.balanced), conservative: neg(m.conservative), aggressive: neg(m.aggressive),
    });
    return {
      ...base,
      presets: negModes(base.presets),
      presetByScope: {
        midday:  negModes(base.presetByScope!.midday!),
        evening: negModes(base.presetByScope!.evening!),
        allday:  negModes(base.presetByScope!.allday!),
      },
    };
  },

  // ─── SIGNAL-INFO-01b (2026-06-10): targeted DGC-negation test ───────────────
  // DGC is the ONLY signal with replicated universe-level anti-information
  // (singles-stratum AUC < 0.5 in both 5/13-6/9 and 4/1-5/12 windows, several
  // cells p<.01) AND it is purely histories-derived — immune to the
  // datasets_* forward-drift leak that contaminates the full inversion test.
  // This preset = production parity with ONLY the DGC weight negated
  // (midday +0.10→−0.10, evening +0.125→−0.125, allday 0→−0.10).
  // If DGC anti-information is exploitable, this beats parity > 2pp noise.
  get dgc_negative() {
    const base = this.prod_parity_2026_06_10;
    const withDgc = (w: { BOX: number; PBURST: number; CO: number; DGC: number }, dgc: number) => ({
      balanced:     { ...w, DGC: dgc },
      conservative: { ...w, DGC: dgc },
      aggressive:   { ...w, DGC: dgc },
    });
    return {
      ...base,
      presets: withDgc(base.presets.balanced, -0.10),
      presetByScope: {
        midday:  withDgc(base.presetByScope!.midday!.balanced, -0.100),
        evening: withDgc(base.presetByScope!.evening!.balanced, -0.125),
        allday:  withDgc(base.presetByScope!.allday!.balanced, -0.100),
      },
    };
  },

  prp_percentile: {
    modelDisplayReorder: true,
    pressureScaleMode: 'percentile',
    presets: {
      balanced:     { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      conservative: { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
      aggressive:   { BOX: 0.495, PBURST: 0.270, CO: 0.135, DGC: 0.10 },
    },
    rails: { singlesMax: 4, doublesMax: 2, triplesOn: false, pairRepCap: 2 },
    pressureThreshold: 100, minEnergyThreshold: 70, recentHitCooldown: 20,
    recentHitCooldownByScope: { midday: 10 },
    synergyOn: false, synergyWeight: 0.15,
    excludeYesterdayHits: false,
    boxFreqWeightByScope:     { midday: 0.60, evening: 0.60, allday: 0.60 },
    boxPressureWeightByScope: { midday: -0.40, evening: -0.40, allday: 0.40 },
    horizonWeights: { H01Y: 0.60, H02Y: 0.40, H03Y: 0, H04Y: 0, H05Y: 0, H06Y: 0, H07Y: 0, H08Y: 0, H09Y: 0, H10Y: 0 },
    presetByScope: {
      midday: {
        balanced:     { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        conservative: { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
        aggressive:   { BOX: 0.208, PBURST: 0.052, CO: 0.640, DGC: 0.100 },
      },
      evening: {
        balanced:     { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        conservative: { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
        aggressive:   { BOX: 0.5625, PBURST: 0.3125, CO: 0.000, DGC: 0.125 },
      },
      allday: {
        balanced:     { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        conservative: { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
        aggressive:   { BOX: 0.541, PBURST: 0.295, CO: 0.000, DGC: 0.164 },
      },
    },
    timesDrawnHorizonBlend: true,
  },

  // ─── BUG-DBL-STARVE-01 candidates (2026-06-11) ──────────────────────────────
  // Doubles can't clear the pooled p70 energy floor, so the doubles quota
  // (doublesMax=2) never fills, every slate falls through to Pass 6, and the
  // Pass-6 relaxation disables the cooldown — letting yesterday's winners onto
  // the slate. Candidates relax ONLY the doubles energy floor (per-mult floor
  // already supported here since ENH-DBL-H2); selection otherwise identical to
  // prod_parity_2026_06_10. NOTE: H2-style flat relaxation tanked quality on
  // 5/18-era weights — re-testing against current production weights.
  get dbl_fix_floor40() {
    return { ...this.prod_parity_2026_06_10, minEnergyThresholdByMultiplicity: { singles: 70, doubles: 40, triples: 70 } };
  },
  get dbl_fix_floor20() {
    return { ...this.prod_parity_2026_06_10, minEnergyThresholdByMultiplicity: { singles: 70, doubles: 20, triples: 70 } };
  },
  get dbl_fix_floor0() {
    return { ...this.prod_parity_2026_06_10, minEnergyThresholdByMultiplicity: { singles: 70, doubles: 0, triples: 70 } };
  },
  // Quota fix: stop demanding 2 doubles the universe can't profitably supply.
  // singlesMax 6 lets Pass 1 fill the slate with cooldown-clean singles, so
  // selection never reaches Pass 5/6 (where the cooldown gets relaxed and
  // yesterday's winners leak in). Doubles remain eligible on merit (cap 2).
  get dbl_fix_singles6() {
    return { ...this.prod_parity_2026_06_10, rails: { singlesMax: 6, doublesMax: 2, triplesOn: false, pairRepCap: 2 } };
  },
  // Variant: hard-zero the doubles quota as well (pure-singles slate).
  get dbl_fix_singles6_dbl0() {
    return { ...this.prod_parity_2026_06_10, rails: { singlesMax: 6, doublesMax: 0, triplesOn: false, pairRepCap: 2 } };
  },

  // HIT-PERSIST-01 (2026-06-19): retire recently-drawn combos for N days via the
  // non-relaxable block. BASELINE = dbl_fix_singles6 (recentHitBlockDays omitted = 1,
  // legacy yesterday-only). Candidates widen the window. Operator chose ~4d to match
  // their 'ride max 3 days' workflow and stop 923/298 reappearing every day.
  // NOTE: prod_parity_2026_06_10 sets excludeYesterdayHits:false (mirrors production's
  // ENG-BLOCK-NARROW-01 today-only block, which the harness models as "no D-1 block").
  // The candidates must re-enable the block path (excludeYesterdayHits:true) for
  // recentHitBlockDays to have any effect. hitblock1 = re-enable yesterday-only
  // (isolates the cost of un-narrowing); hitblock2..5 widen to D-1..D-N.
  get hitblock1() { return { ...this.dbl_fix_singles6, excludeYesterdayHits: true, recentHitBlockDays: 1 }; },
  get hitblock2() { return { ...this.dbl_fix_singles6, excludeYesterdayHits: true, recentHitBlockDays: 2 }; },
  get hitblock3() { return { ...this.dbl_fix_singles6, excludeYesterdayHits: true, recentHitBlockDays: 3 }; },
  get hitblock4() { return { ...this.dbl_fix_singles6, excludeYesterdayHits: true, recentHitBlockDays: 4 }; },
  get hitblock5() { return { ...this.dbl_fix_singles6, excludeYesterdayHits: true, recentHitBlockDays: 5 }; },

  // ENG-BLOCK-PERSCOPE-02 (2026-06-22): SHIPPED production parity. midday keeps its
  // 1-day (yesterday) block; evening + allday widen to a 3-day non-relaxable post-hit
  // block. Backtest (window ending 6/22): evening +3.5pp, allday neutral within noise.
  // This is the new baseline for future evening/allday engine experiments.
  get prod_parity_2026_06_22() {
    return { ...this.dbl_fix_singles6, excludeYesterdayHits: true, recentHitBlockDaysByScope: { midday: 1, evening: 3, allday: 3 } };
  },

  // ENG-STALE-01 (2026-06-22): slate-appearance staleness candidates layered on the
  // shipped block baseline. Block a combo that's been on the last N slates (evening +
  // allday; midday already rotates). Mechanically caps appearance at N/(N+1) of days,
  // so the never-hitting 923/298 repeaters can't sit on every slate. Measure the
  // hit-rate cost vs prod_parity_2026_06_22.
  get stale2() {
    return { ...this.prod_parity_2026_06_22, slateStalenessThresholdByScope: { evening: 2, allday: 2 } };
  },
  get stale3() {
    return { ...this.prod_parity_2026_06_22, slateStalenessThresholdByScope: { evening: 3, allday: 3 } };
  },

  // COOLDOWN-WINDOW-SWEEP (2026-06-20): "fix the cooldown unit defect" verified to
  // be a non-defect — ds_raw is calendar DAYS end-to-end, so recent_hit_cooldown=20
  // is a coherent 20-DAY window (not a unit bug). Open question: is 20d too WIDE?
  // BASELINE = dbl_fix_singles6 (cd=20 global, midday cd=10). Candidates tighten the
  // GLOBAL window only (midday stays at its inherited 10 + has its own hard block),
  // so this isolates the evening/allday cooldown — the scopes where 923/298 persist.
  get cd_w10() { return { ...this.dbl_fix_singles6, recentHitCooldown: 10 }; },
  get cd_w7()  { return { ...this.dbl_fix_singles6, recentHitCooldown: 7 }; },
  get cd_w5()  { return { ...this.dbl_fix_singles6, recentHitCooldown: 5 }; },
  get cd_w3()  { return { ...this.dbl_fix_singles6, recentHitCooldown: 3 }; },

  // ENG-MIDDAY-COLD-01 follow-up (2026-08-02): parity refresh + rail sweep.
  // prod_parity_2026_06_10's evening weights predate the 6/11 partial CO restore
  // (live engine_weights_balanced_evening = BOX 50.625 / PBURST 28.125 / CO 10 /
  // DGC 11.25 since 2026-06-11), so every preset spread from it replays evening
  // under CO=0. Refreshed parity = stale2 selection stack + live evening weights.
  get prod_parity_2026_08_02() {
    const base = this.stale2;
    return {
      ...base,
      presetByScope: {
        ...base.presetByScope,
        evening: {
          balanced:     { BOX: 0.50625, PBURST: 0.28125, CO: 0.100, DGC: 0.1125 },
          conservative: { BOX: 0.50625, PBURST: 0.28125, CO: 0.100, DGC: 0.1125 },
          aggressive:   { BOX: 0.50625, PBURST: 0.28125, CO: 0.100, DGC: 0.1125 },
        },
      },
    };
  },
  // Midday cooldown relaxation: the DI top-30 audit showed every hitting top-30
  // non-pick is cooldown-blocked, and midday blocked sets hit 20.5% vs picks
  // 14.7% (hypothesis-grade z≈1.85; universe P(hit|ds) is FLAT, so the expected
  // true effect is zero — this sweep is the disambiguator, not confirmation).
  get cd_mid7() { return { ...this.prod_parity_2026_08_02, recentHitCooldownByScope: { midday: 7 } }; },
  get cd_mid5() { return { ...this.prod_parity_2026_08_02, recentHitCooldownByScope: { midday: 5 } }; },
  get cd_mid3() { return { ...this.prod_parity_2026_08_02, recentHitCooldownByScope: { midday: 3 } }; },
  // Rotation port: midday gets the evening/allday texture levers (3-day post-hit
  // block + stale2). Expectation: hit-rate-neutral; this measures the cost.
  get midday_rot() {
    return {
      ...this.prod_parity_2026_08_02,
      recentHitBlockDaysByScope: { midday: 3, evening: 3, allday: 3 },
      slateStalenessThresholdByScope: { midday: 2, evening: 2, allday: 2 },
    };
  },
  // Allday cooldown widen probe (blocked allday sets ran −1.1z under baseline).
  get allday_cd30() { return { ...this.prod_parity_2026_08_02, recentHitCooldownByScope: { midday: 10, allday: 30 } }; },
};
