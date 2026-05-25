// ZK30 v1.0 Constants (ARCH-06, 2026-05-25)
//
// Engine: single-state TX Pick 3, 30-pick all-day slate.
// Horizons: H01Y + H02Y ONLY. The TX dataset is 2 years; H03Y–H10Y do not
// exist for ZK30 and should not be reachable from ZK30 code paths. This file
// narrows the horizon type so the compiler enforces that constraint —
// engineCore's wider HorizonLabel type continues to serve ZK6.
//
// Downstream consequences honored by Steps 3–5:
//   1. Import pipeline iterates ZK30_HORIZONS, not H_ALL — no zero-row
//      placeholders for H03Y–H10Y written to datasets_box / datasets_pair.
//   2. Engine fetch code queries datasets with horizon_label.in.(H01Y,H02Y).
//      BUG-153 pagination still applies to the pair fetch.
//   3. Blending math passes HORIZON_WEIGHTS_ZK30 into engineCore directly.
//      engineCore's internal loop over H_ALL hits undefined → 0 for H03Y+,
//      producing identical math to a 2-horizon loop. Wasted iteration is
//      ~nanoseconds and keeps engineCore untouched. Do NOT wrap engineCore
//      with a ZK30-specific blending helper — that's gold-plating.
//
// Tuning constants live in app_config (keys: zk30_*); this file holds
// structural decisions only.

import type { HorizonLabel } from '@/types/core';

// ─── Engine identity ─────────────────────────────────────────────────────────

export const ZK30_ENGINE_VERSION = 'v1.0';
export const ZK30_JURISDICTION = 'TX';        // hardcoded v1.0; parameterize in v2.0
export const ZK30_SCOPE = 'allday';            // pinned single scope
export const ZK30_DROP_TIME_ET = '09:00';      // daily generation time

export const ZK30_DRAW_SESSIONS = ['Morning', 'Day', 'Evening', 'Night'] as const;
export type ZK30Session = typeof ZK30_DRAW_SESSIONS[number];

// ─── Horizons (narrowed) ─────────────────────────────────────────────────────
// ZK30 uses H01Y and H02Y only. The local type narrows engineCore's
// HorizonLabel so accidental references to H03Y–H10Y won't compile in ZK30
// code. Runtime safety: ZK30Horizon is a subtype of HorizonLabel, so
// engineCore functions accept it without coercion. But ZK30's fetch loops,
// blend loops, and config tables must iterate ZK30_HORIZONS, not H_ALL.

export type ZK30Horizon = Extract<HorizonLabel, 'H01Y' | 'H02Y'>;

export const ZK30_HORIZONS: readonly ZK30Horizon[] = ['H01Y', 'H02Y'] as const;

// Custom H01Y-heavy weights (0.70 / 0.30) — not a proportional renormalization.
// Type is Record<ZK30Horizon, number>, NOT Record<HorizonLabel, number>:
// the compiler will reject any code that tries to index H03Y+ into this map.

export const HORIZON_WEIGHTS_ZK30: Record<ZK30Horizon, number> = {
  H01Y: 0.70,
  H02Y: 0.30,
};

// ─── Weights (mode preset) ───────────────────────────────────────────────────
// Inherited from ZK6 balanced for v1.0. Re-tune via backtest post-launch.
// Only `balanced` shipped in v1.0; conservative/aggressive deferred to v2.0.

export const ZK30_WEIGHTS = {
  balanced: {
    BOX: 0.55,
    PBURST: 0.30,
    CO: 0.15,
  },
} as const;

export type ZK30Mode = keyof typeof ZK30_WEIGHTS;

// ─── Rails (30-pick design) ──────────────────────────────────────────────────
// Scaled 5× from ZK6's 6-pick design (4/2/0 → 18/9/3).
// Triples opened from 0 → 3 for 30-pick depth.

export const K30_QUOTAS = {
  singles: 18,
  doubles: 9,
  triples: 3,
} as const;

// Linear scale from ZK6's PAIR_REPETITION_CAP=2 (6 picks) × 5.
// Worth backtest validation post-v1.0.
export const PAIR_REPETITION_CAP_ZK30 = 10;

// ─── Match detection ─────────────────────────────────────────────────────────
// 4 match types per pick per draw; log every matched session.

export const ZK30_MATCH_TYPES = [
  'straight',
  'box',
  'fireball_straight',
  'fireball_box',
] as const;
export type ZK30MatchType = typeof ZK30_MATCH_TYPES[number];

// ─── Schedule ────────────────────────────────────────────────────────────────

export const ZK30_DRAW_DAYS = [1, 2, 3, 4, 5, 6] as const;  // Mon–Sat (Sunday=0 excluded)

// ─── Audit actions ───────────────────────────────────────────────────────────

export const ZK30_AUDIT_ACTIONS = {
  IMPORT_TX_RAW: 'import_tx_raw',
  AGGREGATE_TX_DATASETS: 'aggregate_tx_datasets',
  REGENERATE_ZK30_SLATE: 'regenerate_zk30_slate',
  RUN_ZK30_HIT_DETECTION: 'run_zk30_hit_detection',
} as const;
