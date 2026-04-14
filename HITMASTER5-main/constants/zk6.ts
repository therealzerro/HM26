// ZK6 Engine Constants and Configuration
// Phase 0: Definitions only - engine implementation in Phase 1

import { HorizonLabel } from '@/types/core';

// Default ZK6 Component Weights
export const ZK6_WEIGHTS = {
  balanced: {
    BOX: 0.40,
    PBURST: 0.40,
    CO: 0.20,
  },
  conservative: {
    BOX: 0.85,
    PBURST: 0.10,
    CO: 0.05,
  },
} as const;

// Multiplicity Priors (applied to final indicator)
export const MULTIPLICITY_PRIORS = {
  singles: 0.00,   // No adjustment for singles
  doubles: -0.02,  // Small penalty for doubles
  triples: -0.04,  // Larger penalty for triples
} as const;

// K6 Quotas and Rails
export const K6_QUOTAS = {
  singles: 4,      // Max 4 singles in K6
  doubles: 2,      // Max 2 doubles in K6
  triples: 0,      // Triples off in Phase 0
} as const;

// Pair Repetition Cap
export const PAIR_REPETITION_CAP = 2; // Max 2 items sharing same TopPair

// Horizon Blending Weights (geometric profile, short-heavier)
export const HORIZON_WEIGHTS: Record<HorizonLabel, number> = {
  H01Y: 0.35,  // Most recent year gets highest weight
  H02Y: 0.25,
  H03Y: 0.15,
  H04Y: 0.10,
  H05Y: 0.06,
  H06Y: 0.04,
  H07Y: 0.02,
  H08Y: 0.01,
  H09Y: 0.01,
  H10Y: 0.01,
};

// Normalization Methods
export const NORMALIZATION_METHODS = {
  percentile: 'percentile',  // Preferred method
  zscore: 'zscore',         // Optional alternative
} as const;

// Winsorization Settings
export const WINSOR_SETTINGS = {
  percentile: 99,  // P99 cap for extremes
} as const;

// Temperature Badge Mapping (0-100 scale)
export const TEMPERATURE_CUTPOINTS = {
  p10: 0,   // Bottom 10% maps to 0
  p90: 100, // Top 10% maps to 100
} as const;

// Same-day Exclusion Rules
export const EXCLUSION_RULES = {
  sameDay: true,           // Exclude combos that hit today
  midToEve: true,          // Mid→Eve exclusion rules
  eveToMid: true,          // Eve→Mid exclusion rules
  last24h: true,           // Last 24h cap
} as const;

// REMOVED: Mock slate snapshot - Phase 3 uses live data only

// Data Validation Rules
export const VALIDATION_RULES = {
  combo: {
    format: /^\d{3}$/,        // Must be 3 digits
    range: [0, 999],          // 000-999
  },
  pair: {
    format: /^\d{2}$/,        // Must be 2 digits
    range: [0, 99],           // 00-99
  },
  drawsSince: {
    min: 0,                   // Must be >= 0
  },
  timesDrawn: {
    min: 0,                   // Must be >= 0
  },
} as const;

// Import File Headers (required columns)
export const REQUIRED_HEADERS = {
  box_history: ['Combo', 'ComboSet', 'TimesDrawn', 'LastSeen', 'DrawsSince'],
  pair_history: ['Pair', 'TimesDrawn', 'LastSeen', 'DrawsSince'],
  daily_input: ['Combo', 'ComboSet', 'TimesDrawn', 'LastSeen', 'DrawsSince'],
  ledger: ['jurisdiction', 'game', 'date_et', 'session', 'result_digits'],
} as const;

// Audit Log Actions
export const AUDIT_ACTIONS = {
  IMPORT_HISTORY: 'import_history',
  IMPORT_DAILY: 'import_daily',
  IMPORT_LEDGER: 'import_ledger',
  REGENERATE_SLATE: 'regenerate_slate',
  UPDATE_WEIGHTS: 'update_weights',
} as const;