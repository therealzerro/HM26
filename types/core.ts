// Core type definitions for the ZK6 Analytics Platform

export type UserRole = 'free' | 'premium' | 'admin';
export type SubscriptionTier = 'FREE' | 'PRO' | 'PLUS';
export type SubscriptionPlan = 'trial5' | 'monthly' | 'annual';

export type Scope = 'midday' | 'evening' | 'allday';

export type HorizonLabel = 'H01Y' | 'H02Y' | 'H03Y' | 'H04Y' | 'H05Y' | 
                           'H06Y' | 'H07Y' | 'H08Y' | 'H09Y' | 'H10Y';

export type ImportType = 'box_history' | 'pair_history' | 'daily_input' | 'ledger';

export interface ImportSummary {
  id: string;
  type: ImportType;
  class_id?: number;
  horizon_label?: HorizonLabel;
  scope?: Scope;
  accepted: number;
  rejected: number;
  fixed: number;
  warnings: string[];
  p99_cap?: number;
  first_seen?: string;
  last_seen?: string;
  importedDates?: string[];
}

export interface HitDetectionResult {
  totalHits: number;
  scopeResults: Record<string, number>;
  ran: boolean;
}

// Data Contracts
export interface BoxData {
  Combo: string;
  ComboSet: string;
  TimesDrawn: number;
  Expected?: number;
  LastSeen: string; // YYYY-MM-DD
  DrawsSince: number; // >= 0
}

export interface PairData {
  Pair: string; // "00" to "99"
  TimesDrawn: number;
  LastSeen: string;
  DrawsSince: number;
}

export interface DailyInputData {
  Combo: string;
  ComboSet: string;
  TimesDrawn: number;
  Expected?: number;
  LastSeen: string;
  DrawsSince: number;
}

export interface LedgerEntry {
  jurisdiction: string;
  game: string;
  date_et: string;
  session: 'midday' | 'evening' | 'morning' | 'night';
  result_digits: string; // "ABC"
  comboset_sorted: string; // "{a,b,c}"
}

// Database Entities
export interface User {
  id: string;
  role: UserRole;
  tier: SubscriptionTier;
  subscription?: {
    plan: SubscriptionPlan;
    status: 'active' | 'expired' | 'cancelled';
    expiresAt?: string;
  };
  created_at: string;
}

export interface Import {
  id: string;
  type: ImportType;
  class_id?: number;
  horizon_label?: HorizonLabel;
  scope?: Scope;
  file_meta?: Record<string, any>;
  counts?: number;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'deleted';
  error_text?: string;
  deleted_at?: string;
  created_by: string;
  created_at: string;
}

export interface TopKStraightRow {
  combo: string;
  comboSet?: string;
  indicator: number;
  box: number;
  pburst: number;
  co: number;
  bestOrder?: string;
  multiplicity?: 'singles' | 'doubles' | 'triples';
  topPair?: string;
  temperature?: number;
  energy?: number;         // percentile rank 0-100
  rank?: number;
  confidence?: number;     // 0-100
  components?: Record<string, unknown>;
  drawsSince?: number;
  timesDrawn?: number;
  dsRaw?: number;
  lastSeen?: string;
}

export interface EngineMetadata {
  [horizon: string]: boolean | string | number | SlateDataStats | undefined;
  _engineVersion?: string;
  _mode?: string;
  _confidence?: number;
  _dataStats?: SlateDataStats;
  _source?: string;
  _is_supplement?: boolean;
}

export interface SlateDataStats {
  boxRowsUsed: number;
  pairRowsUsed: number;
  horizonsLoaded: string[];
  usingFallback: boolean;
}

export interface SlateSnapshot {
  id: string;
  scope: Scope;
  horizons_present_json: EngineMetadata;
  weights_json?: Record<string, number | string>;
  top_k_straights_json?: TopKStraightRow[] | string[];
  top_k_boxes_json?: Record<string, unknown>[] | string[];
  components_json?: {
    combo: string;
    components: { BOX: number; PBURST: number; CO: number };
    temperature: number;
    multiplicity: 'singles' | 'doubles' | 'triples';
    topPair: string;
    indicator: number;
    energy?: number;
  }[];
  updated_at_et: string;
  slate_date?: string;
  updated_at?: string;
  snapshot_hash?: string;
  hash?: string;
  // Extended in-memory fields (embedded in JSONB for persistence)
  mode?: string;
  engineVersion?: string;
  source?: 'live' | 'mock' | 'demo';
  confidence?: number;
  dataStats?: SlateDataStats;
}

export type RegenerateStatus = 'success' | 'missing' | 'noop' | 'busy' | 'error';

export interface RegenerateResult {
  status: RegenerateStatus;
  message: string;
  scope: Scope;
  hash?: string;
  snapshotId?: string;
  details?: {
    missingH01Y?: string[];
    missingClassIds?: number[];
    lastRun?: string | null;
    changes?: string[];
  };
}

export interface AuditLog {
  id: string;
  actor_id: string;
  action: string;
  target: string;
  payload_meta?: Record<string, any>;
  created_at: string;
}

// UI Types
export interface ValidationError {
  row?: number;
  column?: string;
  message: string;
}

export interface ImportPreview {
  headers: string[];
  sampleRows: any[][];
  totalRows: number;
  errors: ValidationError[];
}