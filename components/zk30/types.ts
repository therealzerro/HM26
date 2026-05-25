// Shared types for ZK30 UI components. Mirrors the snapshot pick shape
// emitted by engines/zk30.ts + compute-slate-zk30 edge fn, plus the
// hit annotations added by run-hit-detection-zk30.

export interface ZK30PickItem {
  rank: number;
  combo: string;
  comboSet: string;
  bestOrder?: string;
  energy: number;          // 0–100 percentile
  temperature?: number;    // back-compat alias for energy
  multiplicity?: 'singles' | 'doubles' | 'triples';
  topPair?: string;
  signals: { BOX: number; PBURST: number; CO: number; DGC?: number };
  drawsSince?: number | null;
  timesDrawn?: number;
  dsRaw?: number;
  lastSeen?: string | null;
  // Hit annotations (written by run-hit-detection-zk30 after a match).
  // Only the PRIMARY match per pick is on the snapshot — multi-session
  // matches live in adaptive_tracking_zk30 by design.
  hitType?: 'straight' | 'box' | 'fireball_straight' | 'fireball_box';
  hitSession?: 'Morning' | 'Day' | 'Evening' | 'Night' | string;
  hitDate?: string;
  hitResult?: string;        // 3-digit TX draw
  hitFireball?: string | null; // 1-digit
}

export type ZK30Snapshot = {
  id: string;
  slate_date: string;
  jurisdiction: string;
  scope: string;
  mode: string;
  engine_version: string;
  snapshot_hash: string;
  updated_at_et: string;
  top_k_straights_json: ZK30PickItem[] | string | null;
  /** Client-side flag — set by useZK30Snapshot when today's slate is
   *  missing and yesterday's is shown. Not a real column. */
  _isStale?: boolean;
};

/** Tile / row border-color encoding based on hit type. */
export function hitBorderColor(
  hitType: ZK30PickItem['hitType'] | undefined,
  fallback: string,
  colors: {
    success: string;
    gold: string;
    orange: string;
    amber: string;
  },
): string {
  switch (hitType) {
    case 'straight':          return colors.gold;
    case 'box':               return colors.success;
    case 'fireball_straight': return colors.orange;
    case 'fireball_box':      return colors.amber;
    default:                  return fallback;
  }
}

export function hitTypeLabel(t: ZK30PickItem['hitType']): string {
  switch (t) {
    case 'straight':          return 'STRAIGHT MATCH';
    case 'box':               return 'BOX MATCH';
    case 'fireball_straight': return 'FIREBALL STRAIGHT';
    case 'fireball_box':      return 'FIREBALL BOX';
    default:                  return '';
  }
}

export function hitTypeGlyph(t: ZK30PickItem['hitType']): string {
  switch (t) {
    case 'straight':          return '⭐';
    case 'box':               return '◆';
    case 'fireball_straight': return '🔥';
    case 'fireball_box':      return '🔥';
    default:                  return '';
  }
}

/** Energy → 5-tier label + tier color key. Mirrors EnergyMeter conventions. */
export function energyTier(e: number): {
  label: 'ON FIRE' | 'BLAZING' | 'HOT' | 'WARM' | 'COOL';
  key: 'hot' | 'amber' | 'orange' | 'gold' | 'cyan';
} {
  if (e >= 90) return { label: 'ON FIRE', key: 'hot' };
  if (e >= 80) return { label: 'BLAZING', key: 'amber' };
  if (e >= 65) return { label: 'HOT',     key: 'orange' };
  if (e >= 45) return { label: 'WARM',    key: 'gold' };
  return         { label: 'COOL',    key: 'cyan' };
}
