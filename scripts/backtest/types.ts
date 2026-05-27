export type Scope = 'midday' | 'evening' | 'allday';
export type WeightSet = { BOX: number; PBURST: number; CO: number; DGC: number };

export interface EngineConfig {
  presets: {
    balanced: WeightSet;
    conservative: WeightSet;
    aggressive: WeightSet;
  };
  rails: {
    singlesMax: number;
    doublesMax: number;
    triplesOn: boolean;
    pairRepCap: number;
  };
  pressureThreshold: number;
  minEnergyThreshold: number;
  recentHitCooldown: number;
  synergyOn: boolean;
  synergyWeight: number;
  // Yesterday-hit hard block. true = exclude yesterday's winners (current local engine).
  // false = match the pre-port edge function which only blocked today's winners.
  // Defaults to true when omitted.
  excludeYesterdayHits?: boolean;
  // ENH-F: per-multiplicity cooldown. Doubles draw less often than singles, so a flat
  // 20-day cooldown is too aggressive for them. When set, overrides `recentHitCooldown`
  // based on the candidate's multiplicity.
  cooldownByMultiplicity?: { singles: number; doubles: number; triples: number };
  // ENH (2026-05-13): per-scope cooldown override. When the replay is processing
  // a slate of scope X and recentHitCooldownByScope[X] is set, that value wins over
  // global recentHitCooldown. Mirrors the production `recent_hit_cooldown_${scope}`
  // app_config key that engines/zk6.ts and compute-slate-zk6 read.
  recentHitCooldownByScope?: Partial<Record<Scope, number>>;
  // ENH-HW (2026-05-13): per-horizon weights for the BOX dsRaw blend. Decimals
  // summing to ~1.0 (NOT percentages). When omitted, replay uses the hardcoded
  // HORIZON_WEIGHTS const. Mirrors production app_config.horizon_weights.
  horizonWeights?: Record<string, number>;
  // ENH-BOA (2026-05-27): when true, bestOrderFor uses the hardcoded
  // HORIZON_WEIGHTS const for its pair-blend regardless of `horizonWeights`.
  // Default (false / omitted) threads `horizonWeights` through to bestOrderFor,
  // matching the post-realignment production engine. Used as the BASELINE flag
  // in the empirical validation for the 2026-05-27 bestOrderFor change — a
  // run with `bestOrderUseDefaultHorizonWeights: true` reproduces pre-change
  // engine behavior under whatever other config it carries, isolating the
  // realignment's straight-hit effect from BOX-scoring changes.
  bestOrderUseDefaultHorizonWeights?: boolean;
  // ENH-BP (2026-05-14): BOX freq/pressure split. Defaults (omitted) preserve the
  // hard-coded 60/40 production split. Candidates can vary the split to test
  // whether the "overdue pressure" term is hurting midday/doubles performance
  // (see FORENSIC-01: 0 hits on 28 doubles picks suggests anti-correlated pressure).
  // Weights are absolute, not normalized — typical sane range: both in [0,1],
  // freq+pressure ≈ 1.0. Setting pressureWeight=0 disables the over-due signal;
  // setting it negative inverts it (penalises "overdue" combos).
  boxFreqWeight?: number;
  boxPressureWeight?: number;
  // Per-scope override (wins over the globals above). Mirrors the
  // `recentHitCooldownByScope` pattern. Needed because the 30-day candidate
  // sweep showed pressure inversion helps midday/evening but hurts allday;
  // a single global value can't win on all three scopes.
  boxFreqWeightByScope?: Partial<Record<Scope, number>>;
  boxPressureWeightByScope?: Partial<Record<Scope, number>>;
  // ENH-MET (2026-05-18): per-scope energy floor override. Mirrors the
  // production app_config `min_energy_threshold_${scope}` reader added to
  // engines/zk6.ts + compute-slate-zk6 the same day. When set for a scope,
  // overrides `minEnergyThreshold` for that scope only — other scopes use
  // the global. Distinct from `minEnergyThresholdByMultiplicity` (per-
  // multiplicity, all scopes) added during the parked ENH-DBL sweep.
  minEnergyThresholdByScope?: Partial<Record<Scope, number>>;
  // ENH (2026-05-15): per-scope signal-weight overrides (BOX/PBURST/CO/DGC).
  // When set for a scope, replaces `presets[mode]` for that scope only. Other
  // scopes fall back to the global preset. Mirrors the per-scope override
  // pattern used by `boxFreqWeightByScope` etc. Production engine does not yet
  // load this; harness extension precedes engine extension by design.
  presetByScope?: Partial<Record<Scope, {
    balanced: WeightSet;
    conservative: WeightSet;
    aggressive: WeightSet;
  }>>;
  // ENH-DBL-H1 (2026-05-18): per-multiplicity indicator-score prior override.
  // When omitted, replay uses the default MULTIPLICITY_PRIORS from engineCore
  // (singles: 0.0, doubles: -0.02, triples: -0.04). 2026-05-18 cross-cut +
  // diag-doubles showed doubles hit 100% (n=8) when picked but enter K6 at
  // mean rank 5.0 — the -0.02 prior pushes them below singles in the
  // indicator-sorted scoring. H1 candidates raise or zero the doubles prior.
  multiplicityPriors?: { singles: number; doubles: number; triples: number };
  /** Per-scope override mirror. Required for midday-specific intervention. */
  multiplicityPriorsByScope?: Partial<Record<Scope, { singles: number; doubles: number; triples: number }>>;
  // ENH-DBL-H2 (2026-05-18): per-multiplicity energy-floor override. Default
  // `minEnergyThreshold` (production = 70) is applied uniformly. Doubles
  // cluster at low energy percentiles due to frequency-weighted BOX scoring
  // (doubles draw ~50% as often as singles, so freq-weighted BOX suppresses
  // them) — the floor filters most of them out before they reach K6.
  // H2 candidates lower or zero the doubles floor.
  minEnergyThresholdByMultiplicity?: { singles: number; doubles: number; triples: number };
  /** Per-scope override mirror. */
  minEnergyThresholdByMultiplicityByScope?: Partial<Record<Scope, { singles: number; doubles: number; triples: number }>>;
  // ENH-DBL-H3 (2026-05-18): top-N doubles selective bonus. H1 + H2 both
  // failed because they treated all doubles the same:
  //   H1 boosted ALL doubles → no effect (boost too small to lift them above singles)
  //   H2 admitted ALL doubles → tanked quality (weak doubles pollute the slate)
  // H3 isolates the few doubles already showing signal strength and boosts
  // ONLY those — strong doubles compete with mid-rank singles, weak doubles
  // stay suppressed. Applied to the finalScores array after weighted-signal
  // scoring but before runK6Selection sort. Identifies top-N doubles by raw
  // score, adds `bonus` to those indices only.
  doublesTopNBoost?: { topN: number; bonus: number };
  /** Per-scope override. midday CO=74% changes the doubles distribution — needs separate tuning. */
  doublesTopNBoostByScope?: Partial<Record<Scope, { topN: number; bonus: number }>>;
}

