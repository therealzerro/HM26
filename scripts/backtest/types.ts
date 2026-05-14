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
}
