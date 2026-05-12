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