export interface ReplayPick {
  combo: string;
  comboSet: string;
  indicator: number;
  energy: number;
  multiplicity: 'singles' | 'doubles' | 'triples';
  // Position-pair maximised arrangement of `combo`. Production matches this
  // against histories.result_digits for straight detection (BUG-155). Weighted
  // by engine's horizonWeights — when the config sets horizon_weights pure-H01Y,
  // this reflects that; when defaulted, uses the full 10-horizon decay.
  bestOrder: string;
}

export interface HitResult {
  date: string;
  scope: Scope;
  configName: string;
  mode: string;
  picks: ReplayPick[];
  hitsBox: number;
  hitsStraight: number;
  totalHits: number;
  hittingCombos: string[];
  hittingJurisdictions: string[];
  /** Per-pick hit flag, indexed in rank order (hitsByPick[i] = rank i+1). */
  hitsByPick: boolean[];
  // Uniform-random 6-pick baseline metrics for the same (date, scope, K) —
  // identical regardless of engine config, so summary can fairly compute
  // engine-vs-baseline lift.
  baselinePerPickHitProb: number;
  baselineExpectedPickHits: number;
  baselineSlateHitProb: number;
  resultsInScope: number;
  // Rail-matched baseline: random picks of the SAME multiplicity mix as the
  // engine's actual slate. More honest comparison since the engine's rail
  // caps may force doubles/triples allocations the uniform baseline doesn't
  // see. See score.ts::computeRailMatchedBaseline.
  railMatchedExpectedPickHits: number;
  railMatchedSlateHitProb: number;
}

export interface ReportRow {
  date: string;
  scope: string;
  mode: string;
  snapshotId: string;
  pickCount: number;
  hitsBox: number;
  hitsStraight: number;
  totalHits: number;
  source: string;
  // Baseline (uniform-random 6-pick) metrics — see score.ts::computeBaseline.
  baselinePerPickHitProb: number;
  baselineExpectedPickHits: number;
  baselineSlateHitProb: number;
  resultsInScope: number;
  // Rail-matched baseline (uses the engine's own multiplicity mix).
  railMatchedExpectedPickHits: number;
  railMatchedSlateHitProb: number;
  /** Engine pick mix for this slate, captured for diagnostic CSV columns. */
  picksSingles: number;
  picksDoubles: number;
  picksTriples: number;
}
