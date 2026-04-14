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
  session: 'midday' | 'evening';
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
  indicator: number;
  box: number;
  pburst: number;
  co: number;
  bestOrder?: string;
  multiplicity?: 'singles' | 'doubles' | 'triples';
  topPair?: string;
  temperature?: number;
  rank?: number;
  components?: Record<string, unknown>;
}

export interface SlateSnapshot {
  id: string;
  scope: Scope;
  horizons_present_json: Record<string, boolean>;
  weights_json?: Record<string, number>;
  top_k_straights_json?: TopKStraightRow[] | string[];
  top_k_boxes_json?: Record<string, unknown>[] | string[];
  components_json?: {
    combo: string;
    components: { BOX: number; PBURST: number; CO: number };
    temperature: number;
    multiplicity: 'singles' | 'doubles' | 'triples';
    topPair: string;
    indicator: number;
  }[];
  updated_at_et: string;
  updated_at?: string;
  snapshot_hash?: string;
  hash?: string;
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