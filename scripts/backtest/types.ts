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
}

export interface ReplayPick {
  combo: string;
  comboSet: string;
  indicator: number;
  energy: number;
  multiplicity: 'singles' | 'doubles' | 'triples';
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
