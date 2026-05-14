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
