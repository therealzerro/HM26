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
